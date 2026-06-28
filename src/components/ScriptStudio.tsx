"use client";

import * as React from "react";
import {
  ArrowRight,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  scriptVersionSourceLabel,
  buildNarratorPreviewText,
  type ScriptDraftNotes,
  type ScriptDraftStatus,
  type ScriptVersionMeta,
} from "@/lib/script-studio";
import {
  KOKORO_VOICE_OPTIONS,
  TTS_MODEL_OPTIONS,
  getDefaultTtsVoiceForModel,
  voiceLabelForModel,
  voiceOptionsForTtsModel,
} from "@/lib/project-api-models";
import { getVideoFormatSpec } from "@/lib/video-format";
import { ScriptDocument } from "@/components/ScriptDocument";
import { ScriptDurationBar } from "@/components/ScriptDurationBar";
import { FavoriteVoiceSelect } from "@/components/FavoriteVoiceSelect";
import { buildSegmentBudgetAlerts } from "@/lib/script-budget";
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
  "versions",
  "review",
  "delivery",
  "narrator",
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
}

function ttsModelLabel(model: string): string {
  return TTS_MODEL_OPTIONS.find((m) => m.value === model)?.label ?? model;
}

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? "Empty server response" : `Server error (${res.status})`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.ok
        ? "Invalid server response"
        : `Server error (${res.status}): ${text.slice(0, 120)}`,
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
}: Props) {
  const { toast } = useToast();
  const setScript = onScriptChange;
  const setNotes = onNotesChange;
  const setStatus = onStatusChange;

  const [generating, setGenerating] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [analyzingDelivery, setAnalyzingDelivery] = React.useState(false);
  const [applyingFix, setApplyingFix] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [renderingMp3, setRenderingMp3] = React.useState(false);
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
  const suggestions = review?.suggestions ?? [];

  const dirtyRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = React.useRef(notes);
  notesRef.current = notes;

  function syncFromScriptApi(
    data: {
      notes?: ScriptDraftNotes;
      status?: ScriptDraftStatus;
      currentVersion?: number | null;
      versions?: ScriptVersionMeta[];
    },
    options?: { includeNotes?: boolean },
  ) {
    if (options?.includeNotes !== false && data.notes) setNotes(data.notes);
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
  const segmentAlerts = React.useMemo(
    () => buildSegmentBudgetAlerts(script, project.targetDurationSeconds ?? 30),
    [script, project.targetDurationSeconds],
  );
  const formatSpec = getVideoFormatSpec(project.videoFormat);

  const isEmpty = script.trim().length === 0;
  const canApply = !isEmpty && !applying && !generating;
  const canMp3 = !isEmpty && !renderingMp3 && !generating;

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleSave(nextScript: string) {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistScript(nextScript, { sourceMode: "edited" });
    }, 700);
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!script.trim()) return;
    await persistScript(script, { sourceMode: "edited" });
  }

  async function persistScript(
    text: string,
    extra?: {
      sourceMode?: "ai" | "pasted" | "edited";
      checkpoint?: boolean;
      versionSource?: "paste" | "manual_checkpoint";
    },
  ) {
    setSaving(true);
    try {
      const mergedNotes: ScriptDraftNotes = {
        ...notesRef.current,
        ...(extra?.sourceMode ? { sourceMode: extra.sourceMode } : {}),
      };
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
      toast({
        variant: "destructive",
        title: "Could not save script",
        description: err instanceof Error ? err.message : "Unknown",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckpoint() {
    if (isEmpty) {
      toast({ variant: "destructive", title: "Nothing to save yet" });
      return;
    }
    const data = await persistScript(script, {
      sourceMode: "edited",
      checkpoint: true,
      versionSource: "manual_checkpoint",
    });
    if (data?.versionCreated) {
      toast({
        variant: "success",
        title: `Saved as v${data.versionCreated}`,
        description: "Checkpoint created in version history.",
      });
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

  function formatVersionTime(iso: string): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function handleScriptChange(next: string) {
    if (next !== script && (notes.review || notes.delivery)) {
      setNotes({ ...notes, review: undefined, delivery: undefined });
      setActiveSuggestionId(null);
    }
    setScript(next);
    scheduleSave(next);
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
  ) {
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
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not apply fix",
        description: err instanceof Error ? err.message : "Unknown",
      });
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
        "Compact your script into beat lines (one per paragraph)? Your full text is saved in Versions — restore there if needed.",
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
            ? "Outline extracted — one beat per paragraph"
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
    setApplying(true);
    try {
      await flushPendingSave();
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
        description: `${(data.blocks as unknown[] | undefined)?.length ?? 0} continuous blocks created.`,
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
    if (!canMp3) return;
    setRenderingMp3(true);
    setMp3Url(null);
    try {
      await flushPendingSave();
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
      const spansUsed = data.deliverySpansUsed as number | undefined;
      if (typeof measured === "number" && measured > 0) {
        setMeasuredAudioSeconds(Math.round(measured));
      }
      toast({
        variant: "success",
        title: "Narration MP3 ready",
        description: `${((data.bytes as number) / 1024).toFixed(0)} KB${
          measured ? ` · ${Math.round(measured)}s measured` : ""
        }${spansUsed && spansUsed > 0 ? ` · ${spansUsed} delivery emphasis` : ""}`,
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

  async function persistNarrator(next: NonNullable<ScriptDraftNotes["narrator"]>) {
    const updated: ScriptDraftNotes = { ...notesRef.current, narrator: next };
    setNotes(updated);
    try {
      const res = await fetch(`/api/projects/${project.id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, notes: updated }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error((data.error as string) ?? "Failed to save narrator");
      syncFromScriptApi(data as Parameters<typeof syncFromScriptApi>[0]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save narrator",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  function handleNarratorEdit(patch: Partial<NonNullable<ScriptDraftNotes["narrator"]>>) {
    const current = resolveScriptNarrator(project, notesRef.current);
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
    void persistNarrator(next);
  }

  const narrator = React.useMemo(
    () => resolveScriptNarrator(project, notes),
    [project, notes],
  );
  const hasSavedNarrator = Boolean(notes.narrator);
  const voiceOptions = voiceOptionsForTtsModel(narrator.ttsModel);

  const narratorPreviewKey = `${narrator.ttsModel}:${narrator.ttsVoice}:${narrator.voiceTone}`;

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
            {currentVersion !== null && (
              <Badge variant="outline">v{currentVersion}</Badge>
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
            <Button
              variant="outline"
              size="xs"
              onClick={handleCheckpoint}
              disabled={isEmpty || saving}
              title="Save a named checkpoint in version history"
            >
              <Save className="h-3 w-3" /> Save version
            </Button>
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

        <div className="border-b border-border bg-muted/15 px-4 py-1.5">
          <ScriptDurationBar
            script={script}
            targetSeconds={project.targetDurationSeconds ?? 30}
            segmentAlerts={segmentAlerts}
            measuredAudioSeconds={measuredAudioSeconds}
          />
          {!isEmpty && showDeliveryEmphasis && (
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
              Emphasis marks
              {delivery?.spans?.length ? " (AI)" : " (auto)"}:{" "}
              <span className="underline decoration-wavy decoration-sky-500/80 underline-offset-2">
                hook / question
              </span>
              {" · "}
              <span className="underline decoration-dotted decoration-teal-500/80 underline-offset-2">
                facts
              </span>
              {" · "}
              <span className="underline decoration-wavy decoration-rose-400/80 underline-offset-2">
                emotion
              </span>
              {" · "}
              <span className="underline decoration-wavy decoration-amber-500/80 underline-offset-2">
                landing
              </span>
              {" · "}
              <span className="underline decoration-dashed decoration-accent/70 underline-offset-2">
                CTA
              </span>
              {" — hover a mark for delivery hint"}
            </p>
          )}
        </div>

        <div
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
              density={editorLayout.density}
              segmentBudgetAlerts={segmentAlerts}
              placeholder={
                "Paste your script here — we'll improve THIS text, not replace it with something new.\n\nKeep paragraphs separated by a blank line. Add breaths with [pause] or [pause 1s] on its own line (or ---). Use Analyze to see what to fix."
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
      <aside className="flex w-[340px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
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
                ? "Empty draft: Outline builds beats from your project brief. Then Expand turns them into narration."
                : "With a draft: Outline compacts each paragraph into one beat (same story). Expand turns beats back into speakable lines."}
              {" "}Paste imports text as-is; Analyze refines in place.
            </p>

            <div className="space-y-2 rounded-md border border-border/60 bg-background p-2.5">
              <p className="text-2xs font-medium text-foreground">Outline options</p>
              <div className="space-y-1">
                <Label htmlFor="outline-beat-length" className="text-2xs text-muted-foreground">
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
                    <SelectItem value="short">Short (~15 words per beat)</SelectItem>
                    <SelectItem value="balanced">Keep detail (~28 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-accent"
                  checked={outlineOptions.preserveVoice}
                  onChange={(e) => patchOutlineOptions({ preserveVoice: e.target.checked })}
                />
                <span className="text-2xs leading-snug text-muted-foreground">
                  Preserve key phrases — hooks, closings and vivid lines stay verbatim when possible
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-accent"
                  checked={outlineOptions.protectCta}
                  onChange={(e) => patchOutlineOptions({ protectCta: e.target.checked })}
                />
                <span className="text-2xs leading-snug text-muted-foreground">
                  Protect sponsor / CTA — partner blocks (links, email, brand) stay nearly full
                </span>
              </label>
            </div>

            <div className="rounded-md border border-border/80 bg-muted/20 p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 justify-center gap-1.5 px-2"
                  onClick={() => runGenerate("skeleton")}
                  disabled={generating}
                  title={
                    isEmpty
                      ? "Generate beat outline from project brief"
                      : "One beat line per paragraph — keeps your story"
                  }
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                  )}
                  <span className="truncate">{isEmpty ? "Outline" : "To outline"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 justify-center gap-1.5 px-2"
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
              </div>
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
            id="versions"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<History className="h-4 w-4 text-accent" />}
            title="Versions"
            summary={versions.length > 0 ? `${versions.length} saved` : undefined}
            defaultCollapsed={true}
          >
            {versions.length === 0 ? (
              <p className="text-2xs text-muted-foreground">
                Generate, paste, refine or save a checkpoint to create v1, v2, v3…
              </p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {versions.map((v) => (
                  <li
                    key={v.version}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-2xs",
                      v.isCurrent
                        ? "border-accent/40 bg-accent/5"
                        : "border-border bg-background",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-semibold">v{v.version}</span>
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">
                            {scriptVersionSourceLabel(v.source)}
                          </Badge>
                          {v.isCurrent && (
                            <Badge variant="accent" className="px-1 py-0 text-[10px]">
                              current
                            </Badge>
                          )}
                        </div>
                        {v.summary && (
                          <p className="mt-0.5 line-clamp-2 text-muted-foreground">{v.summary}</p>
                        )}
                        <p className="mt-0.5 text-muted-foreground">
                          {v.wordCount} words · {formatVersionTime(v.createdAt)}
                        </p>
                      </div>
                      {!v.isCurrent && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0"
                          disabled={restoringVersion !== null}
                          onClick={() => handleRestoreVersion(v.version)}
                        >
                          {restoringVersion === v.version ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Restore"
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
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
            id="narrator"
            layoutEpoch={sidebarLayoutEpoch}
            icon={<Mic className="h-4 w-4 text-accent" />}
            title="Narrator"
            summary={voiceLabelForModel(narrator.ttsModel, narrator.ttsVoice)}
            defaultCollapsed={false}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="accent">{narrator.voiceTone}</Badge>
                <Badge variant="outline">{ttsModelLabel(narrator.ttsModel)}</Badge>
                <Badge variant="outline">
                  {voiceLabelForModel(narrator.ttsModel, narrator.ttsVoice)}
                </Badge>
              </div>
              {!hasSavedNarrator && (
                <p className="text-2xs text-muted-foreground">
                  Using project voice settings — pick a model and preview anytime. Generate a script
                  for an AI narrator suggestion.
                </p>
              )}
              {narrator.rationale && (
                <p className="text-2xs text-muted-foreground">{narrator.rationale}</p>
              )}
              {narrator.deliveryNotes && (
                <p className="text-2xs italic text-muted-foreground">
                  Delivery: {narrator.deliveryNotes}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleNarratorPreview}
                disabled={previewingNarrator}
              >
                {previewingNarrator ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Preview voice (~{NARRATOR_PREVIEW_TARGET_SECONDS}s)
              </Button>
              {(narratorPreviewUrl || previewingNarrator) && (
                <audio
                  ref={narratorPreviewAudioRef}
                  src={narratorPreviewUrl ?? undefined}
                  controls
                  className="h-8 w-full"
                  preload="none"
                />
              )}
              <p className="text-2xs text-muted-foreground">
                Uses the opening lines of your script (or a short sample if empty).
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-2xs text-muted-foreground">TTS model</Label>
                  <Select
                    value={narrator.ttsModel}
                    onValueChange={(v) => handleNarratorEdit({ ttsModel: v })}
                  >
                    <SelectTrigger className="h-7 text-2xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <FavoriteVoiceSelect
                    ttsModel={narrator.ttsModel}
                    value={narrator.ttsVoice}
                    onValueChange={(v) => handleNarratorEdit({ ttsVoice: v })}
                    options={voiceOptions}
                  />
                </div>
              </div>
            </div>
          </SidebarSection>

          <SidebarSection
            id="style"
            layoutEpoch={sidebarLayoutEpoch}
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
            title="Use this script"
            variant="accent"
            defaultCollapsed={true}
          >
            <p className="text-2xs text-muted-foreground">
              Apply turns the script into a continuous storyboard (one narration per paragraph + visual cuts).
              Download MP3 uses delivery emphasis when analyzed.
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
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleRenderMp3}
              disabled={!canMp3}
            >
              {renderingMp3 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {renderingMp3 ? "Rendering…" : "Download MP3"}
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
