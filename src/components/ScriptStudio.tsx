"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Film,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  Pause,
  Palette,
  Play,
  Plus,
  ImageIcon,
  Languages,
  LayoutPanelTop,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_OUTLINE_OPTIONS,
  readOutlineOptions,
  writeOutlineOptions,
  type OutlineBeatLength,
  type OutlineOptions,
} from "@/lib/script-outline-options";
import type { Project } from "@/lib/db/schema";
import {
  computeScriptStats,
  NARRATOR_PREVIEW_TARGET_SECONDS,
  resolveScriptNarrator,
  sanitizeScriptDraftNotesForApi,
  buildNarratorPreviewText,
  countResearchItemsAdded,
  countScriptStructure,
  countParagraphVideosImported,
  paragraphImageSearchForSpeech,
  type ScriptDraftNotes,
  type ScriptDraftStatus,
  type ScriptPronunciationHint,
  type ScriptResearchItem,
  type ScriptVersionMeta,
} from "@/lib/script-studio";
import { appendScriptSection, removeScriptSectionAtMarkerIndex } from "@/lib/script-sections";
import { countPronunciationHintsInScript } from "@/lib/script-pronunciation";
import { countParagraphImagesImported } from "@/lib/script-image-search-server";
import {
  KOKORO_VOICE_OPTIONS,
  getDefaultTtsVoiceForModel,
  voiceLabelForModel,
  voiceOptionsForTtsModel,
} from "@/lib/project-api-models";
import { getVideoFormatSpec } from "@/lib/video-format";
import { ScriptDocument } from "@/components/ScriptDocument";
import { ScriptNarrationBar } from "@/components/ScriptNarrationBar";
import { ScriptNarrationHeaderControls } from "@/components/ScriptNarrationHeaderControls";
import { ScriptVersionsPopover } from "@/components/ScriptVersionsPopover";
import { ScriptDurationInsightsPopover } from "@/components/ScriptDurationInsightsPopover";
import { normalizeTtsSpeed } from "@/lib/narration-speed";
import {
  mergeElevenLabsVoiceSettings,
  mergeKokoroVoiceSettings,
  resolveElevenLabsVoiceSettings,
  resolveKokoroVoiceSettings,
  serializeTtsVoiceSettings,
  type ElevenLabsVoiceSettings,
  type KokoroVoiceSettings,
} from "@/lib/elevenlabs-voice-settings";
import { buildSegmentBudgetAlerts } from "@/lib/script-budget";
import {
  appendPauseToScript,
  formatPauseLine,
  PAUSE_PRESET_SECONDS,
} from "@/lib/script-pause";
import type { ScriptMusicPauseInsertion } from "@/lib/script-music-pauses";
import {
  listScriptSpeechParagraphs,
  narrationClipForSpeechIndex,
} from "@/lib/script-narration-utils";
import type { ScriptSuggestion } from "@/lib/script-studio";

const QUICK_REVIEWS = [
  { label: "Review hook", value: "Focus on the opening hook — is it strong enough to hold attention?" },
  { label: "Review pacing", value: "Review pacing and length — does each paragraph earn its place?" },
  { label: "Review tone", value: "Review tone and voice — does it match the project genre and feel speakable?" },
  { label: "Review clarity", value: "Mark unclear or awkward phrases that a narrator would stumble on." },
  { label: "Review emotion", value: "Where could the emotional beat land harder without adding length?" },
  { label: "Review ending", value: "Review the closing — does it land with impact?" },
];

const SIDEBAR_SECTION_IDS = [
  "source",
  "review",
  "delivery",
  "pauses",
  "pronunciation",
  "reference-images",
  "style",
  "actions",
] as const;

const SIDEBAR_STORAGE_PREFIX = "imagine-script-studio:section";
const EDITOR_LAYOUT_STORAGE_KEY = "imagine-script-studio:editor-layout";

type ScriptEditorWidth = "standard" | "wide" | "full";
type ScriptEditorDensity = "comfortable" | "compact";

interface ScriptEditorLayoutPrefs {
  width: ScriptEditorWidth;
  focus: boolean;
  density: ScriptEditorDensity;
}

const EDITOR_WIDTH_CLASS: Record<ScriptEditorWidth, string> = {
  standard: "max-w-[760px]",
  wide: "max-w-[1100px]",
  full: "max-w-none",
};

const EDITOR_WIDTH_LABEL: Record<ScriptEditorWidth, string> = {
  standard: "Standard",
  wide: "Wide",
  full: "Full width",
};

const DEFAULT_EDITOR_LAYOUT: ScriptEditorLayoutPrefs = {
  width: "wide",
  focus: false,
  density: "comfortable",
};

function readEditorLayout(): ScriptEditorLayoutPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_EDITOR_LAYOUT;
  }
  try {
    const raw = window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<ScriptEditorLayoutPrefs>;
    return {
      width:
        parsed.width === "standard" || parsed.width === "wide" || parsed.width === "full"
          ? parsed.width
          : "wide",
      focus: parsed.focus === true,
      density: parsed.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return DEFAULT_EDITOR_LAYOUT;
  }
}

function writeEditorLayout(prefs: ScriptEditorLayoutPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function readSectionCollapsed(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${SIDEBAR_STORAGE_PREFIX}:${key}`);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore
  }
  return fallback;
}

function writeSectionCollapsed(key: string, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${SIDEBAR_STORAGE_PREFIX}:${key}`, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

interface SidebarSectionProps {
  id: (typeof SIDEBAR_SECTION_IDS)[number];
  icon?: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  defaultCollapsed?: boolean;
  layoutEpoch?: number;
  variant?: "default" | "accent";
  children: React.ReactNode;
}

function SidebarSection({
  id,
  icon,
  title,
  summary,
  defaultCollapsed = false,
  layoutEpoch = 0,
  variant = "default",
  children,
}: SidebarSectionProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    setCollapsed(readSectionCollapsed(id, defaultCollapsed));
  }, [id, defaultCollapsed, layoutEpoch]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSectionCollapsed(id, next);
      return next;
    });
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-md border",
        variant === "accent"
          ? "border-accent/30 bg-accent/5"
          : "border-border bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        {icon}
        <h3 className="flex-1 text-sm font-semibold">{title}</h3>
        {summary && (
          <span className="shrink-0 text-2xs text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-2">{children}</div>
      )}
    </section>
  );
}

