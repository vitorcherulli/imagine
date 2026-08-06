"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  Play,
  Download,
  Languages,
  Volume2,
  Mic,
  Sparkles,
  FileAudio,
  Film,
  Trash2,
  Waves,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type {
  DubbingRender,
  DubbingSegment,
  DubbingSegmentLocale,
  DubbingSource,
  DubbingTrack,
  Project,
} from "@/lib/db/schema";
import {
  DUB_LANGUAGES,
  dubLanguageInfo,
  normalizeDubLanguage,
} from "@/lib/dub-languages";
import { DubbingApiSettings } from "@/components/DubbingApiSettings";
import {
  projectApiModelsFromProject,
  type ProjectApiModels,
} from "@/lib/project-api-models";
import { cn } from "@/lib/utils";
import { DubbingTimeline } from "@/components/DubbingTimeline";
import {
  buildSegmentClipsForTrack,
  buildTimelineDubTracks,
  type DubSegmentClip,
} from "@/lib/dubbing/track-view";
import {
  useDubPreviewAudio,
  type DubPreviewMode,
} from "@/lib/dubbing/use-dub-preview-audio";

interface Props {
  project: Project;
  initialSource: DubbingSource | null;
  initialSegments: DubbingSegment[];
  initialTracks: DubbingTrack[];
  initialLocales: DubbingSegmentLocale[];
  initialRenders: DubbingRender[];
}

function formatSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const total = Math.max(0, s);
  const min = Math.floor(total / 60);
  const sec = total - min * 60;
  return `${min}:${sec.toFixed(1).padStart(4, "0")}`;
}

function dubPipelinePercent(project: Project): number | null {
  const current = project.dubPipelineCurrent;
  const total = project.dubPipelineTotal;
  if (current != null && total != null && total > 0) {
    return Math.min(100, Math.round((current / total) * 100));
  }
  switch (project.dubPipelineStage) {
    case "start":
      return 2;
    case "transcribe":
      return 12;
    case "clone":
      return 22;
    case "translate":
      return 38;
    case "synthesize":
      return 55;
    default:
      return null;
  }
}

function dubPipelineStageLabel(stage: string | null | undefined): string {
  switch (stage) {
    case "transcribe":
      return "STT";
    case "clone":
      return "Clone";
    case "translate":
      return "Translate";
    case "synthesize":
      return "Voice";
    default:
      return "Pipeline";
  }
}