interface Props {
  project: Project;
  script: string;
  notes: ScriptDraftNotes;
  status: ScriptDraftStatus;
  hasBlocks: boolean;
  onScriptChange: (script: string) => void;
  onNotesChange: (notes: ScriptDraftNotes) => void;
  onStatusChange: (status: ScriptDraftStatus) => void;
  /** Called after Apply created blocks so the parent can refresh + switch view. */
  onAppliedToTimeline: () => void | Promise<void>;
  /** Called after narrator suggestion / TTS settings are pushed to the project. */
  onProjectChanged: (patch: Partial<Project>) => void;
  /** Same as timeline Story — generates blocks + syncs narration into the script editor. */
  onGenerateStory?: () => void | Promise<void>;
  storyBusy?: boolean;
  /** Opens a Script Studio sidebar section (workflow rail). */
  focusSectionId?: string | null;
  onFocusSectionHandled?: () => void;
}

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? "Empty server response" : `Server error (${res.status})`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
      throw new Error(
        res.ok
          ? "Invalid server response"
          : `Server error (${res.status}). Try restarting the dev server (rm -rf .next && npm run dev).`,
      );
    }
    throw new Error(
      res.ok
        ? "Invalid server response"
        : `Server error (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

function severityBadgeVariant(
  severity: ScriptSuggestion["severity"],
): "destructive" | "warning" | "outline" {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "warning";
  return "outline";
}

export function ScriptStudio({
  project,
  script,
  notes,
  status,
  hasBlocks,
  onScriptChange,
  onNotesChange,
  onStatusChange,
  onAppliedToTimeline,
  onProjectChanged,
  onGenerateStory,
  storyBusy = false,
  focusSectionId = null,
  onFocusSectionHandled,
}: Props) {
  const { toast } = useToast();
  const setScript = onScriptChange;
  const setNotes = onNotesChange;
  const setStatus = onStatusChange;

  const [generating, setGenerating] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [analyzingDelivery, setAnalyzingDelivery] = React.useState(false);
  const [analyzingPronunciation, setAnalyzingPronunciation] = React.useState(false);
  const [analyzingMusicPauses, setAnalyzingMusicPauses] = React.useState(false);
  const [researchingWeb, setResearchingWeb] = React.useState(false);
  const [searchingSpeechIndex, setSearchingSpeechIndex] = React.useState<number | null>(null);
  const [searchingPauseIndex, setSearchingPauseIndex] = React.useState<number | null>(null);
  const [searchingVideoSpeechIndex, setSearchingVideoSpeechIndex] = React.useState<
    number | "all" | null
  >(null);
  const [importingImages, setImportingImages] = React.useState(false);
  const [aiPickingSpeechIndex, setAiPickingSpeechIndex] = React.useState<number | "all" | null>(
    null,
  );
  const [generatingParagraphImageIndex, setGeneratingParagraphImageIndex] = React.useState<
    number | null
  >(null);
  const [useWebResearch, setUseWebResearch] = React.useState(true);
  const [applyingFix, setApplyingFix] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [renderingMp3, setRenderingMp3] = React.useState(false);
  const [exportingManifest, setExportingManifest] = React.useState(false);
  const [instruction, setInstruction] = React.useState("");
  const [mp3Url, setMp3Url] = React.useState<string | null>(null);
  const [mp3Filename, setMp3Filename] = React.useState<string | null>(null);
  const [versions, setVersions] = React.useState<ScriptVersionMeta[]>([]);
  const [currentVersion, setCurrentVersion] = React.useState<number | null>(
    project.scriptDraftVersion ?? null,
  );
  const [restoringVersion, setRestoringVersion] = React.useState<number | null>(null);
  const [activeSuggestionId, setActiveSuggestionId] = React.useState<string | null>(null);
  const [showHighlights, setShowHighlights] = React.useState(true);
  const [showDeliveryEmphasis, setShowDeliveryEmphasis] = React.useState(true);
  const [sidebarLayoutEpoch, setSidebarLayoutEpoch] = React.useState(0);

  React.useEffect(() => {
    if (!focusSectionId) return;
    if (!(SIDEBAR_SECTION_IDS as readonly string[]).includes(focusSectionId)) return;
    writeSectionCollapsed(focusSectionId, false);
    setSidebarLayoutEpoch((epoch) => epoch + 1);
    onFocusSectionHandled?.();
  }, [focusSectionId, onFocusSectionHandled]);

  const [editorLayout, setEditorLayout] =
    React.useState<ScriptEditorLayoutPrefs>(DEFAULT_EDITOR_LAYOUT);
  const [editorLayoutReady, setEditorLayoutReady] = React.useState(false);
  const [previewingNarrator, setPreviewingNarrator] = React.useState(false);
  const [measuredAudioSeconds, setMeasuredAudioSeconds] = React.useState<number | null>(null);
  const [narratorPreviewUrl, setNarratorPreviewUrl] = React.useState<string | null>(null);
  const narratorPreviewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [outlineOptions, setOutlineOptions] =
    React.useState<OutlineOptions>(DEFAULT_OUTLINE_OPTIONS);
  const [outlineOptionsReady, setOutlineOptionsReady] = React.useState(false);
  const [activeSpeechIndex, setActiveSpeechIndex] = React.useState<number | null>(null);
  const [narrationPlaying, setNarrationPlaying] = React.useState(false);
  const [generatingSpeechIndex, setGeneratingSpeechIndex] = React.useState<number | null>(null);
  const [generatingAllNarration, setGeneratingAllNarration] = React.useState(false);
  const narrationAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const scriptScrollRef = React.useRef<HTMLDivElement | null>(null);
  const playSessionRef = React.useRef<{
    indices: number[];
    current: number;
    aborted: boolean;
    skipRequested: boolean;
  } | null>(null);

  React.useEffect(() => {
    setOutlineOptions(readOutlineOptions());
    setOutlineOptionsReady(true);
  }, []);

  React.useEffect(() => {
    if (!outlineOptionsReady) return;
    writeOutlineOptions(outlineOptions);
  }, [outlineOptions, outlineOptionsReady]);

  React.useEffect(() => {
    setEditorLayout(readEditorLayout());
    setEditorLayoutReady(true);
  }, []);

  const prunedScriptMediaRef = React.useRef(false);
  React.useEffect(() => {
    if (prunedScriptMediaRef.current) return;
    prunedScriptMediaRef.current = true;
    void fetch(`/api/projects/${project.id}/script/media/prune`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ prunedCount?: number; notes?: ScriptDraftNotes }>;
      })
      .then((data) => {
        if (data?.prunedCount && data.notes) {
          setNotes(data.notes);
        }
      })
      .catch(() => {});
  }, [project.id, setNotes]);

  React.useEffect(() => {
    if (!editorLayoutReady) return;
    writeEditorLayout(editorLayout);
  }, [editorLayout, editorLayoutReady]);

  React.useEffect(() => {
    if (!editorLayout.focus) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setEditorLayout((prev) => ({ ...prev, focus: false }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorLayout.focus]);

  function patchOutlineOptions(patch: Partial<OutlineOptions>) {
    setOutlineOptions((prev) => ({ ...prev, ...patch }));
  }

  function cycleEditorWidth() {
    setEditorLayout((prev) => {
      const order: ScriptEditorWidth[] = ["standard", "wide", "full"];
      const idx = order.indexOf(prev.width);
      return { ...prev, width: order[(idx + 1) % order.length]! };
    });
  }

  function toggleEditorFocus() {
    setEditorLayout((prev) => ({ ...prev, focus: !prev.focus }));
  }

  function toggleEditorDensity() {
    setEditorLayout((prev) => ({
      ...prev,
      density: prev.density === "comfortable" ? "compact" : "comfortable",
    }));
  }

  const showSidebar = !editorLayout.focus;
  const editorMaxWidth =
    editorLayout.focus || editorLayout.width === "full"
      ? "max-w-none"
      : EDITOR_WIDTH_CLASS[editorLayout.width];

  const review = notes.review;
  const delivery = notes.delivery;
  const pronunciation = notes.pronunciation;
  const musicPauses = notes.musicPauses;
  const research = notes.research;
  const researchAdded = React.useMemo(
    () => countResearchItemsAdded(research),
    [research],
  );
  const paragraphClips = notes.paragraphNarration ?? [];
  const paragraphImages = notes.paragraphImages ?? [];
  const imagesImported = React.useMemo(() => {
    let imported = 0;
    let total = 0;
    for (const entry of paragraphImages) {
      const counts = countParagraphImagesImported(entry);
      imported += counts.imported;
      total += counts.total;
    }
    return { imported, total };
  }, [paragraphImages]);
  const suggestions = review?.suggestions ?? [];

  const speechParagraphs = React.useMemo(() => listScriptSpeechParagraphs(script), [script]);
  const videosImported = React.useMemo(() => {
    let imported = 0;
    for (const entry of paragraphImages) {
      imported += countParagraphVideosImported(entry).imported;
    }
    return { imported, total: speechParagraphs.length };
  }, [paragraphImages, speechParagraphs.length]);
  const narrationReadyCount = React.useMemo(
    () =>
      speechParagraphs.filter((p) =>
        narrationClipForSpeechIndex(paragraphClips, p.speechIndex, p.textKey),
      ).length,
    [speechParagraphs, paragraphClips],
  );
  const pronunciationHintCount = React.useMemo(
    () => countPronunciationHintsInScript(script, pronunciation?.hints),
    [script, pronunciation?.hints],
  );

  const dirtyRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAFT_SAVE_MS = 700;
  const VERSION_IDLE_MS = 12_000;
  const voiceSaveSeqRef = React.useRef(0);
  const notesRef = React.useRef(notes);
  notesRef.current = notes;
  const scriptRef = React.useRef(script);
  scriptRef.current = script;
  const projectRef = React.useRef(project);
  projectRef.current = project;

  function notesAlignedWithProject(
    baseNotes: ScriptDraftNotes,
    projectRow: Pick<
      Project,
      "voiceTone" | "ttsModel" | "ttsVoice" | "llmModel" | "imageModel" | "videoModel"
    > = projectRef.current,
  ): ScriptDraftNotes {
    const voice = resolveScriptNarrator(projectRow, baseNotes);
    return {
      ...baseNotes,
      narrator: {
        ...voice,
        rationale: baseNotes.narrator?.rationale ?? voice.rationale,
        deliveryNotes: baseNotes.narrator?.deliveryNotes ?? voice.deliveryNotes,
      },
    };
  }

  function syncFromScriptApi(
    data: {
      notes?: ScriptDraftNotes;
      status?: ScriptDraftStatus;
      currentVersion?: number | null;
      versions?: ScriptVersionMeta[];
    },
    options?: { includeNotes?: boolean },
  ) {
    if (options?.includeNotes !== false && data.notes) {
      const synced = notesAlignedWithProject(data.notes);
      notesRef.current = synced;
      setNotes(synced);
    }
    if (data.status) setStatus(data.status);
    if (data.currentVersion !== undefined) setCurrentVersion(data.currentVersion);
    if (data.versions) setVersions(data.versions);
  }

  const loadScriptMeta = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      syncFromScriptApi(data, { includeNotes: false });
    } catch {
      // ignore
    }
  }, [project.id]);

  React.useEffect(() => {
    void loadScriptMeta();
  }, [loadScriptMeta]);

  const stats = React.useMemo(() => computeScriptStats(script), [script]);
  const scriptStructure = React.useMemo(() => countScriptStructure(script), [script]);
  const segmentAlerts = React.useMemo(
    () => buildSegmentBudgetAlerts(script, project.targetDurationSeconds ?? 30),
    [script, project.targetDurationSeconds],
  );
  const formatSpec = getVideoFormatSpec(project.videoFormat);

  const isEmpty = script.trim().length === 0;
  const canApply = !isEmpty && !applying && !generating;
  const narrationComplete =
    speechParagraphs.length > 0 && narrationReadyCount === speechParagraphs.length;
  const canDownloadMp3 = !isEmpty && !renderingMp3 && !generating && narrationComplete;
  const canExportManifest =
    !isEmpty &&
    !exportingManifest &&
    !generating &&
    narrationReadyCount > 0 &&
    !renderingMp3;

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (versionTimerRef.current) clearTimeout(versionTimerRef.current);
      narrationAudioRef.current?.pause();
      playSessionRef.current = null;
    };
  }, []);

  function scheduleVersionCheckpoint() {
    if (versionTimerRef.current) clearTimeout(versionTimerRef.current);
    versionTimerRef.current = setTimeout(() => {
      versionTimerRef.current = null;
      void persistScript(scriptRef.current, {
        sourceMode: "edited",
        versionSource: "autosave",
        silent: true,
      });
    }, VERSION_IDLE_MS);
  }

  function scheduleSave(nextScript: string) {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistScript(nextScript, { sourceMode: "edited", silent: true });
    }, DRAFT_SAVE_MS);
    scheduleVersionCheckpoint();
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (versionTimerRef.current) {
      clearTimeout(versionTimerRef.current);
      versionTimerRef.current = null;
    }
    if (!script.trim()) return;
    await persistScript(script, { sourceMode: "edited", silent: true });
    if (dirtyRef.current) {
      await persistScript(script, {
        sourceMode: "edited",
        versionSource: "autosave",
        silent: true,
      });
    }
  }

  async function persistScript(
    text: string,
    extra?: {
      sourceMode?: "ai" | "pasted" | "edited";
      checkpoint?: boolean;
      versionSource?: "paste" | "manual_checkpoint" | "autosave";
      silent?: boolean;
    },
  ) {
    setSaving(true);
    try {
      const mergedNotes: ScriptDraftNotes = sanitizeScriptDraftNotesForApi(
        notesAlignedWithProject({
          ...notesRef.current,
          ...(extra?.sourceMode ? { sourceMode: extra.sourceMode } : {}),
        }),
      );
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: text,
          notes: mergedNotes,
          checkpoint: extra?.checkpoint,
          versionSource: extra?.versionSource,
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to save");
      syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
      dirtyRef.current = false;
      return data;
    } catch (err) {
      if (!extra?.silent) {
        toast({
          variant: "destructive",
          title: "Could not save script",
          description: err instanceof Error ? err.message : "Unknown",
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreVersion(version: number) {
    if (restoringVersion !== null) return;
    if (
      dirtyRef.current &&
      !confirm(`Restore v${version}? Unsaved edits to the current draft will be lost.`)
    ) {
      return;
    }
    if (!dirtyRef.current && !confirm(`Restore script to version v${version}?`)) {
      return;
    }
    setRestoringVersion(version);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/script/versions/${version}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setScript(data.script ?? "");
      syncFromScriptApi(data);
      toast({
        variant: "success",
        title: `Restored v${version}`,
        description: data.versionCreated
          ? `Now at v${data.versionCreated} (restore snapshot).`
          : undefined,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not restore version",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setRestoringVersion(null);
    }
  }

  function handleScriptChange(next: string) {
    if (
      next !== script &&
      (notes.review || notes.delivery || notes.pronunciation || notes.paragraphNarration?.length)
    ) {
      setNotes({
        ...notes,
        review: undefined,
        delivery: undefined,
        pronunciation: undefined,
        paragraphNarration: undefined,
      });
      setActiveSuggestionId(null);
    }
    setScript(next);
    scheduleSave(next);
  }

  async function requestParagraphNarration(speechIndex: number, force = false) {
    const res = await fetch(`/api/projects/${project.id}/script/narration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, speechIndex, force }),
    });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error((data.error as string) ?? "Narration failed");
    if (data.notes) setNotes(data.notes as ScriptDraftNotes);
    return data;
  }

  async function runParagraphNarration(speechIndex?: number, force = false) {
    if (isEmpty) {
      toast({ variant: "destructive", title: "Paste or write a script first" });
      return;
    }
    const isSingle = speechIndex !== undefined;
    if (isSingle) setGeneratingSpeechIndex(speechIndex);
    else setGeneratingAllNarration(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (isSingle) {
        await requestParagraphNarration(speechIndex, force);
        writeSectionCollapsed("reference-images", false);
        setSidebarLayoutEpoch((n) => n + 1);
        toast({
          variant: "success",
          title: force ? "Paragraph re-narrated" : "Paragraph narrated",
          description: `¶ ${speechIndex + 1} ready`,
        });
        return;
      }

      const paragraphs = listScriptSpeechParagraphs(script);
      let clips = notesRef.current.paragraphNarration ?? [];
      const generated: number[] = [];
      for (const paragraph of paragraphs) {
        if (
          !force &&
          narrationClipForSpeechIndex(clips, paragraph.speechIndex, paragraph.textKey)
        ) {
          continue;
        }
        setGeneratingSpeechIndex(paragraph.speechIndex);
        const data = await requestParagraphNarration(paragraph.speechIndex, force);
        generated.push(paragraph.speechIndex);
        clips = (data.notes as ScriptDraftNotes | undefined)?.paragraphNarration ?? clips;
      }

      writeSectionCollapsed("reference-images", false);
      setSidebarLayoutEpoch((n) => n + 1);
      const readyCount = listScriptSpeechParagraphs(script).filter((p) =>
        narrationClipForSpeechIndex(clips, p.speechIndex, p.textKey),
      ).length;
      toast({
        variant: "success",
        title: generated.length > 0 ? "Narration updated" : "All paragraphs ready",
        description:
          generated.length > 0
            ? `${generated.length} paragraph(s) generated · ${readyCount}/${paragraphs.length} ready`
            : `${readyCount}/${paragraphs.length} paragraphs already had audio`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Narration failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGeneratingSpeechIndex(null);
      setGeneratingAllNarration(false);
    }
  }

  function playClipUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      narrationAudioRef.current = audio;
      const finish = () => {
        audio.removeEventListener("pause", onPause);
        resolve();
      };
      const onPause = () => {
        if (playSessionRef.current?.skipRequested) {
          playSessionRef.current.skipRequested = false;
          finish();
        }
      };
      audio.addEventListener("pause", onPause);
      audio.onended = finish;
      audio.onerror = () => {
        audio.removeEventListener("pause", onPause);
        reject(new Error("Playback failed"));
      };
      void audio.play().catch((err) => {
        audio.removeEventListener("pause", onPause);
        reject(err);
      });
    });
  }

  function stopNarration(resetHighlight = true) {
    if (playSessionRef.current) playSessionRef.current.aborted = true;
    narrationAudioRef.current?.pause();
    narrationAudioRef.current = null;
    playSessionRef.current = null;
    setNarrationPlaying(false);
    if (resetHighlight) setActiveSpeechIndex(null);
  }

  async function playAllNarration(fromSpeechIndex?: number) {
    const paragraphs = listScriptSpeechParagraphs(script);
    const playable = paragraphs
      .map((p, listIndex) => ({ ...p, listIndex }))
      .filter((p) => narrationClipForSpeechIndex(paragraphClips, p.speechIndex, p.textKey));

    if (playable.length === 0) {
      toast({
        variant: "destructive",
        title: "No narration yet",
        description: "Generate paragraph narration first.",
      });
      return;
    }

    const startAt =
      fromSpeechIndex !== undefined
        ? Math.max(
            0,
            playable.findIndex((p) => p.speechIndex === fromSpeechIndex),
          )
        : 0;

    playSessionRef.current = {
      indices: playable.map((p) => p.listIndex),
      current: startAt,
      aborted: false,
      skipRequested: false,
    };
    setNarrationPlaying(true);

    while (playSessionRef.current && !playSessionRef.current.aborted) {
      const session = playSessionRef.current;
      const listIndex = session.indices[session.current];
      if (listIndex === undefined) break;

      const paragraph = paragraphs[listIndex];
      if (!paragraph) break;

      const clip = narrationClipForSpeechIndex(
        paragraphClips,
        paragraph.speechIndex,
        paragraph.textKey,
      );
      if (!clip) break;

      setActiveSpeechIndex(paragraph.speechIndex);
      try {
        await playClipUrl(clip.audioUrl);
      } catch {
        break;
      }

      if (!playSessionRef.current || playSessionRef.current.aborted) break;
      playSessionRef.current.current += 1;
      if (playSessionRef.current.current >= playSessionRef.current.indices.length) break;
    }

    stopNarration(true);
  }

  async function playSingleParagraph(speechIndex: number) {
    const paragraph = speechParagraphs.find((p) => p.speechIndex === speechIndex);
    if (!paragraph) return;
    const clip = narrationClipForSpeechIndex(
      paragraphClips,
      paragraph.speechIndex,
      paragraph.textKey,
    );
    if (!clip) {
      toast({
        variant: "destructive",
        title: "Not narrated yet",
        description: "Use ↻ at the end of the paragraph or Generate all in the sidebar.",
      });
      return;
    }

    stopNarration(false);
    setNarrationPlaying(true);
    setActiveSpeechIndex(speechIndex);
    try {
      await playClipUrl(clip.audioUrl);
    } catch {
      toast({ variant: "destructive", title: "Could not play paragraph" });
    } finally {
      setNarrationPlaying(false);
      setActiveSpeechIndex(null);
    }
  }

  function skipNarration(delta: -1 | 1) {
    const session = playSessionRef.current;
    if (!session || !narrationPlaying) return;
    const next = session.current + delta;
    if (next < 0 || next >= session.indices.length) return;
    session.current = next;
    session.skipRequested = true;
    narrationAudioRef.current?.pause();
  }

  async function runDeliveryAnalysis() {
    if (isEmpty) {
      toast({ variant: "destructive", title: "Paste or write a script first" });
      return;
    }
    setAnalyzingDelivery(true);
    try {
      await flushPendingSave();
      const res = await fetch(`/api/projects/${project.id}/script/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delivery analysis failed");
      if (data.notes) setNotes(data.notes);
      setShowDeliveryEmphasis(true);
      writeSectionCollapsed("delivery", false);
      setSidebarLayoutEpoch((n) => n + 1);
      toast({
        variant: "success",
        title: delivery ? "Delivery updated" : "Delivery analyzed",
        description: `${data.delivery?.spans?.length ?? 0} phrase(s) marked for intonation.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delivery analysis failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setAnalyzingDelivery(false);
    }
  }

  async function runPronunciationAnalysis() {
    if (isEmpty) {
      toast({ variant: "destructive", title: "Paste or write a script first" });
      return;
    }
    setAnalyzingPronunciation(true);
    try {
      await flushPendingSave();
      const res = await fetch(`/api/projects/${project.id}/script/pronunciation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = (await readJsonResponse(res)) as {
        error?: string;
        notes?: ScriptDraftNotes;
        pronunciation?: { hints?: ScriptPronunciationHint[] };
      };
      if (!res.ok) throw new Error(data.error ?? "Pronunciation analysis failed");
      if (data.notes) setNotes(data.notes as ScriptDraftNotes);
      writeSectionCollapsed("pronunciation", false);
      setSidebarLayoutEpoch((n) => n + 1);
      toast({
        variant: "success",
        title: pronunciation ? "Pronunciation updated" : "Pronunciation analyzed",
        description: `${data.pronunciation?.hints?.length ?? 0} term(s) — re-narrate paragraphs to hear the fix.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Pronunciation analysis failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setAnalyzingPronunciation(false);
    }
  }

  async function runAutoMusicPauses() {
    if (isEmpty) {
      toast({ variant: "destructive", title: "Paste or write a script first" });
      return;
    }
    setAnalyzingMusicPauses(true);
    try {
      await flushPendingSave();
      const res = await fetch(`/api/projects/${project.id}/script/music-pauses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, replaceExisting: true }),
      });
      const data = (await readJsonResponse(res)) as {
        error?: string;
        script?: string;
        appliedCount?: number;
        notes?: ScriptDraftNotes;
        status?: ScriptDraftStatus;
        currentVersion?: number | null;
        versions?: ScriptVersionMeta[];
      };
      if (!res.ok) throw new Error(data.error ?? "Music pause placement failed");
      setScript(data.script ?? script);
      syncFromScriptApi(data);
      writeSectionCollapsed("pauses", false);
      setSidebarLayoutEpoch((n) => n + 1);
      toast({
        variant: "success",
        title: "Music moments placed",
        description: `${data.appliedCount ?? 0} pause${data.appliedCount === 1 ? "" : "s"} added across the script. Apply to timeline when ready.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Auto music moments failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setAnalyzingMusicPauses(false);
    }
  }

  async function persistPronunciationHints(hints: ScriptPronunciationHint[]) {
    const existing = notesRef.current.pronunciation;
    if (!existing) return;
    const updated: ScriptDraftNotes = {
      ...notesRef.current,
      pronunciation: { ...existing, hints },
      paragraphNarration: undefined,
      updatedAt: new Date().toISOString(),
    };
    setNotes(updated);
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, notes: updated }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to save pronunciation");
      syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save pronunciation",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function clearAllPronunciation() {
    if (
      !confirm(
        "Remove all pronunciation hints? Narration will use the original script spelling again.",
      )
    ) {
      return;
    }
    const updated: ScriptDraftNotes = {
      ...notesRef.current,
      pronunciation: undefined,
      paragraphNarration: undefined,
      updatedAt: new Date().toISOString(),
    };
    setNotes(updated);
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, notes: updated }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to clear pronunciation");
      syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
      toast({
        variant: "success",
        title: "Pronunciation removed",
        description: "Re-narrate paragraphs to restore original spelling in audio.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not clear pronunciation",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  function removePronunciationHint(hintId: string) {
    if (!pronunciation) return;
    const hints = pronunciation.hints.filter((h) => h.id !== hintId);
    if (hints.length === 0) {
      void clearAllPronunciation();
      return;
    }
    void persistPronunciationHints(hints);
    toast({
      variant: "success",
      title: "Hint removed",
      description: "Re-narrate affected paragraphs to update audio.",
    });
  }

  function handlePronunciationSpokenBlur(hintId: string, spoken: string) {
    if (!pronunciation) return;
    const trimmed = spoken.trim();
    const current = pronunciation.hints.find((h) => h.id === hintId);
    if (!current || trimmed === current.spoken || trimmed.length < 2) return;
    const hints = pronunciation.hints.map((h) =>
      h.id === hintId ? { ...h, spoken: trimmed.slice(0, 120) } : h,
    );
    void persistPronunciationHints(hints);
    toast({
      variant: "success",
      title: "Pronunciation saved",
      description: "Re-narrate affected paragraphs (↻) to update audio.",
    });
  }

  async function runReview(instructionText?: string) {
    const trimmed = instructionText?.trim();
    if (isEmpty) {
      toast({ variant: "destructive", title: "Paste or write a script first" });
      return;
    }
    setReviewing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: trimmed || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      if (data.notes) setNotes(data.notes);
      setActiveSuggestionId(data.review?.suggestions?.[0]?.id ?? null);
      setShowHighlights(true);
      setInstruction("");
      writeSectionCollapsed("review", false);
      setSidebarLayoutEpoch((n) => n + 1);
      toast({
        variant: "success",
        title: "Review ready",
        description: `${data.review?.suggestions?.length ?? 0} improvement point(s) marked in the document.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setReviewing(false);
    }
  }

  async function applyFix(
    instruction: string,
    opts?: { focusQuotes?: string[]; suggestionId?: string },
  ): Promise<string | null> {
    setApplyingFix(true);
    try {
      await flushPendingSave();
      const res = await fetch(`/api/projects/${project.id}/script/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim().slice(0, 16_000),
          focusQuotes: opts?.focusQuotes
            ?.map((q) => q.trim().slice(0, 500))
            .filter(Boolean)
            .slice(0, 12),
          suggestionId: opts?.suggestionId?.trim().slice(0, 20),
          script,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      setScript(data.script ?? "");
      syncFromScriptApi(data);
      setActiveSuggestionId(null);
      toast({
        variant: "success",
        title: data.versionCreated ? `Updated · v${data.versionCreated}` : "Script updated",
        description: data.changeSummary || "Targeted edits applied to your draft.",
      });
      return (data.script as string) ?? script;
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not apply fix",
        description: err instanceof Error ? err.message : "Unknown",
      });
      return null;
    } finally {
      setApplyingFix(false);
    }
  }

  async function applySuggestion(s: ScriptSuggestion) {
    await applyFix(
      `${s.recommendation} (Issue: ${s.issue})`,
      { focusQuotes: [s.quote], suggestionId: s.id },
    );
  }

  async function applyAllSuggestions() {
    if (suggestions.length === 0) return;
    const bulletList = suggestions
      .map((s, i) => `${i + 1}. "${s.quote}" — ${s.recommendation}`)
      .join("\n");
    await applyFix(
      `Apply these editorial fixes to the EXISTING script. Edit in place — do not rewrite from scratch:\n${bulletList}`,
      { focusQuotes: suggestions.map((s) => s.quote) },
    );
  }

  async function persistResearchMarks(
    itemIds: string[],
    scriptText: string,
    baseResearch = notesRef.current.research,
  ) {
    const existing = baseResearch;
    if (!existing || itemIds.length === 0) return;
    const now = new Date().toISOString();
    const idSet = new Set(itemIds);
    const updated: ScriptDraftNotes = {
      ...notesRef.current,
      research: {
        ...existing,
        facts: existing.facts.map((f) =>
          idSet.has(f.id) ? { ...f, addedAt: f.addedAt ?? now } : f,
        ),
        curiosities: existing.curiosities.map((c) =>
          idSet.has(c.id) ? { ...c, addedAt: c.addedAt ?? now } : c,
        ),
      },
      updatedAt: now,
    };
    setNotes(updated);
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptText, notes: updated }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to save");
      syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
    } catch {
      // notes already updated locally; non-fatal
    }
  }

  async function insertResearchItem(item: ScriptResearchItem, kind: "fact" | "curiosity") {
    if (item.addedAt) return;
    if (!script.trim()) {
      toast({
        variant: "destructive",
        title: "Write or generate a script first",
        description: "Then add web facts one at a time into the right paragraph.",
      });
      return;
    }
    const updatedScript = await applyFix(
      `Add this verified ${kind} to the EXISTING script — weave ONE short speakable sentence into the paragraph where it fits best (same place/topic). Do not dump facts at the end or break paragraph order.\n\n${kind === "fact" ? "Fact" : "Curiosity"}: "${item.text}"${item.sourceTitle ? `\nSource: ${item.sourceTitle}` : ""}`,
    );
    if (updatedScript) await persistResearchMarks([item.id], updatedScript, research ?? undefined);
  }

  async function insertAllResearchFacts() {
    if (!research || !script.trim()) {
      toast({ variant: "destructive", title: "Need a script and saved research first" });
      return;
    }
    const pending = [...research.facts, ...research.curiosities].filter((i) => !i.addedAt);
    if (pending.length === 0) {
      toast({ title: "All items already added to the script" });
      return;
    }
    const list = pending.map((item, i) => `${i + 1}. ${item.text}`).join("\n");
    const updatedScript = await applyFix(
      `Weave these verified web findings into the EXISTING script — each in the paragraph where it fits (same topic/place). One short sentence per item max; skip any that do not fit without forcing. Do not append a facts block at the end.\n\n${list}`,
    );
    if (updatedScript) await persistResearchMarks(pending.map((i) => i.id), updatedScript, research);
  }

  async function runWebResearch() {
    setResearchingWeb(true);
    try {
      await flushPendingSave();
      const res = await fetch(`/api/projects/${project.id}/script/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: script.trim() || undefined }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Web research failed");
      if (data.notes) setNotes(data.notes as ScriptDraftNotes);
      const r = data.research as { facts?: unknown[]; curiosities?: unknown[]; provider?: string };
      toast({
        variant: "success",
        title: "Web research ready",
        description: `${r?.facts?.length ?? 0} facts · ${r?.curiosities?.length ?? 0} curiosities (${r?.provider ?? "web"})`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Web research failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setResearchingWeb(false);
    }
  }

  async function handleRemoveSection(markerIndex: number) {
    const next = removeScriptSectionAtMarkerIndex(script, markerIndex);
    if (next === script.trim()) return;
    setScript(next);
    await persistScript(next, {
      sourceMode: "edited",
      versionSource: "autosave",
    });
    toast({
      variant: "success",
      title: "Chapter marker removed",
    });
  }

  async function handleInsertSection() {
    const sectionCount = countScriptStructure(script).sections;
    const title = window.prompt(
      "Chapter / section title (visual marker only — not narrated)",
      `Chapter ${sectionCount + 1}`,
    );
    if (title === null || !title.trim()) return;
    const next = appendScriptSection(script, title.trim());
    setScript(next);
    const data = await persistScript(next, {
      sourceMode: "edited",
      versionSource: "autosave",
    });
    toast({
      variant: "success",
      title: "Section marker added",
      description: data?.versionCreated
        ? `"${title.trim()}" · v${data.versionCreated} — skipped by narration & timeline`
        : `"${title.trim()}" — visual only, not narrated`,
    });
  }

  async function runGenerate(phase: "skeleton" | "expand" | "full") {
    if (generating) return;
    if (phase === "expand" && !script.trim()) {
      toast({ variant: "destructive", title: "Generate or paste an outline first" });
      return;
    }
    if (phase === "full" && script.trim() && !confirm("Replace the current script with a new AI draft?")) {
      return;
    }
    if (
      phase === "skeleton" &&
      script.trim() &&
      !confirm(
        "Split your script into narrator locution lines? Words are grouped by breath units (not one sentence per line). All text is kept. Your previous version is saved in Versions.",
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          script:
            phase === "skeleton" || phase === "expand"
              ? script
              : undefined,
          outlineOptions: phase === "skeleton" ? outlineOptions : undefined,
          webResearch: useWebResearch && !research,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setScript(data.script ?? "");
      syncFromScriptApi(data);
      setMeasuredAudioSeconds(null);
      const phaseLabel =
        phase === "skeleton"
          ? script.trim()
            ? "Split for narrator locution — full text kept"
            : "Outline ready — expand when happy with the beats"
          : phase === "expand"
            ? "Script expanded from outline"
            : "Script generated";
      toast({
        variant: "success",
        title: data.versionCreated ? `${phaseLabel} · v${data.versionCreated}` : phaseLabel,
        description: data.notes?.narrator
          ? `${data.notes.narrator.voiceTone} · ${voiceLabelForModel(
              data.notes.narrator.ttsModel,
              data.notes.narrator.ttsVoice,
            )}`
          : undefined,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Script generation failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate() {
    await runGenerate("full");
  }

  async function insertScriptPause(seconds: number) {
    const next = appendPauseToScript(script, seconds);
    setScript(next);
    await persistScript(next, {
      sourceMode: "edited",
    });
    toast({
      variant: "success",
      title: "Music moment added to script",
      description: `${formatPauseLine(seconds)} — apply to timeline when ready. Music swells; narration continues on the next paragraph.`,
    });
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast({ variant: "destructive", title: "Clipboard is empty" });
        return;
      }
      setScript(text);
      const data = await persistScript(text, {
        sourceMode: "pasted",
        versionSource: "paste",
      });
      if (data) {
        toast({
          variant: "success",
          title: data.versionCreated ? `Pasted · v${data.versionCreated}` : "Script pasted",
          description: "Click Analyze to get improvement notes on your text.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Could not read clipboard",
        description: "Allow clipboard access or paste manually into the document.",
      });
    }
  }

  async function runRefine(instructionText: string) {
    const trimmed = instructionText.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Type what you want improved" });
      return;
    }
    await applyFix(trimmed);
    setInstruction("");
  }

  async function handleApply() {
    if (!canApply) return;
    if (
      hasBlocks &&
      !confirm(
        "Replace the existing timeline blocks with this script? Generated media (keyframes, videos, audio) on existing blocks will be lost.",
      )
    ) {
      return;
    }
    if (
      speechParagraphs.length > 0 &&
      narrationReadyCount < speechParagraphs.length &&
      !confirm(
        `Only ${narrationReadyCount}/${speechParagraphs.length} paragraphs have narration. Blocks without matching audio will stay as draft on the timeline. Apply anyway?`,
      )
    ) {
      return;
    }
    setApplying(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await persistScript(script, { sourceMode: "edited", silent: true });
      const res = await fetch(`/api/projects/${project.id}/script/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyNarrator: true, script }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Apply failed");
      const narrator = notes.narrator;
      onProjectChanged({
        narrationMode: "continuous",
        status: "story_ready",
        ...(narrator
          ? {
              voiceTone: narrator.voiceTone,
              ttsModel: narrator.ttsModel,
              ttsVoice: narrator.ttsVoice,
            }
          : {}),
      });
      setStatus("applied");
      toast({
        variant: "success",
        title: "Applied to timeline",
        description: [
          `${(data.blocks as unknown[] | undefined)?.length ?? 0} continuous blocks created`,
          typeof data.narrationClipsAttached === "number" && data.narrationClipsAttached > 0
            ? `${data.narrationClipsAttached} with pre-generated audio`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      await onAppliedToTimeline();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not apply script",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setApplying(false);
    }
  }

  async function handleRenderMp3() {
    if (!canDownloadMp3) {
      toast({
        variant: "destructive",
        title: "Narration incomplete",
        description: `Generate all ${speechParagraphs.length} paragraphs first (${narrationReadyCount}/${speechParagraphs.length} ready).`,
      });
      return;
    }
    setRenderingMp3(true);
    setMp3Url(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/mp3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "MP3 render failed");
      const url = data.url as string;
      const filename = data.filename as string;
      setMp3Url(url);
      setMp3Filename(filename);
      const measured = data.measuredDurationSeconds as number | undefined;
      const source = data.source as string | undefined;
      const clipsUsed = data.paragraphClipsUsed as number | undefined;
      if (typeof measured === "number" && measured > 0) {
        setMeasuredAudioSeconds(Math.round(measured));
      }
      toast({
        variant: "success",
        title: "Narration MP3 ready",
        description: [
          `${((data.bytes as number) / 1024).toFixed(0)} KB`,
          measured ? `${Math.round(measured)}s` : null,
          source === "paragraph_clips" && clipsUsed
            ? `${clipsUsed} approved takes stitched`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? "script.mp3";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "MP3 render failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setRenderingMp3(false);
    }
  }

  async function handleExportManifest() {
    if (!canExportManifest) {
      toast({
        variant: "destructive",
        title: "Narration needed",
        description: "Generate at least one paragraph take before exporting the manifest.",
      });
      return;
    }
    setExportingManifest(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/manifest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Manifest export failed");

      const filename = (data.filename as string) ?? "manifest.json";
      const json = (data.json as string) ?? JSON.stringify(data.manifest, null, 2);
      const partial = Boolean(data.partial);
      const readiness = data.readiness as
        | { totalSpeech: number; withAudio: number; allReady: boolean }
        | undefined;

      if (data.notes && typeof data.notes === "object") {
        setNotes(data.notes as ScriptDraftNotes);
      }

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const manifest = data.manifest as { totalDurationSec?: number; segments?: unknown[] };
      toast({
        variant: partial ? "default" : "success",
        title: partial ? "Manifest exported (partial)" : "Manifest exported",
        description: [
          manifest.segments?.length ? `${manifest.segments.length} segments` : null,
          manifest.totalDurationSec ? `${Math.round(manifest.totalDurationSec)}s total` : null,
          partial && readiness
            ? `${readiness.withAudio}/${readiness.totalSpeech} with measured audio`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Manifest export failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setExportingManifest(false);
    }
  }

  async function handleSearchParagraphImages(speechIndex: number, keyword?: string) {
    setSearchingSpeechIndex(speechIndex);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechIndex,
          script,
          merge: true,
          ...(keyword ? { keyword } : {}),
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Image search failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const added = typeof data.addedKeywords === "number" ? data.addedKeywords : 0;
      const result = data.paragraphImages as { keywords?: Array<{ keyword: string }> } | undefined;
      toast({
        variant: "success",
        title: keyword ? "Photo search added" : "Reference photos found",
        description: keyword
          ? `Searching "${keyword}" — click the new bubble to import`
          : added > 0
            ? `Added ${added} new photo${added === 1 ? "" : "s"} (${result?.keywords?.length ?? 0} total for this paragraph)`
            : result?.keywords?.length
              ? `${result.keywords.length} keyword${result.keywords.length === 1 ? "" : "s"} — existing photos kept`
              : "No new keywords — try + for a specific search",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Image search failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSearchingSpeechIndex(null);
    }
  }

  async function handleSearchPauseImages(pauseIndex: number, keyword?: string) {
    setSearchingPauseIndex(pauseIndex);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pauseIndex,
          script,
          merge: true,
          ...(keyword ? { keyword } : {}),
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Image search failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const added = typeof data.addedKeywords === "number" ? data.addedKeywords : 0;
      const result = data.paragraphImages as { keywords?: Array<{ keyword: string }> } | undefined;
      toast({
        variant: "success",
        title: keyword ? "Busca adicionada na pausa" : "Fotos para a pausa",
        description: keyword
          ? `"${keyword}" — clique na bolinha para importar`
          : added > 0
            ? `${added} nova(s) · ${result?.keywords?.length ?? 0} no total — importe e aplique na timeline`
            : result?.keywords?.length
              ? `${result.keywords.length} opções — evita repetir a imagem anterior`
              : "Nenhuma keyword nova — use + para buscar algo específico",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Busca na pausa falhou",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSearchingPauseIndex(null);
    }
  }

  async function handleImportPauseKeywordImage(pauseIndex: number, keyword: string) {
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseIndex, keyword }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Import failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      toast({
        variant: "success",
        title: "Foto da pausa importada",
        description: "Aplique o roteiro na timeline para usar esta imagem no hold.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleCyclePauseKeywordImage(pauseIndex: number, keyword: string) {
    const entry = paragraphImages.find((e) => e.pauseIndex === pauseIndex);
    const match = entry?.keywords.find((k) => k.keyword === keyword);
    if (!match?.results.length) return;
    const currentIdx = match.results.findIndex((r) => r.id === match.selectedId);
    const next = match.results[(currentIdx + 1) % match.results.length]!;
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseIndex, keyword, imageId: next.id }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Select failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not cycle image",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleRemovePauseKeywordImage(pauseIndex: number, keyword: string) {
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseIndex, keyword }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Remove failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove image",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleSearchParagraphVideo(speechIndex: number, keyword?: string) {
    setSearchingVideoSpeechIndex(speechIndex);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/videos/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechIndex,
          script,
          ...(keyword ? { keyword, autoImport: false } : { autoImport: true }),
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Video search failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const searchQuery = typeof data.searchQuery === "string" ? data.searchQuery : null;
      const imported = data.imported === true;
      toast({
        variant: "success",
        title: imported ? "Vídeo do parágrafo importado" : "Vídeo encontrado",
        description: imported
          ? searchQuery
            ? `"${searchQuery}" — pronto para aplicar na timeline`
            : "Clip stock importado para este parágrafo"
          : keyword
            ? `Buscando "${keyword}" — clique na bolinha para importar`
            : "Clique na bolinha de vídeo para importar",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Video search failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSearchingVideoSpeechIndex(null);
    }
  }

  async function handleAutoPickAllParagraphVideos() {
    if (speechParagraphs.length === 0) return;
    setSearchingVideoSpeechIndex("all");
    let success = 0;
    let failed = 0;
    let notesSnapshot = notes;
    try {
      for (const paragraph of speechParagraphs) {
        setSearchingVideoSpeechIndex(paragraph.speechIndex);
        try {
          const res = await fetch(`/api/projects/${project.id}/script/videos/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              speechIndex: paragraph.speechIndex,
              script,
              autoImport: true,
            }),
          });
          const data = await readJsonResponse(res);
          if (!res.ok) throw new Error((data.error as string) ?? "Video search failed");
          if (data.notes && typeof data.notes === "object") {
            notesSnapshot = data.notes as ScriptDraftNotes;
            onNotesChange(notesSnapshot);
          }
          success += 1;
        } catch {
          failed += 1;
        }
      }
      toast({
        variant: failed > 0 ? "default" : "success",
        title: failed > 0 ? "Vídeos concluídos com avisos" : "Vídeos importados — todo o roteiro",
        description:
          failed > 0
            ? `${success} parágrafo${success === 1 ? "" : "s"} ok · ${failed} falhou${failed === 1 ? "" : "ram"}`
            : `${success} parágrafo${success === 1 ? "" : "s"} — stock video pronto para aplicar na timeline.`,
      });
    } finally {
      setSearchingVideoSpeechIndex(null);
    }
  }

  async function handleGenerateParagraphImage(speechIndex: number, prompt: string) {
    setGeneratingParagraphImageIndex(speechIndex);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechIndex,
          script,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "AI image failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const match = data.match as { keyword?: string } | undefined;
      toast({
        variant: "success",
        title: "AI image created",
        description: match?.keyword
          ? `"${match.keyword}" added — apply to timeline when ready.`
          : "Image saved for this paragraph.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "AI image failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGeneratingParagraphImageIndex(null);
    }
  }

  async function handleImportKeywordImage(speechIndex: number, keyword: string) {
    setImportingImages(true);
    const entry = paragraphImageSearchForSpeech(notes, speechIndex);
    const match = entry?.keywords.find((k) => k.keyword === keyword);
    const isVideo = match?.mediaKind === "video";
    try {
      const res = await fetch(
        `/api/projects/${project.id}/script/${isVideo ? "videos" : "images"}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speechIndex, keyword }),
        },
      );
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Import failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      toast({
        variant: "success",
        title: isVideo ? "Video imported" : "Photo imported",
        description: isVideo
          ? `"${keyword}" saved — apply to timeline to use as clip.`
          : `"${keyword}" saved to project — apply to timeline to use as keyframe.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setImportingImages(false);
    }
  }

  async function handleCycleKeywordImage(speechIndex: number, keyword: string) {
    const entry = paragraphImageSearchForSpeech(notes, speechIndex);
    const match = entry?.keywords.find((k) => k.keyword === keyword);
    if (!match || match.results.length < 2) return;
    const currentIdx = match.results.findIndex((r) => r.id === match.selectedId);
    const next = match.results[(currentIdx + 1) % match.results.length];
    if (!next) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechIndex, keyword, imageId: next.id }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Could not switch photo");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not switch photo",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleRemoveKeywordImage(speechIndex: number, keyword: string) {
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechIndex, keyword }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Could not remove photo");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      toast({
        variant: "success",
        title: "Photo removed",
        description: `"${keyword}" removed from this paragraph.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove photo",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleKeepImportedParagraphImages(speechIndex: number) {
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechIndex, keepImportedOnly: true }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Could not clean up photos");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const removedCount = typeof data.removedCount === "number" ? data.removedCount : 0;
      toast({
        variant: "success",
        title: "Kept imported photos only",
        description:
          removedCount > 0
            ? `Removed ${removedCount} unimported photo${removedCount === 1 ? "" : "s"}.`
            : "Only imported photos remain for this paragraph.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not clean up photos",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function handleImportAllParagraphImages(speechIndex: number) {
    setImportingImages(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechIndex, importAll: true }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Import failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const importErrors = Array.isArray(data.importErrors)
        ? (data.importErrors as string[])
        : [];
      if (data.partial && importErrors.length > 0) {
        toast({
          variant: "destructive",
          title: "Some imports failed",
          description: importErrors.slice(0, 3).join(" · "),
        });
        return;
      }
      toast({
        variant: "success",
        title: "Photos imported",
        description: "All keywords saved — apply to timeline to attach keyframes.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setImportingImages(false);
    }
  }

  async function handleAiPickParagraphImages(speechIndex: number) {
    setAiPickingSpeechIndex(speechIndex);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/images/ai-pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechIndex, script, importImages: true }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "AI pick failed");
      if (data.notes && typeof data.notes === "object") {
        onNotesChange(data.notes as ScriptDraftNotes);
      }
      const importErrors = Array.isArray(data.importErrors)
        ? (data.importErrors as string[])
        : [];
      const targetCount = typeof data.targetCount === "number" ? data.targetCount : null;
      const importedCount = typeof data.importedCount === "number" ? data.importedCount : null;
      const durationSeconds =
        typeof data.durationSeconds === "number" ? data.durationSeconds : null;
      const alreadyComplete = data.alreadyComplete === true;

      if (data.partial && importErrors.length > 0) {
        toast({
          variant: "destructive",
          title: "IA selecionou, mas alguns imports falharam",
          description: importErrors.slice(0, 3).join(" · "),
        });
        return;
      }

      if (alreadyComplete) {
        toast({
          variant: "success",
          title: "Parágrafo já completo",
          description:
            targetCount != null
              ? `${targetCount} foto${targetCount === 1 ? "" : "s"} já importada${targetCount === 1 ? "" : "s"} para este parágrafo.`
              : "Quantidade ideal de fotos já importada.",
        });
        return;
      }

      toast({
        variant: "success",
        title: "IA selecionou e importou",
        description: [
          importedCount != null ? `${importedCount} foto${importedCount === 1 ? "" : "s"}` : null,
          durationSeconds != null ? `~${Math.round(durationSeconds)}s de narração` : null,
          targetCount != null ? `meta ${targetCount} cortes` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Seleção por IA falhou",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setAiPickingSpeechIndex(null);
    }
  }

  async function handleAiPickAllParagraphImages() {
    if (speechParagraphs.length === 0) return;
    setAiPickingSpeechIndex("all");
    let success = 0;
    let failed = 0;
    let notesSnapshot = notes;
    try {
      for (const paragraph of speechParagraphs) {
        setAiPickingSpeechIndex(paragraph.speechIndex);
        try {
          const res = await fetch(`/api/projects/${project.id}/script/images/ai-pick`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ speechIndex: paragraph.speechIndex, script, importImages: true }),
          });
          const data = await readJsonResponse(res);
          if (!res.ok) throw new Error((data.error as string) ?? "AI pick failed");
          if (data.notes && typeof data.notes === "object") {
            notesSnapshot = data.notes as ScriptDraftNotes;
            onNotesChange(notesSnapshot);
          }
          success += 1;
        } catch {
          failed += 1;
        }
      }
      toast({
        variant: failed > 0 ? "default" : "success",
        title: failed > 0 ? "IA concluiu com avisos" : "IA selecionou todo o roteiro",
        description:
          failed > 0
            ? `${success} parágrafo${success === 1 ? "" : "s"} ok · ${failed} falhou${failed === 1 ? "" : "ram"}`
            : `${success} parágrafo${success === 1 ? "" : "s"} — fotos prontas para aplicar na timeline.`,
      });
    } finally {
      setAiPickingSpeechIndex(null);
    }
  }

  async function handleClear() {
    if (!confirm("Discard the current script draft? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setScript("");
      setNotes({});
      setStatus("none");
      setVersions([]);
      setCurrentVersion(null);
      setMp3Url(null);
      toast({ variant: "success", title: "Script cleared" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not clear",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSaving(false);
    }
  }

  async function persistProjectVoice(patch: {
    ttsModel?: string;
    ttsVoice?: string;
    voiceTone?: string;
    ttsSpeed?: number;
    ttsVoiceSettings?: ReturnType<typeof mergeElevenLabsVoiceSettings>;
  }): Promise<void> {
    const { ttsVoiceSettings, ...rest } = patch;
    const localPatch: Partial<Project> = { ...rest };
    const apiPatch: Record<string, unknown> = { ...rest };
    if (ttsVoiceSettings !== undefined) {
      localPatch.ttsVoiceSettings = serializeTtsVoiceSettings(ttsVoiceSettings);
      apiPatch.ttsVoiceSettings = ttsVoiceSettings;
    }
    onProjectChanged(localPatch);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPatch),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
  }

  async function persistNarratorNotesSilent() {
    const updated = notesAlignedWithProject({
      ...notesRef.current,
      updatedAt: new Date().toISOString(),
    });
    notesRef.current = updated;
    const res = await fetch(`/api/projects/${project.id}/script`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: scriptRef.current, notes: updated }),
    });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error((data.error as string) ?? "Failed to save narrator");
    syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
  }

  async function persistVoiceSettings(next: NonNullable<ScriptDraftNotes["narrator"]>) {
    const seq = ++voiceSaveSeqRef.current;
    try {
      await persistProjectVoice({
        ttsModel: next.ttsModel,
        ttsVoice: next.ttsVoice,
        voiceTone: next.voiceTone,
      });
      if (seq !== voiceSaveSeqRef.current) return;
      try {
        await persistNarratorNotesSilent();
      } catch {
        // Project voice is saved — script notes will resync on the next autosave.
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save voice settings",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  function handleNarratorEdit(patch: Partial<NonNullable<ScriptDraftNotes["narrator"]>>) {
    const current = resolveScriptNarrator(projectRef.current, notesRef.current);
    const next = { ...current, ...patch };
    if (patch.ttsModel && patch.ttsModel !== current.ttsModel) {
      const voiceList = voiceOptionsForTtsModel(patch.ttsModel);
      if (!voiceList.some((v) => v.value === next.ttsVoice)) {
        next.ttsVoice = getDefaultTtsVoiceForModel(patch.ttsModel);
      }
    }
    if (patch.ttsModel || patch.ttsVoice) {
      next.rationale = "";
    }

    projectRef.current = {
      ...projectRef.current,
      ttsModel: next.ttsModel,
      ttsVoice: next.ttsVoice,
      voiceTone: next.voiceTone,
    };
    const nextNotes = notesAlignedWithProject({
      ...notesRef.current,
      narrator: next,
      updatedAt: new Date().toISOString(),
    });
    notesRef.current = nextNotes;

    onProjectChanged({
      ttsModel: next.ttsModel,
      ttsVoice: next.ttsVoice,
      voiceTone: next.voiceTone,
    });
    setNotes(nextNotes);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (dirtyRef.current) {
        saveTimerRef.current = setTimeout(() => {
          void persistScript(scriptRef.current, { sourceMode: "edited" });
        }, 700);
      }
    }

    void persistVoiceSettings(next);
  }

  function handleTtsSpeedChange(speed: number) {
    const normalized = normalizeTtsSpeed(speed);
    void persistProjectVoice({ ttsSpeed: normalized }).catch((err) => {
      toast({
        variant: "destructive",
        title: "Could not save voice settings",
        description: err instanceof Error ? err.message : "Unknown",
      });
    });
  }

  function handleVoiceToneChange(tone: string) {
    handleNarratorEdit({ voiceTone: tone });
  }

  function handleElevenLabsSettingsChange(patch: Partial<ElevenLabsVoiceSettings>) {
    const next = mergeElevenLabsVoiceSettings(project.ttsVoiceSettings, patch);
    void persistProjectVoice({ ttsVoiceSettings: next }).catch((err) => {
      toast({
        variant: "destructive",
        title: "Could not save voice settings",
        description: err instanceof Error ? err.message : "Unknown",
      });
    });
  }

  function handleKokoroSettingsChange(patch: Partial<KokoroVoiceSettings>) {
    const next = mergeKokoroVoiceSettings(project.ttsVoiceSettings, patch);
    void persistProjectVoice({ ttsVoiceSettings: next }).catch((err) => {
      toast({
        variant: "destructive",
        title: "Could not save voice settings",
        description: err instanceof Error ? err.message : "Unknown",
      });
    });
  }

  const narrator = React.useMemo(
    () => resolveScriptNarrator(project, notes),
    [project, notes],
  );
  const hasSavedNarrator = Boolean(notes.narrator);

  const elevenLabsSettings = React.useMemo(
    () => resolveElevenLabsVoiceSettings(project.ttsVoiceSettings),
    [project.ttsVoiceSettings],
  );

  const kokoroSettings = React.useMemo(
    () => resolveKokoroVoiceSettings(project.ttsVoiceSettings),
    [project.ttsVoiceSettings],
  );

  const narratorPreviewKey = `${narrator.ttsModel}:${narrator.ttsVoice}:${narrator.voiceTone}:${project.ttsSpeed ?? 1}:${elevenLabsSettings.stability}:${elevenLabsSettings.similarityBoost}:${elevenLabsSettings.style}:${elevenLabsSettings.speakerBoost}:${kokoroSettings.expressiveness}`;

  React.useEffect(() => {
    setNarratorPreviewUrl(null);
  }, [narratorPreviewKey, script.slice(0, 240)]);

  async function handleNarratorPreview() {
    if (previewingNarrator) return;
    setPreviewingNarrator(true);
    setNarratorPreviewUrl(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/script/narrator-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          narrator: {
            voiceTone: narrator.voiceTone,
            ttsModel: narrator.ttsModel,
            ttsVoice: narrator.ttsVoice,
          },
          speed: normalizeTtsSpeed(project.ttsSpeed ?? 1),
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Preview failed");
      const url = data.url as string;
      setNarratorPreviewUrl(url);
      const measured = data.measuredDurationSeconds as number | undefined;
      if (typeof measured === "number" && measured > 0) {
        const previewText = buildNarratorPreviewText(script);
        const previewWords = previewText.split(/\s+/).filter(Boolean).length;
        const totalWords = stats.words;
        if (totalWords > previewWords && previewWords > 0) {
          setMeasuredAudioSeconds(Math.round((measured / previewWords) * totalWords));
        } else {
          setMeasuredAudioSeconds(Math.round(measured));
        }
      }
      window.setTimeout(() => {
        const audio = narratorPreviewAudioRef.current;
        if (!audio) return;
        audio.src = url;
        void audio.play().catch(() => {});
      }, 50);
      toast({
        variant: "success",
        title: "Narrator preview ready",
        description: `~${NARRATOR_PREVIEW_TARGET_SECONDS}s sample from your opening lines.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not preview narrator",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setPreviewingNarrator(false);
    }
  }

  function collapseAllSidebarSections() {
    for (const id of SIDEBAR_SECTION_IDS) writeSectionCollapsed(id, true);
    setSidebarLayoutEpoch((n) => n + 1);
  }

  function expandAllSidebarSections() {
    for (const id of SIDEBAR_SECTION_IDS) writeSectionCollapsed(id, false);
    setSidebarLayoutEpoch((n) => n + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/40">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-semibold">Script document</span>
            <Badge
              variant={status === "applied" ? "success" : status === "draft" ? "accent" : "outline"}
            >
              {status === "applied" ? "Applied" : status === "draft" ? "Draft" : "Empty"}
            </Badge>
            {currentVersion !== null || versions.length > 0 ? (
              <ScriptVersionsPopover
                currentVersion={currentVersion}
                versions={versions}
                restoringVersion={restoringVersion}
                onRestore={(v) => void handleRestoreVersion(v)}
              />
            ) : null}
            <ScriptDurationInsightsPopover
              script={script}
              targetSeconds={project.targetDurationSeconds ?? 30}
              segmentAlerts={segmentAlerts}
              measuredAudioSeconds={measuredAudioSeconds}
              showEmphasisLegend={!isEmpty && showDeliveryEmphasis}
              emphasisIsAi={Boolean(delivery?.spans?.length)}
            />
            {!isEmpty && (
              <ScriptNarrationHeaderControls
                readyCount={narrationReadyCount}
                totalParagraphs={speechParagraphs.length}
                generating={generatingAllNarration}
                generateDisabled={
                  generatingAllNarration ||
                  generatingSpeechIndex !== null ||
                  analyzingDelivery ||
                  analyzingPronunciation ||
                  isEmpty
                }
                onGenerate={() => void runParagraphNarration()}
                ttsModel={narrator.ttsModel}
                ttsVoice={narrator.ttsVoice}
                voiceTone={narrator.voiceTone}
                ttsSpeed={project.ttsSpeed ?? 1}
                elevenLabsSettings={elevenLabsSettings}
                kokoroSettings={kokoroSettings}
                hasSavedNarrator={hasSavedNarrator}
                rationale={narrator.rationale}
                deliveryNotes={narrator.deliveryNotes}
                previewing={previewingNarrator}
                previewUrl={narratorPreviewUrl}
                previewAudioRef={narratorPreviewAudioRef}
                onTtsModelChange={(v) => handleNarratorEdit({ ttsModel: v })}
                onTtsVoiceChange={(v) => handleNarratorEdit({ ttsVoice: v })}
                onVoiceToneChange={handleVoiceToneChange}
                onTtsSpeedChange={handleTtsSpeedChange}
                onElevenLabsSettingsChange={handleElevenLabsSettingsChange}
                onKokoroSettingsChange={handleKokoroSettingsChange}
                onPreview={() => void handleNarratorPreview()}
              />
            )}
            {saving && (
              <span className="text-2xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
            {review && suggestions.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowHighlights((v) => !v)}
              >
                {showHighlights ? "Hide review" : "Show review"}
              </Button>
            )}
            {!isEmpty && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowDeliveryEmphasis((v) => !v)}
                title="Underline phrases that benefit from more intonation or emotion"
              >
                {showDeliveryEmphasis ? "Hide emphasis" : "Show emphasis"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border border-border/80 bg-muted/20 p-0.5">
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-2 text-2xs"
                onClick={cycleEditorWidth}
                disabled={editorLayout.focus}
                title={`Width: ${EDITOR_WIDTH_LABEL[editorLayout.width]} (click to cycle)`}
              >
                {EDITOR_WIDTH_LABEL[editorLayout.width]}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className={cn(
                  "h-6 px-2 text-2xs",
                  editorLayout.density === "compact" && "bg-muted text-foreground",
                )}
                onClick={toggleEditorDensity}
                title={
                  editorLayout.density === "compact"
                    ? "Comfortable text size"
                    : "Compact text — see more on screen"
                }
              >
                {editorLayout.density === "compact" ? "Compact" : "Comfort"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className={cn(
                  "h-6 px-2 text-2xs",
                  editorLayout.focus && "bg-accent/15 text-accent",
                )}
                onClick={toggleEditorFocus}
                title={editorLayout.focus ? "Exit focus mode (Esc)" : "Focus mode — hide tools sidebar"}
              >
                {editorLayout.focus ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {!isEmpty && (
          <ScriptNarrationBar
            script={script}
            clips={paragraphClips}
            activeSpeechIndex={activeSpeechIndex}
            playing={narrationPlaying}
            onPlayAll={() => void playAllNarration()}
            onStop={() => stopNarration()}
            onPrev={() => skipNarration(-1)}
            onNext={() => skipNarration(1)}
          />
        )}

        <div
          ref={scriptScrollRef}
          className={cn(
            "flex-1 overflow-auto py-6",
            editorLayout.focus ? "px-3" : "px-6",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full rounded-md border border-border bg-background shadow-sm",
              editorMaxWidth,
              "transition-[max-width] duration-200",
            )}
          >
            <ScriptDocument
              script={script}
              onChange={handleScriptChange}
              suggestions={suggestions}
              activeSuggestionId={activeSuggestionId}
              onSelectSuggestion={setActiveSuggestionId}
              showHighlights={showHighlights}
              showDeliveryEmphasis={showDeliveryEmphasis}
              deliveryAnalysis={delivery ?? null}
              paragraphClips={paragraphClips}
              paragraphImages={paragraphImages}
              searchingSpeechIndex={searchingSpeechIndex}
              searchingPauseIndex={searchingPauseIndex}
              searchingVideoSpeechIndex={searchingVideoSpeechIndex}
              aiPickingSpeechIndex={aiPickingSpeechIndex}
              onSearchParagraphImages={(idx) => void handleSearchParagraphImages(idx)}
              onSearchPauseImages={(idx) => void handleSearchPauseImages(idx)}
              onSearchParagraphVideo={(idx) => void handleSearchParagraphVideo(idx)}
              onAiPickParagraphImages={(idx) => void handleAiPickParagraphImages(idx)}
              onSearchCustomParagraphImage={(idx, keyword) =>
                void handleSearchParagraphImages(idx, keyword)
              }
              onSearchCustomPauseImage={(idx, keyword) =>
                void handleSearchPauseImages(idx, keyword)
              }
              onGenerateParagraphImage={(idx, prompt) =>
                void handleGenerateParagraphImage(idx, prompt)
              }
              generatingParagraphImageIndex={generatingParagraphImageIndex}
              onImportKeywordImage={(idx, kw) => void handleImportKeywordImage(idx, kw)}
              onImportPauseKeywordImage={(idx, kw) => void handleImportPauseKeywordImage(idx, kw)}
              onCycleKeywordImage={(idx, kw) => void handleCycleKeywordImage(idx, kw)}
              onCyclePauseKeywordImage={(idx, kw) => void handleCyclePauseKeywordImage(idx, kw)}
              onRemoveKeywordImage={(idx, kw) => void handleRemoveKeywordImage(idx, kw)}
              onRemovePauseKeywordImage={(idx, kw) => void handleRemovePauseKeywordImage(idx, kw)}
              onKeepImportedParagraphImages={(idx) =>
                void handleKeepImportedParagraphImages(idx)
              }
              activeSpeechIndex={activeSpeechIndex}
              generatingSpeechIndex={generatingSpeechIndex}
              onPlaySpeechParagraph={(idx) => void playSingleParagraph(idx)}
              onRegenerateSpeechParagraph={(idx) => void runParagraphNarration(idx, true)}
              onRemoveSection={(idx) => void handleRemoveSection(idx)}
              density={editorLayout.density}
              segmentBudgetAlerts={segmentAlerts}
              scrollContainerRef={scriptScrollRef}
              placeholder={
                "Paste your script here — we'll improve THIS text, not replace it with something new.\n\nKeep paragraphs separated by a blank line.\n\nSection markers (visual only, not narrated): ## Chapter 1  or  [chapter] Capítulo 2\n\nDocumentary pauses (music swell): [pause 3s] or --- on its own line. Use Analyze to see what to fix."
              }
            />
          </div>
        </div>

        {editorLayout.focus && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <div className="pointer-events-auto rounded-full border border-border bg-background/95 px-3 py-1 text-2xs text-muted-foreground shadow-md backdrop-blur-sm">
              Focus mode —{" "}
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={toggleEditorFocus}
              >
                show tools
              </button>{" "}
              or press Esc
            </div>
          </div>
        )}
      </div>

      {showSidebar && (
      <aside className="flex w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="text-2xs font-medium text-muted-foreground">Script tools</span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-1.5 text-2xs"
              onClick={expandAllSidebarSections}
            >
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-1.5 text-2xs"
              onClick={collapseAllSidebarSections}
            >
              Collapse all
            </Button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <SidebarSection
            id="source"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Sparkles className="h-4 w-4 text-accent" />}
            title="Source"
            summary={
              isEmpty
                ? "Paste or generate"
                : `${stats.words} words · ${stats.paragraphs} ¶`
            }
            defaultCollapsed={false}
          >
            <p className="text-2xs leading-relaxed text-muted-foreground">
              {isEmpty
                ? "Empty draft: Story builds the timeline and fills this script from your project brief. Or use Outline → Expand for script-first."
                : "With a draft: Split lines groups speech into narrator takes (~8–22 words per ¶) — full text kept. Expand turns short beats back into full paragraphs."}
              {" "}Paste imports text as-is; Analyze refines in place.
            </p>

            {onGenerateStory ? (
              <Button
                variant="default"
                size="sm"
                className="h-9 w-full gap-1.5"
                onClick={() => void onGenerateStory()}
                disabled={storyBusy || generating}
                title="Generate storyboard blocks from project brief and sync narration here"
              >
                {storyBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                )}
                {storyBusy ? "Writing…" : "Story"}
              </Button>
            ) : null}

            <div className="grid grid-cols-2 items-start gap-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-center gap-1.5 px-2"
                  onClick={() => runGenerate("skeleton")}
                  disabled={generating}
                  title={
                    isEmpty
                      ? "Beat outline from project brief"
                      : "Split for narrator locution — breath-sized ¶, every word kept"
                  }
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                  )}
                  <span className="truncate">{isEmpty ? "Outline" : "Split lines"}</span>
                </Button>
                {isEmpty && (
                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-2">
                    <p className="text-[10px] font-medium text-foreground">Outline options</p>
                    <div className="space-y-1">
                      <Label htmlFor="outline-beat-length" className="text-[10px] text-muted-foreground">
                        Beat length
                      </Label>
                      <Select
                        value={outlineOptions.beatLength}
                        onValueChange={(value) =>
                          patchOutlineOptions({ beatLength: value as OutlineBeatLength })
                        }
                      >
                        <SelectTrigger id="outline-beat-length" className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short (~15 words)</SelectItem>
                          <SelectItem value="balanced">Balanced (~28 words)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex cursor-pointer items-start gap-1.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3 w-3 shrink-0 rounded border-border accent-accent"
                        checked={outlineOptions.preserveVoice}
                        onChange={(e) => patchOutlineOptions({ preserveVoice: e.target.checked })}
                      />
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        Preserve key phrases
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-1.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3 w-3 shrink-0 rounded border-border accent-accent"
                        checked={outlineOptions.protectCta}
                        onChange={(e) => patchOutlineOptions({ protectCta: e.target.checked })}
                      />
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        Protect sponsor / CTA
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-center gap-1.5 px-2"
                  onClick={() => runGenerate("expand")}
                  disabled={generating || isEmpty}
                  title={isEmpty ? "Generate or paste an outline first" : undefined}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">Expand</span>
                </Button>
                {!isEmpty && (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Full paragraphs from beats. Uses web research when enabled below.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border/60 bg-background p-2.5">
              <p className="text-2xs font-medium text-foreground">Web research</p>
              <p className="text-2xs leading-snug text-muted-foreground">
                Searches the web from your project brief{script.trim() ? " and draft" : ""}.
                Use <strong className="font-medium text-foreground">Add</strong> per fact on a finished
                script, or <strong className="font-medium text-foreground">Expand</strong> on an outline
                (weaves 2–6 details while writing).
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-accent"
                  checked={useWebResearch}
                  onChange={(e) => setUseWebResearch(e.target.checked)}
                />
                <span className="text-2xs leading-snug text-muted-foreground">
                  Use web research when generating
                  {research
                    ? ` · ${researchAdded.added}/${researchAdded.total} added to script`
                    : " — searches automatically on first generate"}
                </span>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => void runWebResearch()}
                disabled={researchingWeb || generating}
              >
                {researchingWeb ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                {research ? "Refresh web research" : "Search web now"}
              </Button>
              {research && (
                <div className="max-h-52 space-y-2 overflow-y-auto border-t border-border pt-2 text-2xs">
                  {research.summary && (
                    <p className="text-muted-foreground">{research.summary}</p>
                  )}
                  {research.facts.map((fact) => (
                    <div
                      key={fact.id}
                      className={cn(
                        "flex items-start justify-between gap-2 rounded-md border px-2 py-1.5",
                        fact.addedAt
                          ? "border-accent/30 bg-accent/5 opacity-80"
                          : "border-border/60 bg-muted/10",
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn("text-foreground", fact.addedAt && "text-muted-foreground")}>
                          {fact.text}
                        </p>
                        {fact.sourceTitle && (
                          <span className="mt-0.5 block text-muted-foreground">{fact.sourceTitle}</span>
                        )}
                      </div>
                      {fact.addedAt ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-accent">
                          <Check className="h-3 w-3" />
                          Added
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 shrink-0 px-1.5 text-2xs"
                          disabled={applyingFix || !script.trim()}
                          onClick={() => void insertResearchItem(fact, "fact")}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  ))}
                  {research.curiosities.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start justify-between gap-2 rounded-md border px-2 py-1.5",
                        item.addedAt
                          ? "border-accent/30 bg-accent/5 opacity-80"
                          : "border-dashed border-border/60 bg-muted/5",
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn("text-foreground", item.addedAt && "text-muted-foreground")}>
                          {item.text}
                        </p>
                        {item.sourceTitle && (
                          <span className="mt-0.5 block text-muted-foreground">{item.sourceTitle}</span>
                        )}
                      </div>
                      {item.addedAt ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-accent">
                          <Check className="h-3 w-3" />
                          Added
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 shrink-0 px-1.5 text-2xs"
                          disabled={applyingFix || !script.trim()}
                          onClick={() => void insertResearchItem(item, "curiosity")}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  ))}
                  {research.factChecks && research.factChecks.length > 0 && (
                    <p className="text-muted-foreground">
                      {research.factChecks.filter((f) => f.status === "wrong").length} claim(s) to
                      fix · {research.factChecks.filter((f) => f.status === "correct").length}{" "}
                      verified
                    </p>
                  )}
                  {script.trim() &&
                    researchAdded.total > researchAdded.added &&
                    researchAdded.total > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={applyingFix}
                      onClick={() => void insertAllResearchFacts()}
                    >
                      Add remaining ({researchAdded.total - researchAdded.added})
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/80 bg-muted/20 p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-center gap-1.5 px-2"
                disabled={generating}
                onClick={() => void handleInsertSection()}
                title="Insert a visual chapter marker — not narrated"
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">+ Chapter / section</span>
              </Button>
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                <Button variant="ghost" size="xs" className="h-6 px-1.5 text-2xs" onClick={handlePaste}>
                  <Clipboard className="h-3 w-3" />
                  Paste
                </Button>
                <button
                  type="button"
                  className="text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  Full draft in one step
                </button>
              </div>
            </div>

            {status !== "none" && (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:bg-destructive/10"
                onClick={handleClear}
              >
                <Trash2 className="h-3 w-3" /> Clear draft
              </Button>
            )}
          </SidebarSection>

          <SidebarSection
            id="delivery"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Mic className="h-4 w-4 text-accent" />}
            title="Delivery & emphasis"
            summary={
              delivery?.spans?.length
                ? `${delivery.spans.length} phrase${delivery.spans.length === 1 ? "" : "s"}`
                : undefined
            }
            defaultCollapsed={!delivery}
          >
            <p className="text-2xs text-muted-foreground">
              Marks short phrases for intonation, emotion and weight — underlines in the document.
              After <strong className="font-medium text-foreground">Analyze delivery</strong>, MP3 and
              voice preview use these hints in the TTS.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => void runDeliveryAnalysis()}
              disabled={analyzingDelivery || reviewing || applyingFix || isEmpty}
            >
              {analyzingDelivery ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              {delivery ? "Re-analyze delivery" : "Analyze delivery"}
            </Button>
            {delivery && (
              <div className="space-y-2 border-t border-border pt-3">
                {delivery.overallPace && (
                  <p className="text-2xs text-muted-foreground">{delivery.overallPace}</p>
                )}
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {delivery.spans.slice(0, 12).map((span) => (
                    <li
                      key={span.id}
                      className="rounded-md border border-border bg-background px-2 py-1 text-2xs"
                    >
                      <span className="font-medium italic">&ldquo;{span.quote}&rdquo;</span>
                      <span className="mt-0.5 block text-muted-foreground">{span.hint}</span>
                    </li>
                  ))}
                </ul>
                {delivery.spans.length > 12 && (
                  <p className="text-2xs text-muted-foreground">
                    +{delivery.spans.length - 12} more in the document
                  </p>
                )}
              </div>
            )}
          </SidebarSection>

          <SidebarSection
            id="pauses"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Pause className="h-4 w-4 text-violet-400" />}
            title="Music moments"
            summary={
              scriptStructure.pauses > 0
                ? `${scriptStructure.pauses} pause${scriptStructure.pauses === 1 ? "" : "s"}`
                : undefined
            }
            defaultCollapsed={false}
          >
            <p className="text-2xs text-muted-foreground">
              Entre cortes visuais, dê um{" "}
              <strong className="font-medium text-foreground">destaque na música</strong> — a imagem
              continua, a voz fica em silêncio nesse trecho e a trilha sobe de volume. A narração
              retoma no corte seguinte. Na timeline aparece como{" "}
              <strong className="font-medium text-foreground">Music</strong>.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => void runAutoMusicPauses()}
              disabled={
                analyzingMusicPauses ||
                analyzingDelivery ||
                analyzingPronunciation ||
                reviewing ||
                applyingFix ||
                isEmpty
              }
            >
              {analyzingMusicPauses ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {musicPauses ? "Re-apply AI music moments" : "Auto-place with AI"}
            </Button>
            {musicPauses && (
              <div className="space-y-1.5 border-t border-border pt-2">
                {musicPauses.overallStrategy && (
                  <p className="text-2xs text-muted-foreground">{musicPauses.overallStrategy}</p>
                )}
                <ul className="space-y-1">
                  {musicPauses.insertions.slice(0, 6).map((item: ScriptMusicPauseInsertion) => (
                    <li key={item.id} className="text-2xs text-muted-foreground">
                      <span className="font-mono text-foreground">[{item.seconds}s]</span> after ¶
                      {item.afterSpeechIndex + 1} — {item.reason}
                    </li>
                  ))}
                </ul>
                {musicPauses.insertions.length > 6 && (
                  <p className="text-2xs text-muted-foreground">
                    +{musicPauses.insertions.length - 6} more in the script
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1 border-t border-border pt-2">
              {PAUSE_PRESET_SECONDS.map((seconds) => (
                <Button
                  key={seconds}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void insertScriptPause(seconds)}
                  disabled={analyzingMusicPauses}
                >
                  + {seconds}s music
                </Button>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground">
              Or type on its own line: <code className="text-foreground">[pause 3s]</code> or{" "}
              <code className="text-foreground">---</code>
            </p>
          </SidebarSection>

          <SidebarSection
            id="pronunciation"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Languages className="h-4 w-4 text-accent" />}
            title="Pronunciation"
            summary={
              pronunciationHintCount > 0
                ? `${pronunciationHintCount} term${pronunciationHintCount === 1 ? "" : "s"}`
                : pronunciation?.hints?.length
                  ? `${pronunciation.hints.length} hint${pronunciation.hints.length === 1 ? "" : "s"}`
                  : undefined
            }
            defaultCollapsed={!pronunciation}
          >
            <p className="text-2xs text-muted-foreground">
              Swaps foreign names for a plain <strong className="font-medium text-foreground">spoken</strong>{" "}
              form at TTS time (document unchanged). Use simple spelling like{" "}
              <em>Capitolio</em> — not hyphenated phonetics.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => void runPronunciationAnalysis()}
              disabled={
                analyzingPronunciation ||
                analyzingDelivery ||
                reviewing ||
                applyingFix ||
                isEmpty
              }
            >
              {analyzingPronunciation ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Languages className="h-3.5 w-3.5" />
              )}
              {pronunciation ? "Re-analyze pronunciation" : "Analyze pronunciation"}
            </Button>
            {pronunciation && (
              <div className="space-y-2 border-t border-border pt-3">
                {pronunciation.summary && (
                  <p className="text-2xs text-muted-foreground">{pronunciation.summary}</p>
                )}
                <ul className="max-h-56 space-y-2 overflow-y-auto">
                  {pronunciation.hints.map((hint) => (
                    <li
                      key={hint.id}
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium">{hint.written}</span>
                          {hint.lang && (
                            <span className="ml-2 text-muted-foreground">{hint.lang}</span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                          title="Remove hint"
                          onClick={() => removePronunciationHint(hint.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <label className="mt-1.5 block text-muted-foreground">
                        Spoken (TTS)
                        <Input
                          className="mt-0.5 h-7 text-2xs"
                          defaultValue={hint.spoken}
                          key={`${hint.id}-${hint.spoken}`}
                          onBlur={(e) => handlePronunciationSpokenBlur(hint.id, e.target.value)}
                        />
                      </label>
                      {hint.note && (
                        <span className="mt-1 block text-muted-foreground">{hint.note}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {pronunciationHintCount < (pronunciation.hints.length ?? 0) && (
                  <p className="text-2xs text-muted-foreground">
                    {pronunciation.hints.length - pronunciationHintCount} hint(s) not in the current
                    script
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => void clearAllPronunciation()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove all pronunciation
                </Button>
              </div>
            )}
          </SidebarSection>

          <SidebarSection
            id="reference-images"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<ImageIcon className="h-4 w-4 text-accent" />}
            title="Reference photos"
            summary={
              imagesImported.total > 0 || videosImported.imported > 0
                ? [
                    imagesImported.total > 0
                      ? `${imagesImported.imported}/${imagesImported.total} fotos`
                      : null,
                    videosImported.total > 0
                      ? `${videosImported.imported}/${videosImported.total} vídeos`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
            defaultCollapsed={paragraphImages.length === 0}
          >
            <p className="text-2xs leading-relaxed text-muted-foreground">
              At the end of each paragraph:{" "}
              <Search className="inline h-3 w-3" /> web search (adds more, keeps existing),{" "}
              <Film className="inline h-3 w-3" /> stock video for this paragraph (Pexels + IA),{" "}
              <Sparkles className="inline h-3 w-3" /> create with AI,{" "}
              <Plus className="inline h-3 w-3" /> specific web query,{" "}
              <Wand2 className="inline h-3 w-3" /> AI auto-pick (count from narration + cut pace,
              best match, import). Round bubbles = one photo slot — hover to preview; web photos need
              a click to import, AI photos are ready immediately.
            </p>
            {speechParagraphs.length > 0 && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={
                    aiPickingSpeechIndex !== null ||
                    searchingSpeechIndex !== null ||
                    searchingVideoSpeechIndex !== null ||
                    generating ||
                    speechParagraphs.length === 0
                  }
                  onClick={() => void handleAiPickAllParagraphImages()}
                >
                  {aiPickingSpeechIndex === "all" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  IA seleciona fotos — todo o roteiro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-sky-400/30 text-sky-300 hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-200"
                  disabled={
                    aiPickingSpeechIndex !== null ||
                    searchingSpeechIndex !== null ||
                    searchingVideoSpeechIndex !== null ||
                    generating ||
                    speechParagraphs.length === 0
                  }
                  onClick={() => void handleAutoPickAllParagraphVideos()}
                >
                  {searchingVideoSpeechIndex === "all" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  IA busca vídeos — todo o roteiro
                </Button>
              </div>
            )}
            <p className="text-2xs text-muted-foreground">
              Fotos: Google + Pexels + Wikimedia (when configured). Vídeos: Pexels stock + IA por
              parágrafo. Fotos viram keyframes; vídeos viram clip no bloco ao aplicar na timeline (
              {formatSpec.shortLabel}, {formatSpec.platformHint}).
            </p>
            {speechParagraphs.length > 0 && (
              <div className="space-y-2 border-t border-border pt-2">
                {speechParagraphs.map((paragraph) => {
                  const entry = paragraphImageSearchForSpeech(
                    notes,
                    paragraph.speechIndex,
                    paragraph.textKey,
                  );
                  const counts = countParagraphImagesImported(entry);
                  const videoCounts = countParagraphVideosImported(entry);
                  return (
                    <div
                      key={paragraph.speechIndex}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-2xs font-medium text-foreground">
                          ¶{paragraph.speechIndex + 1}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {entry
                            ? [
                                counts.total > 0
                                  ? `${counts.imported}/${counts.total} fotos`
                                  : null,
                                videoCounts.imported > 0
                                  ? `${videoCounts.imported} vídeo`
                                  : "sem vídeo",
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "Not searched yet"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={
                            aiPickingSpeechIndex !== null ||
                            searchingSpeechIndex !== null ||
                            searchingVideoSpeechIndex !== null ||
                            generating
                          }
                          title="IA escolhe quantidade, melhor foto e importa"
                          onClick={() => void handleAiPickParagraphImages(paragraph.speechIndex)}
                        >
                          {aiPickingSpeechIndex === paragraph.speechIndex ||
                          aiPickingSpeechIndex === "all" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="border-sky-400/30 text-sky-300 hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-200"
                          disabled={
                            aiPickingSpeechIndex !== null ||
                            searchingSpeechIndex !== null ||
                            searchingVideoSpeechIndex !== null ||
                            generating
                          }
                          title="IA busca e importa vídeo stock deste parágrafo"
                          onClick={() => void handleSearchParagraphVideo(paragraph.speechIndex)}
                        >
                          {searchingVideoSpeechIndex === paragraph.speechIndex ||
                          searchingVideoSpeechIndex === "all" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Film className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={
                            searchingSpeechIndex !== null ||
                            searchingVideoSpeechIndex !== null ||
                            generating ||
                            aiPickingSpeechIndex !== null
                          }
                          title="Find more photos (keeps existing)"
                          onClick={() => void handleSearchParagraphImages(paragraph.speechIndex)}
                        >
                          {searchingSpeechIndex === paragraph.speechIndex ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                        </Button>
                        {entry && counts.total > counts.imported ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={importingImages}
                            onClick={() => void handleImportAllParagraphImages(paragraph.speechIndex)}
                          >
                            Import all
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SidebarSection>

          <SidebarSection
            id="review"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<RefreshCw className="h-4 w-4 text-accent" />}
            title="Review & improve"
            summary={
              suggestions.length > 0
                ? `${suggestions.length} note${suggestions.length === 1 ? "" : "s"}`
                : undefined
            }
            defaultCollapsed={!review}
          >
            <p className="text-2xs text-muted-foreground">
              Analyze marks passages to fix. Apply updates only those parts — your draft stays intact.
            </p>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Optional focus for review, e.g. tighten the opening hook."
              className="min-h-[72px] text-xs"
              disabled={reviewing || applyingFix || isEmpty}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => runReview(instruction)}
              disabled={reviewing || applyingFix || isEmpty}
            >
              {reviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {review ? "Re-analyze" : "Analyze script"}
            </Button>
            <div className="flex flex-wrap gap-1">
              {QUICK_REVIEWS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => runReview(q.value)}
                  disabled={reviewing || applyingFix || isEmpty}
                  className={cn(
                    "rounded-full border border-border bg-background px-2 py-0.5 text-2xs",
                    "transition-colors hover:bg-muted disabled:opacity-50",
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {review && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-2xs text-muted-foreground">{review.overallSummary}</p>
                {review.strengths && review.strengths.length > 0 && (
                  <p className="text-2xs text-success">
                    Strengths: {review.strengths.slice(0, 2).join(" · ")}
                  </p>
                )}
                {suggestions.length > 0 ? (
                  <>
                    <ul className="max-h-64 space-y-2 overflow-y-auto">
                      {suggestions.map((s) => (
                        <li
                          key={s.id}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-2xs transition-colors",
                            activeSuggestionId === s.id
                              ? "border-accent/50 bg-accent/5"
                              : "border-border bg-background",
                          )}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() =>
                              setActiveSuggestionId(
                                activeSuggestionId === s.id ? null : s.id,
                              )
                            }
                          >
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant={severityBadgeVariant(s.severity)}
                                className="px-1 py-0 text-[10px]"
                              >
                                {s.severity}
                              </Badge>
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                {s.category}
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 font-medium italic">
                              &ldquo;{s.quote}&rdquo;
                            </p>
                            <p className="mt-0.5 text-muted-foreground">{s.issue}</p>
                          </button>
                          <Button
                            variant="outline"
                            size="xs"
                            className="mt-1.5 w-full"
                            disabled={applyingFix}
                            onClick={() => applySuggestion(s)}
                          >
                            {applyingFix ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Apply this fix"
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => applyAllSuggestions()}
                      disabled={applyingFix}
                    >
                      {applyingFix ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      Apply all fixes
                    </Button>
                  </>
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    No specific issues flagged — try a focused review chip above.
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <p className="text-2xs text-muted-foreground">
                Or describe a targeted edit (applied directly, no full rewrite):
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => runRefine(instruction)}
                disabled={applyingFix || isEmpty || !instruction.trim()}
              >
                {applyingFix ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Apply custom edit
              </Button>
            </div>

            {notes.lastChangeSummary && (
              <p className="text-2xs italic text-muted-foreground">
                Last change: {notes.lastChangeSummary}
              </p>
            )}
          </SidebarSection>

          <SidebarSection
            id="style"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Palette className="h-4 w-4 text-accent" />}
            title="Project style"
            summary={formatSpec.shortLabel}
            defaultCollapsed={true}
          >
            <dl className="space-y-1 text-2xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Format</dt>
                <dd className="font-medium">{formatSpec.shortLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Genre</dt>
                <dd className="font-medium">{project.genre || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Visual</dt>
                <dd className="font-medium truncate max-w-[180px]" title={project.visualStyle}>
                  {project.visualStyle || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Target</dt>
                <dd className="font-medium">{project.targetDurationSeconds}s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Narration mode</dt>
                <dd className="font-medium">Continuous (forced on apply)</dd>
              </div>
            </dl>
          </SidebarSection>

          <SidebarSection
            id="actions"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<LayoutPanelTop className="h-4 w-4 text-accent" />}
            title="Use this script"
            variant="accent"
            defaultCollapsed={true}
          >
            <p className="text-2xs text-muted-foreground">
              {narrationComplete
                ? "All paragraphs narrated — apply sends the same takes to the timeline."
                : narrationReadyCount > 0
                  ? `${narrationReadyCount}/${speechParagraphs.length} ready — finish narration before apply for full audio on blocks.`
                  : "Generate paragraph narration first, then apply to build the storyboard."}
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full"
              onClick={handleApply}
              disabled={!canApply}
            >
              {applying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Apply to timeline
              {narrationComplete ? ` (${speechParagraphs.length} with audio)` : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleRenderMp3}
              disabled={!canDownloadMp3}
              title={
                narrationComplete
                  ? "Merge your paragraph takes into one MP3"
                  : `Generate all ${speechParagraphs.length} paragraphs first`
              }
            >
              {renderingMp3 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {renderingMp3 ? "Merging…" : "Download MP3"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void handleExportManifest()}
              disabled={!canExportManifest}
              title={
                narrationComplete
                  ? "Build manifest.json with timings and visual intent for Premiere"
                  : narrationReadyCount > 0
                    ? "Partial export — missing paragraphs use estimated durations"
                    : "Generate paragraph narration first"
              }
            >
              {exportingManifest ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {exportingManifest ? "Building…" : "Export for Premiere"}
            </Button>
            {mp3Url && (
              <a
                href={mp3Url}
                download={mp3Filename ?? "script.mp3"}
                className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-2xs font-medium text-success hover:bg-success/15"
              >
                <Download className="h-3 w-3" />
                Download {mp3Filename}
              </a>
            )}
          </SidebarSection>
        </div>
      </aside>
      )}
    </div>
  );
}