export function DubbingEditor({
  project: initialProject,
  initialSource,
  initialSegments,
  initialTracks,
  initialLocales,
  initialRenders,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [project, setProject] = React.useState(initialProject);
  const [source, setSource] = React.useState(initialSource);
  const [segments, setSegments] = React.useState(initialSegments);
  const [tracks, setTracks] = React.useState(initialTracks);
  const [locales, setLocales] = React.useState(initialLocales);
  const [renders, setRenders] = React.useState(initialRenders);
  const [processing, setProcessing] = React.useState<null | string>(null);
  const [rendering, setRendering] = React.useState<null | "video" | "audio">(null);
  const [savingProject, setSavingProject] = React.useState(false);
  const [addingLanguage, setAddingLanguage] = React.useState(false);
  const [showAddLanguage, setShowAddLanguage] = React.useState(false);
  const [activeTrackId, setActiveTrackId] = React.useState<string | null>(() => {
    const lang = normalizeDubLanguage(initialProject.dubTargetLanguage ?? "en");
    return (
      initialTracks.find((t) => t.languageId === lang)?.id ??
      initialTracks[0]?.id ??
      null
    );
  });

  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? tracks[0] ?? null;
  const targetLanguage = normalizeDubLanguage(
    activeTrack?.languageId ?? project.dubTargetLanguage ?? "en",
  );
  const targetInfo = dubLanguageInfo(targetLanguage);
  const backgroundGain = project.dubBackgroundGain ?? 0;

  // -----------------------------------------------------------------------
  // Preview + timeline sync (playhead follows source media element)
  // -----------------------------------------------------------------------
  const mediaRef = React.useRef<HTMLMediaElement | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = React.useState<string | null>(null);
  const [segmentsPanelOpen, setSegmentsPanelOpen] = React.useState(true);
  const segmentRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [previewMode, setPreviewMode] = React.useState<DubPreviewMode>("dub");

  React.useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onTime = () => setCurrentTime(media.currentTime);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("seeked", onTime);
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("seeked", onTime);
    };
  }, [source?.sourceUrl]);

  const seekTo = React.useCallback((t: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Math.max(0, t);
    setCurrentTime(media.currentTime);
  }, []);

  const handleSelectSegment = React.useCallback(
    (id: string) => {
      if (selectedSegmentId === id) {
        setSelectedSegmentId(null);
        return;
      }
      setSelectedSegmentId(id);
      const seg = segments.find((s) => s.id === id);
      if (seg) seekTo(seg.startSeconds);
      const row = segmentRowRefs.current[id];
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [segments, seekTo, selectedSegmentId],
  );

  const toggleSegmentsPanel = React.useCallback(() => {
    setSegmentsPanelOpen((open) => {
      if (open) setSelectedSegmentId(null);
      return !open;
    });
  }, []);

  const timelineTotalSeconds = React.useMemo(() => {
    const fromSegments =
      segments.length > 0
        ? Math.max(...segments.map((s) => s.endSeconds))
        : 0;
    const fromSource = source?.durationSeconds ?? 0;
    return Math.max(1, fromSource, fromSegments + 1);
  }, [segments, source?.durationSeconds]);

  const dubTracks = React.useMemo(
    () =>
      buildTimelineDubTracks(
        segments,
        tracks,
        locales,
        source?.detectedLanguage ?? project.scriptLanguage,
      ),
    [segments, tracks, locales, source?.detectedLanguage, project.scriptLanguage],
  );

  const activeClips = React.useMemo(() => {
    if (!activeTrack) return [];
    const trackLocales = locales.filter((l) => l.trackId === activeTrack.id);
    return buildSegmentClipsForTrack(segments, trackLocales, activeTrack.id);
  }, [segments, locales, activeTrack]);

  const clipBySegmentId = React.useMemo(
    () => new Map(activeClips.map((c) => [c.id, c])),
    [activeClips],
  );

  const languagesOnTimeline = React.useMemo(
    () => new Set(tracks.map((t) => t.languageId)),
    [tracks],
  );

  const availableLanguages = React.useMemo(
    () => DUB_LANGUAGES.filter((l) => !languagesOnTimeline.has(l.id)),
    [languagesOnTimeline],
  );

  async function refresh() {
    const res = await fetch(`/api/dubs/${project.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      project: Project;
      source: DubbingSource | null;
      segments: DubbingSegment[];
      tracks: DubbingTrack[];
      locales: DubbingSegmentLocale[];
      renders: DubbingRender[];
    };
    setProject(data.project);
    setSource(data.source);
    setSegments(data.segments);
    setTracks(data.tracks);
    setLocales(data.locales);
    setRenders(data.renders);
    if (!activeTrackId && data.tracks[0]) {
      setActiveTrackId(data.tracks[0].id);
    }
  }

  async function updateProject(patch: Partial<Project>) {
    setSavingProject(true);
    try {
      const res = await fetch(`/api/dubs/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingProject(false);
    }
  }

  async function process(
    stages?: Array<"transcribe" | "translate" | "synthesize" | "clone">,
    force = false,
    label = "Processing dub…",
  ) {
    setProcessing(label);
    try {
      const res = await fetch(`/api/dubs/${project.id}/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages, force, trackId: activeTrackId ?? undefined }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      await refresh();
      toast({ variant: "success", title: "Done" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Processing failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProcessing(null);
    }
  }

  async function regenerateSegment(seg: DubbingSegment) {
    try {
      const res = await fetch(
        `/api/dubs/${project.id}/segments/${seg.id}/regenerate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackId: activeTrackId }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not regenerate",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function saveSegmentText(seg: DubbingSegment, newText: string) {
    try {
      const res = await fetch(`/api/dubs/${project.id}/segments/${seg.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ translatedText: newText, trackId: activeTrackId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save segment",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function renderOutput(kind: "video" | "audio") {
    setRendering(kind);
    try {
      const res = await fetch(`/api/dubs/${project.id}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, trackId: activeTrackId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      toast({
        variant: "success",
        title: kind === "video" ? "MP4 rendered" : "MP3 rendered",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Render failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRendering(null);
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this dubbing project and all its files?")) return;
    try {
      const res = await fetch(`/api/dubs/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.push("/");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not delete",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function addLanguage(languageId: string) {
    setAddingLanguage(true);
    try {
      const res = await fetch(`/api/dubs/${project.id}/tracks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ languageId, process: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { track: DubbingTrack };
      setShowAddLanguage(false);
      setActiveTrackId(data.track.id);
      await refresh();
      toast({
        variant: "success",
        title: `${dubLanguageInfo(languageId).label} track added`,
        description: "Translation and voice synthesis started for the new row.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not add language",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAddingLanguage(false);
    }
  }

  function selectActiveTrack(trackId: string) {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    setActiveTrackId(trackId);
    void updateProject({ dubTargetLanguage: track.languageId });
  }

  const transcribed = segments.length > 0 && segments.every((s) => s.sourceText);
  const translated = transcribed && activeClips.every((c) => c.translatedText.trim());
  const synthesized =
    translated &&
    activeClips.every((c) => c.ttsAudioUrl && c.status === "synthesized");

  useDubPreviewAudio({
    mediaRef,
    segments: activeClips,
    mode: previewMode,
    backgroundGain,
    enabled: synthesized,
  });

  React.useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [processing, project.id]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="accent" className="shrink-0">
            <Languages className="mr-1 h-3 w-3" /> Dubbing
          </Badge>
          <Input
            value={project.title}
            onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
            onBlur={(e) => updateProject({ title: e.target.value })}
            className="min-w-0 max-w-md border-transparent bg-transparent text-base font-semibold hover:border-border"
            disabled={savingProject}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteProject}
            title="Delete this dubbing project"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-5 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <SourcePanel source={source} mediaRef={mediaRef} />

          <PreviewAudioPanel
            mode={previewMode}
            onModeChange={setPreviewMode}
            targetInfo={targetInfo}
            backgroundGain={backgroundGain}
            synthesized={synthesized}
          />

          {segments.length > 0 && (
            <DubbingTimeline
              totalSeconds={timelineTotalSeconds}
              currentTime={currentTime}
              onSeek={seekTo}
              tracks={dubTracks}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={handleSelectSegment}
              sourceAudioUrl={
                source?.extractedAudioUrl ??
                (source?.sourceType === "audio" ? source.sourceUrl : null)
              }
              activeTrackId={activeTrackId}
              onSelectTrack={selectActiveTrack}
              onAddLanguage={
                availableLanguages.length > 0
                  ? () => setShowAddLanguage((v) => !v)
                  : undefined
              }
              addingLanguage={addingLanguage}
            />
          )}

          {showAddLanguage && availableLanguages.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-panel px-3 py-2">
              <span className="text-xs text-muted-foreground">Add timeline row:</span>
              <Select onValueChange={(v) => void addLanguage(v)}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Choose language…" />
                </SelectTrigger>
                <SelectContent>
                  {availableLanguages.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="mr-1">{l.flag}</span> {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="rounded border border-border bg-panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Pipeline</div>
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <StageDot label="STT" done={transcribed} />
                <StageDot label="Translate" done={translated} />
                <StageDot label="Voice" done={synthesized} />
              </div>
            </div>

            {processing ? (
              <div className="mb-3 space-y-1.5 rounded border border-sky-500/30 bg-sky-500/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-2xs">
                  <span className="font-medium text-sky-200">
                    {dubPipelineStageLabel(project.dubPipelineStage)}
                    {project.dubPipelineStage ? " · " : ""}
                    {project.dubPipelineMessage ?? processing}
                  </span>
                  {project.dubPipelineCurrent != null &&
                  project.dubPipelineTotal != null &&
                  project.dubPipelineTotal > 0 ? (
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {project.dubPipelineCurrent}/{project.dubPipelineTotal}
                    </span>
                  ) : null}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  {dubPipelinePercent(project) != null ? (
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all duration-500"
                      style={{ width: `${dubPipelinePercent(project)}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-400/80" />
                  )}
                </div>
                {source?.durationSeconds && source.durationSeconds > 600 ? (
                  <p className="text-2xs text-muted-foreground">
                    Vídeos longos ({Math.ceil(source.durationSeconds / 60)} min) podem levar
                    20–40+ min — a voz é gerada segmento a segmento. Esta barra atualiza a cada
                    poucos segundos.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!!processing || !source?.extractedAudioUrl}
                onClick={() => process(undefined, false, "Running full dub pipeline…")}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {processing}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Process everything
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!processing}
                onClick={() => process(["transcribe"], true, "Re-transcribing…")}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Re-transcribe
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!processing || !transcribed}
                onClick={() => process(["translate"], true, "Re-translating…")}
              >
                <Languages className="mr-1.5 h-3.5 w-3.5" />
                Re-translate
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!processing || !translated}
                onClick={() => process(["synthesize"], true, "Re-synthesizing…")}
              >
                <Mic className="mr-1.5 h-3.5 w-3.5" />
                Re-synthesize
              </Button>
            </div>
          </div>

          <div className="rounded border border-border bg-panel">
            <button
              type="button"
              onClick={toggleSegmentsPanel}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/20",
                segmentsPanelOpen && "border-b border-border/60",
              )}
              aria-expanded={segmentsPanelOpen}
            >
              <div className="flex min-w-0 items-center gap-2">
                {segmentsPanelOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <div className="text-sm font-medium">
                  Segments · {segments.length}
                  {segments.length > 0 && !segmentsPanelOpen ? (
                    <span className="ml-2 font-normal text-2xs text-muted-foreground">
                      Hidden — click to show
                    </span>
                  ) : segments.length > 0 && segmentsPanelOpen && !selectedSegmentId ? (
                    <span className="ml-2 font-normal text-2xs text-muted-foreground">
                      Click a row to expand
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  In sync
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
                  Slight
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                  Heavy
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  Overflow
                </span>
              </div>
            </button>
            {segmentsPanelOpen && segments.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No segments yet. Click <b>Process everything</b> to transcribe your audio.
              </div>
            ) : segmentsPanelOpen ? (
              <div className="divide-y divide-border/60">
                {segments.map((seg, idx) => {
                  const clip = clipBySegmentId.get(seg.id);
                  if (!clip) return null;
                  return (
                  <SegmentRow
                    key={seg.id}
                    index={idx + 1}
                    segment={seg}
                    clip={clip}
                    targetInfo={targetInfo}
                    onSaveText={(text) => saveSegmentText(seg, text)}
                    onRegenerate={() => regenerateSegment(seg)}
                    selected={selectedSegmentId === seg.id}
                    active={
                      currentTime >= seg.startSeconds &&
                      currentTime <= seg.endSeconds + 0.05
                    }
                    onSelect={() => handleSelectSegment(seg.id)}
                    rowRef={(el) => {
                      segmentRowRefs.current[seg.id] = el;
                    }}
                  />
                  );
                })}
              </div>
            ) : null}
          </div>

          <RendersPanel
            renders={renders}
            synthesized={synthesized}
            hasVideoSource={source?.sourceType === "video"}
            rendering={rendering}
            onRender={renderOutput}
            targetInfo={targetInfo}
            backgroundGain={backgroundGain}
          />
        </div>

        {/* Sidebar */}
        <SettingsPanel
          project={project}
          targetLanguage={targetLanguage}
          backgroundGain={backgroundGain}
          synthesized={synthesized}
          onChangeLanguage={(v) => {
            const existing = tracks.find((t) => t.languageId === normalizeDubLanguage(v));
            if (existing) selectActiveTrack(existing.id);
            else void addLanguage(v);
          }}
          onApiChange={(patch) => {
            if (
              patch.ttsModel &&
              patch.ttsModel !== project.ttsModel &&
              synthesized
            ) {
              toast({
                title: "Voice API changed",
                description:
                  "Click Re-synthesize so each segment is voiced with the new engine.",
              });
            }
            void updateProject(patch);
          }}
          onChangeCloneVoice={(v) => updateProject({ dubUseVoiceClone: v })}
          onChangeBackgroundGain={(v) => updateProject({ dubBackgroundGain: v })}
          onChangeVoiceTone={(v) => updateProject({ voiceTone: v })}
        />
      </div>
    </div>
  );
}

function PreviewAudioPanel({
  mode,
  onModeChange,
  targetInfo,
  backgroundGain,
  synthesized,
}: {
  mode: DubPreviewMode;
  onModeChange: (mode: DubPreviewMode) => void;
  targetInfo: ReturnType<typeof dubLanguageInfo>;
  backgroundGain: number;
  synthesized: boolean;
}) {
  const modes: Array<{ id: DubPreviewMode; label: string; hint: string }> = [
    {
      id: "original",
      label: "Original",
      hint: "Source audio only (Portuguese)",
    },
    {
      id: "dub",
      label: `${targetInfo.flag} Dub only`,
      hint: `Only the ${targetInfo.label} dub — original muted`,
    },
    {
      id: "mix",
      label: "Mix",
      hint: `Dub + original at ${Math.round(backgroundGain * 100)}% (same as export)`,
    },
  ];

  return (
    <div className="rounded border border-border bg-panel px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Preview audio</div>
        {!synthesized ? (
          <span className="text-2xs text-muted-foreground">Run Voice first</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!synthesized && m.id !== "original"}
            onClick={() => onModeChange(m.id)}
            title={m.hint}
            className={cn(
              "rounded border px-2.5 py-1 text-2xs transition",
              mode === m.id
                ? "border-sky-400/70 bg-sky-500/15 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background",
              !synthesized && m.id !== "original" && "cursor-not-allowed opacity-50",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-2xs text-muted-foreground">
        {mode === "dub"
          ? `Playing ${targetInfo.label} dub on top of muted video — press play on the source player.`
          : mode === "mix"
            ? `Same mix as export: dub at 100% + original at ${Math.round(backgroundGain * 100)}%.`
            : "Original upload audio — no dub overlay."}
      </p>
    </div>
  );
}

function StageDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          done ? "bg-emerald-500" : "bg-muted",
        )}
      />
      {label}
    </span>
  );
}

function SourcePanel({
  source,
  mediaRef,
}: {
  source: DubbingSource | null;
  mediaRef?: React.RefObject<HTMLMediaElement | null>;
}) {
  if (!source) {
    return (
      <div className="rounded border border-border bg-panel p-4 text-sm text-muted-foreground">
        No source uploaded.
      </div>
    );
  }
  const setRef = React.useCallback(
    (el: HTMLMediaElement | null) => {
      if (mediaRef) {
        (mediaRef as React.MutableRefObject<HTMLMediaElement | null>).current = el;
      }
    },
    [mediaRef],
  );
  return (
    <div className="rounded border border-border bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {source.sourceType === "video" ? (
            <Film className="h-4 w-4" />
          ) : (
            <FileAudio className="h-4 w-4" />
          )}
          Source · {source.originalFilename}
        </div>
        <div className="text-2xs text-muted-foreground">
          {formatSeconds(source.durationSeconds)} ·{" "}
          {(source.sizeBytes ?? 0) > 0
            ? `${((source.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)}MB`
            : "—"}
          {source.detectedLanguage ? ` · ${source.detectedLanguage.toUpperCase()}` : ""}
        </div>
      </div>
      {source.sourceType === "video" ? (
        <video
          ref={setRef as (el: HTMLVideoElement | null) => void}
          src={source.sourceUrl}
          controls
          className="w-full rounded bg-black"
          style={{ maxHeight: 360 }}
        />
      ) : (
        <audio
          ref={setRef as (el: HTMLAudioElement | null) => void}
          src={source.sourceUrl}
          controls
          className="w-full"
        />
      )}
    </div>
  );
}

function syncQualityForSegment(segment: DubSegmentClip): {
  color: string;
  label: string;
  hint: string;
} {
  const ratio = segment.stretchRatio ?? 1;
  const overflow = /still slightly over/i.test(segment.errorMessage ?? "");
  if (segment.status === "error") {
    return {
      color: "bg-destructive",
      label: "Error",
      hint: segment.errorMessage ?? "Synthesis failed",
    };
  }
  if (overflow) {
    return {
      color: "bg-red-500",
      label: "Overflow",
      hint: "The dub is longer than the original slot. Try shortening the translation.",
    };
  }
  const dist = Math.abs(ratio - 1);
  if (!segment.ttsAudioUrl) {
    return { color: "bg-muted", label: "Pending", hint: "Not synthesized yet" };
  }
  if (dist <= 0.08) {
    return {
      color: "bg-emerald-500",
      label: "In sync",
      hint: `Stretch ${ratio.toFixed(2)}x — perfectly aligned.`,
    };
  }
  if (dist <= 0.2) {
    return {
      color: "bg-yellow-500",
      label: "Slight stretch",
      hint: `Stretch ${ratio.toFixed(2)}x — small pitch/pace adjustment.`,
    };
  }
  return {
    color: "bg-orange-500",
    label: "Heavy stretch",
    hint: `Stretch ${ratio.toFixed(2)}x — noticeable time-stretch, consider editing the text.`,
  };
}

function SegmentRow({
  index,
  segment,
  clip,
  targetInfo,
  onSaveText,
  onRegenerate,
  selected = false,
  active = false,
  onSelect,
  rowRef,
}: {
  index: number;
  segment: DubbingSegment;
  clip: DubSegmentClip;
  targetInfo: ReturnType<typeof dubLanguageInfo>;
  onSaveText: (text: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  selected?: boolean;
  active?: boolean;
  onSelect?: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const sync = syncQualityForSegment(clip);
  const expanded = selected;
  const [draft, setDraft] = React.useState(clip.translatedText);
  const [saving, setSaving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  React.useEffect(() => {
    setDraft(clip.translatedText);
  }, [clip.translatedText]);

  const dirty = draft !== clip.translatedText;

  async function commit() {
    if (!dirty) return;
    setSaving(true);
    await onSaveText(draft);
    setSaving(false);
  }

  async function regen() {
    setRegenerating(true);
    await onRegenerate();
    setRegenerating(false);
  }

  const sourcePreview = segment.sourceText.trim() || "—";
  const translationPreview = clip.translatedText.trim() || "—";

  if (!expanded) {
    return (
      <button
        type="button"
        ref={rowRef as React.Ref<HTMLButtonElement>}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted/30",
          active && "bg-sky-500/5",
        )}
      >
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn("inline-block h-2 w-2 shrink-0 rounded-full", sync.color)}
          title={sync.hint}
        />
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">#{index}</span>
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">
          {formatSeconds(segment.startSeconds)}→{formatSeconds(segment.endSeconds)}
        </span>
        <span
          className={cn(
            "hidden shrink-0 text-2xs sm:inline",
            sync.color.includes("emerald") && "text-emerald-500",
            sync.color.includes("yellow") && "text-yellow-500",
            sync.color.includes("orange") && "text-orange-500",
            (sync.color.includes("red") || sync.color === "bg-destructive") && "text-destructive",
          )}
        >
          {sync.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {sourcePreview}
        </span>
        <span className="shrink-0 text-muted-foreground/50">→</span>
        <span className="min-w-0 max-w-[40%] truncate">{translationPreview}</span>
      </button>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "border-l-2 border-sky-400/70 bg-muted/10",
        active && "bg-sky-500/5",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-2xs text-muted-foreground hover:bg-muted/20"
      >
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", sync.color)} />
        <span className="font-mono">#{index}</span>
        <span className="font-mono">
          {formatSeconds(segment.startSeconds)} → {formatSeconds(segment.endSeconds)}
        </span>
        <span className="truncate">{sync.label}</span>
      </button>

      <div
        className="grid grid-cols-1 gap-2 p-3 text-sm md:grid-cols-[80px_1fr_1fr_140px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xs text-muted-foreground">
          <div
            className={cn(
              "mt-0.5",
              sync.color.includes("emerald") && "text-emerald-500",
              sync.color.includes("yellow") && "text-yellow-500",
              sync.color.includes("orange") && "text-orange-500",
              (sync.color.includes("red") || sync.color === "bg-destructive") && "text-destructive",
            )}
            title={sync.hint}
          >
          {sync.label}
          {clip.stretchRatio ? ` · ${clip.stretchRatio.toFixed(2)}x` : ""}
          </div>
        </div>

        <div className="min-w-0">
          <Label className="mb-0.5 block text-2xs text-muted-foreground">
            Original ({segment.sourceLanguage ?? "?"})
          </Label>
          <div className="rounded bg-background/60 px-2 py-1.5 text-sm">
            {segment.sourceText || <span className="italic text-muted-foreground">—</span>}
          </div>
        </div>

        <div className="min-w-0">
          <Label className="mb-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
            <span>{targetInfo.flag}</span>
            Translation ({targetInfo.label})
          </Label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={2}
            className="text-sm"
            placeholder={clip.status === "transcribed" ? "Waiting for translation…" : ""}
          />
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {clip.ttsAudioUrl ? (
            <audio src={clip.ttsAudioUrl} controls className="w-full" />
          ) : (
            <div className="w-full text-2xs text-muted-foreground">No dub yet</div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={regen}
            disabled={regenerating || saving || !draft.trim()}
            className="h-7 w-full"
          >
            {regenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                Re-voice
              </>
            )}
          </Button>
          {clip.errorMessage ? (
            <div
              className={cn(
                "w-full truncate text-2xs",
                clip.status === "error"
                  ? "text-destructive"
                  : "text-orange-500",
              )}
              title={clip.errorMessage}
            >
              {clip.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RendersPanel({
  renders,
  synthesized,
  hasVideoSource,
  rendering,
  onRender,
  targetInfo,
  backgroundGain,
}: {
  renders: DubbingRender[];
  synthesized: boolean;
  hasVideoSource: boolean;
  rendering: null | "video" | "audio";
  onRender: (kind: "video" | "audio") => Promise<void>;
  targetInfo: ReturnType<typeof dubLanguageInfo>;
  backgroundGain: number;
}) {
  const gainLabel =
    backgroundGain <= 0.001
      ? "dub only"
      : `dub + ${Math.round(backgroundGain * 100)}% original`;

  return (
    <div className="rounded border border-border bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          Export · {targetInfo.flag} {targetInfo.label}
        </div>
        <span className="text-2xs text-muted-foreground">{gainLabel}</span>
      </div>
      <p className="mb-2 text-2xs text-muted-foreground">
        Exports the <b>active track</b> (highlighted row on the timeline). Add
        Spanish with <b>+ Language</b>, then export each row separately.
      </p>
      <div className="flex flex-wrap gap-2">
        {hasVideoSource ? (
          <Button
            size="sm"
            disabled={!synthesized || !!rendering}
            onClick={() => onRender("video")}
          >
            {rendering === "video" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            MP4 ({targetInfo.label})
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!synthesized || !!rendering}
          onClick={() => onRender("audio")}
        >
          {rendering === "audio" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Volume2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          MP3 ({targetInfo.label})
        </Button>
      </div>
      {renders.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border/60 pt-2">
          {renders.slice(0, 5).map((r) => (
            <a
              key={r.id}
              href={r.url}
              download
              className="flex items-center justify-between rounded border border-border/60 bg-background/40 px-2 py-1 text-xs hover:bg-background"
            >
              <span className="flex items-center gap-2">
                {r.kind === "video" ? (
                  <Film className="h-3 w-3" />
                ) : (
                  <FileAudio className="h-3 w-3" />
                )}
                {r.kind.toUpperCase()} ·{" "}
                {r.targetLanguage
                  ? dubLanguageInfo(r.targetLanguage).flag
                  : ""}{" "}
                {r.targetLanguage?.toUpperCase()} ·{" "}
                {new Date(r.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <Download className="h-3 w-3" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingsPanel({
  project,
  targetLanguage,
  backgroundGain,
  synthesized,
  onChangeLanguage,
  onApiChange,
  onChangeCloneVoice,
  onChangeBackgroundGain,
  onChangeVoiceTone,
}: {
  project: Project;
  targetLanguage: string;
  backgroundGain: number;
  synthesized: boolean;
  onChangeLanguage: (v: string) => void;
  onApiChange: (patch: Partial<ProjectApiModels>) => void;
  onChangeCloneVoice: (v: boolean) => void;
  onChangeBackgroundGain: (v: number) => void;
  onChangeVoiceTone: (v: string) => void;
}) {
  const [gainDraft, setGainDraft] = React.useState(backgroundGain);
  const [toneDraft, setToneDraft] = React.useState(project.voiceTone ?? "");

  React.useEffect(() => setGainDraft(backgroundGain), [backgroundGain]);
  React.useEffect(() => setToneDraft(project.voiceTone ?? ""), [project.voiceTone]);

  return (
    <aside className="space-y-3">
      <div className="rounded border border-border bg-panel p-3">
        <Label className="mb-1 flex items-center gap-1 text-xs">
          <Languages className="h-3 w-3" /> Target language
        </Label>
        <Select value={targetLanguage} onValueChange={onChangeLanguage}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUB_LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="mr-1">{l.flag}</span> {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {synthesized ? (
          <p className="mt-1.5 text-2xs text-muted-foreground">
            Switch track to edit another language, or use <b>+ Language</b> on
            the timeline to add a new row.
          </p>
        ) : (
          <p className="mt-1.5 text-2xs text-muted-foreground">
            Active track for editing, preview and export. Add more rows on the
            timeline.
          </p>
        )}
      </div>

      <DubbingApiSettings
        models={projectApiModelsFromProject(project)}
        useVoiceClone={!!project.dubUseVoiceClone}
        clonedVoiceId={project.dubClonedVoiceId}
        onApiChange={onApiChange}
        onChangeCloneVoice={onChangeCloneVoice}
      />

      <div className="rounded border border-border bg-panel p-3">
        <Label className="mb-1 flex items-center gap-1 text-xs">
          <Waves className="h-3 w-3" /> Original audio behind
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={gainDraft}
            onChange={(e) => setGainDraft(Number(e.target.value))}
            onMouseUp={() => onChangeBackgroundGain(gainDraft)}
            onTouchEnd={() => onChangeBackgroundGain(gainDraft)}
            className="flex-1"
          />
          <span className="w-10 text-right text-2xs tabular-nums text-muted-foreground">
            {Math.round(gainDraft * 100)}%
          </span>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          0% = clean · 15% = documentary · higher keeps music/ambience.
        </p>
      </div>

      <div className="rounded border border-border bg-panel p-3">
        <Label className="mb-1 text-xs">Voice tone / style</Label>
        <Input
          value={toneDraft}
          onChange={(e) => setToneDraft(e.target.value)}
          onBlur={() => onChangeVoiceTone(toneDraft.trim() || "natural")}
          className="h-8 text-xs"
          placeholder="natural, warm, energetic…"
          maxLength={60}
        />
      </div>
    </aside>
  );
}
