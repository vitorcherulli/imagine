"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProjectHeader, type ExportResolutionId } from "@/components/ProjectHeader";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { Timeline, type TimelineVolumes } from "@/components/timeline/Timeline";
import { TimelineToolbar } from "@/components/timeline/TimelineToolbar";
import { BlockDetailPanel } from "@/components/BlockDetailPanel";
import { TimelineSplitPane } from "@/components/TimelineSplitPane";
import { MusicPanel } from "@/components/MusicPanel";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import {
  blockRequiresNarrationAudio,
  normalizeCutPace,
  normalizeNarrationMode,
  CUT_PACE_OPTIONS,
  NARRATION_MODE_OPTIONS,
  type CutPaceId,
  type NarrationModeId,
} from "@/lib/cut-pace";
import { useToast } from "@/components/ui/use-toast";
import type { Avatar, Project, ProjectDna, StoryBlock } from "@/lib/db/schema";
import type { ProjectApiModels } from "@/lib/project-api-models";
import { getVideoFormatSpec, normalizeVideoFormat, type VideoFormat } from "@/lib/video-format";
import { serializeStyleBible, type StyleBible } from "@/lib/style-bible";
import { normalizeCaptionMode, type CaptionMode } from "@/lib/captions";
import { cn } from "@/lib/utils";
import { parseProjectAvatarIds } from "@/lib/project-avatars";
import type { AvatarCastValue } from "@/components/AvatarCastPicker";
import type { ProjectExportItem } from "@/lib/export-history";
import { fetchProjectExports } from "@/lib/export-history";
import {
  narrationSpeedIdForValue,
  normalizeTtsSpeed,
  ttsSpeedForId,
  type NarrationSpeedId,
} from "@/lib/narration-speed";

interface Props {
  project: Project;
  initialBlocks: StoryBlock[];
  initialExports?: ProjectExportItem[];
  avatars: Avatar[];
  projectDna: ProjectDna[];
  initialAvatar: Avatar | null;
}

function patchProjectShallow(prev: Project, patch: Partial<Project>): Project {
  return { ...prev, ...patch };
}

function triggerFileDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function ProjectEditor({
  project: initialProject,
  initialBlocks,
  initialExports = [],
  avatars,
  projectDna,
  initialAvatar,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = React.useState<Project>(initialProject);
  const [musicPanelOpen, setMusicPanelOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [blocks, setBlocks] = React.useState<StoryBlock[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(
    initialBlocks[0]?.id ?? null,
  );
  const [currentTime, setCurrentTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [pxPerSecond, setPxPerSecond] = React.useState(30);

  function scrubTo(t: number) {
    setPlaying(false);
    setCurrentTime(t);
  }

  const [storyBusy, setStoryBusy] = React.useState(false);
  const [keyframesBusy, setKeyframesBusy] = React.useState(false);
  const [narrationBusy, setNarrationBusy] = React.useState(false);
  const [mediaBusy, setMediaBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [projectExports, setProjectExports] = React.useState<ProjectExportItem[]>(initialExports);
  const [exportsRefreshing, setExportsRefreshing] = React.useState(false);
  const [avatarCast, setAvatarCast] = React.useState<AvatarCastValue>(() => {
    const ids = parseProjectAvatarIds(initialProject.avatarIds);
    if (ids.length > 0) {
      return {
        selectedIds: ids,
        primaryId: initialProject.avatarId ?? ids[0] ?? null,
      };
    }
    if (initialAvatar) {
      return { selectedIds: [initialAvatar.id], primaryId: initialAvatar.id };
    }
    return { selectedIds: [], primaryId: null };
  });
  const avatar = React.useMemo(
    () => avatars.find((a) => a.id === avatarCast.primaryId) ?? null,
    [avatars, avatarCast.primaryId],
  );
  const volumeSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVolumePatch = React.useRef<Partial<TimelineVolumes>>({});

  const avatarMap = React.useMemo(
    () =>
      Object.fromEntries(
        avatars.map((a) => [a.id, { id: a.id, name: a.name, primaryImageUrl: a.primaryImageUrl }]),
      ),
    [avatars],
  );

  const timelineVolumes = React.useMemo<TimelineVolumes>(
    () => ({
      master: project.masterVolume ?? 100,
      narration: project.narrationVolume ?? 100,
      scene: project.sceneVolume ?? 60,
      music: project.musicVolume ?? 30,
    }),
    [
      project.masterVolume,
      project.narrationVolume,
      project.sceneVolume,
      project.musicVolume,
    ],
  );

  function setTimelineVolumes(patch: Partial<TimelineVolumes>) {
    pendingVolumePatch.current = { ...pendingVolumePatch.current, ...patch };
    setProject((prev) =>
      patchProjectShallow(prev, {
        ...(patch.master !== undefined ? { masterVolume: patch.master } : {}),
        ...(patch.narration !== undefined ? { narrationVolume: patch.narration } : {}),
        ...(patch.scene !== undefined ? { sceneVolume: patch.scene } : {}),
        ...(patch.music !== undefined ? { musicVolume: patch.music } : {}),
      }),
    );
    if (volumeSaveRef.current) clearTimeout(volumeSaveRef.current);
    volumeSaveRef.current = setTimeout(() => {
      const body = pendingVolumePatch.current;
      pendingVolumePatch.current = {};
      void (async () => {
        try {
          const payload: Record<string, number> = {};
          if (body.master !== undefined) payload.masterVolume = body.master;
          if (body.narration !== undefined) payload.narrationVolume = body.narration;
          if (body.scene !== undefined) payload.sceneVolume = body.scene;
          if (body.music !== undefined) payload.musicVolume = body.music;
          if (Object.keys(payload).length === 0) return;
          const res = await fetch(`/api/projects/${project.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch {
          toast({ variant: "destructive", title: "Could not save volume" });
        }
      })();
    }, 400);
  }

  React.useEffect(() => {
    return () => {
      if (volumeSaveRef.current) clearTimeout(volumeSaveRef.current);
    };
  }, []);

  async function setProjectAvatarCast(next: AvatarCastValue) {
    const previous = avatarCast;
    setAvatarCast(next);
    setProject((prev) =>
      patchProjectShallow(prev, {
        avatarId: next.primaryId,
        avatarIds: JSON.stringify(next.selectedIds),
      }),
    );
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          avatarId: next.primaryId,
          avatarIds: next.selectedIds,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const count = next.selectedIds.length;
      toast({
        variant: "success",
        title:
          count === 0
            ? "Cast cleared"
            : count === 1
              ? `Cast: ${avatars.find((a) => a.id === next.primaryId)?.name ?? "1 character"}`
              : `${count} characters in cast`,
      });
    } catch (err) {
      setAvatarCast(previous);
      setProject((prev) =>
        patchProjectShallow(prev, {
          avatarId: previous.primaryId,
          avatarIds: JSON.stringify(previous.selectedIds),
        }),
      );
      toast({
        variant: "destructive",
        title: "Could not update cast",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function setProjectCutSettings(patch: {
    cutPace?: CutPaceId;
    narrationMode?: NarrationModeId;
  }) {
    const previous = {
      cutPace: normalizeCutPace(project.cutPace),
      narrationMode: normalizeNarrationMode(project.narrationMode),
    };
    setProject((prev) => patchProjectShallow(prev, patch));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setProject((prev) => patchProjectShallow(prev, previous));
      toast({ variant: "destructive", title: "Could not save cut pace" });
    }
  }

  async function setProjectBrief(patch: { projectDnaId?: string | null; storyDescription?: string }) {
    const previous = {
      projectDnaId: project.projectDnaId ?? null,
      storyDescription: project.storyDescription,
    };
    setProject((prev) => patchProjectShallow(prev, patch));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setProject((prev) => patchProjectShallow(prev, previous));
      toast({ variant: "destructive", title: "Could not save brief" });
    }
  }

  async function setProjectVideoFormat(format: VideoFormat) {
    const next = normalizeVideoFormat(format);
    const previous = normalizeVideoFormat(project.videoFormat);
    if (next === previous) return;
    setProject((prev) => patchProjectShallow(prev, { videoFormat: next }));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoFormat: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({
        variant: "success",
        title: next === "vertical" ? "Format: Reels / Shorts (9:16)" : "Format: YouTube (16:9)",
      });
    } catch (err) {
      setProject((prev) => patchProjectShallow(prev, { videoFormat: previous }));
      toast({
        variant: "destructive",
        title: "Could not update video format",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function setProjectApiModels(models: ProjectApiModels) {
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(models),
      });
      if (!res.ok) throw new Error(await res.text());
      setProject((prev) => ({
        ...prev,
        llmModel: models.llmModel,
        imageModel: models.imageModel,
        videoModel: models.videoModel,
        ttsModel: models.ttsModel,
        ttsVoice: models.ttsVoice,
      }));
      toast({ variant: "success", title: "API models updated" });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not update API models",
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async function setProjectCaptionMode(mode: CaptionMode) {
    const previous = normalizeCaptionMode(project.captionMode);
    if (mode === previous) return;
    setProject((prev) => patchProjectShallow(prev, { captionMode: mode }));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captionMode: mode }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setProject((prev) => patchProjectShallow(prev, { captionMode: previous }));
      toast({
        variant: "destructive",
        title: "Could not save captions",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalDuration = blocks.reduce((acc, b) => acc + b.durationSeconds, 0);

  // Clamp currentTime when total duration shrinks (e.g. block deleted or duration probed shorter).
  React.useEffect(() => {
    if (currentTime > totalDuration) {
      setCurrentTime(Math.max(0, totalDuration));
      setPlaying(false);
    }
  }, [totalDuration, currentTime]);

  const selectedBlock = React.useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );

  const anyGenerating = React.useMemo(
    () =>
      blocks.some(
        (b) => b.status === "generating" || b.status.endsWith("_generating"),
      ),
    [blocks],
  );
  const musicGenerating = project.musicStatus === "generating";

  React.useEffect(() => {
    if (!anyGenerating && !musicGenerating) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setBlocks(data.blocks ?? []);
        if (data.project) setProject((prev) => patchProjectShallow(prev, data.project));
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyGenerating, musicGenerating, project.id]);

  function patchBlock(id: string, patch: Partial<StoryBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function removeBlock(id: string) {
    setBlocks((prev) =>
      prev
        .filter((b) => b.id !== id)
        .map((b, i) => ({ ...b, position: i })),
    );
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function applyStyleBibleUpdate(next: {
    styleBible: StyleBible | null;
    anchorImageUrl: string | null;
  }) {
    setProject((prev) =>
      patchProjectShallow(prev, {
        styleBible: next.styleBible ? serializeStyleBible(next.styleBible) : prev.styleBible,
        anchorImageUrl: next.anchorImageUrl ?? prev.anchorImageUrl,
      }),
    );
  }

  async function generateStory() {
    setStoryBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/story`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setBlocks(data.blocks ?? []);
      setSelectedBlockId((data.blocks?.[0]?.id as string) ?? null);
      setCurrentTime(0);
      if (data.styleBible) {
        applyStyleBibleUpdate({
          styleBible: data.styleBible as StyleBible,
          anchorImageUrl: data.anchorImageUrl ?? null,
        });
      }
      router.refresh();
      if (data.styleBibleError) {
        toast({
          variant: "default",
          title: "Story ready — editorial line did not auto-generate",
          description:
            "Open Style and click “Generate from story”. " +
            String(data.styleBibleError).slice(0, 120),
        });
      } else if (data.styleBible) {
        toast({
          variant: "success",
          title: "Story + editorial line ready",
          description: data.anchorImageUrl
            ? "Style bible and visual reference created. Review in Style, then generate keyframes."
            : "Style bible created. Open Style to generate the visual reference, then keyframes.",
        });
      } else {
        toast({ variant: "success", title: "Story generated" });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Story generation failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setStoryBusy(false);
    }
  }

  async function generateAllKeyframes() {
    setKeyframesBusy(true);
    try {
      await Promise.all(
        blocks
          .filter((b) => !b.keyframeUrl)
          .map((b) =>
            fetch(`/api/blocks/${b.id}/keyframe`, { method: "POST" })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
                patchBlock(b.id, { status: "image_generating", errorMessage: null });
              })
              .catch((e) =>
                toast({
                  variant: "destructive",
                  title: `Block ${b.position + 1} keyframe`,
                  description: e instanceof Error ? e.message : "Failed",
                }),
              ),
          ),
      );
    } finally {
      setKeyframesBusy(false);
    }
  }

  async function setNarrationSpeed(id: NarrationSpeedId) {
    const ttsSpeed = ttsSpeedForId(id);
    setProject((prev) => patchProjectShallow(prev, { ttsSpeed }));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsSpeed }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save narration speed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function generateAllNarration() {
    setNarrationBusy(true);
    const speed = normalizeTtsSpeed(project.ttsSpeed ?? 1);
    try {
      await Promise.all(
        blocks
          .filter((b) => blockRequiresNarrationAudio(b) && !b.audioUrl && b.narrativeText.trim())
          .map((b) =>
            fetch(`/api/blocks/${b.id}/audio`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ speed }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
                patchBlock(b.id, { status: "audio_generating", errorMessage: null });
              })
              .catch((e) =>
                toast({
                  variant: "destructive",
                  title: `Block ${b.position + 1} narration`,
                  description: e instanceof Error ? e.message : "Failed",
                }),
              ),
          ),
      );
    } finally {
      setNarrationBusy(false);
    }
  }

  async function generateAllMedia() {
    setMediaBusy(true);
    try {
      await Promise.all(
        blocks
          .filter(
            (b) =>
              !b.videoUrl ||
              (blockRequiresNarrationAudio(b) ? !b.audioUrl : false),
          )
          .map((b) =>
            fetch(`/api/blocks/${b.id}/media`, { method: "POST" })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
                patchBlock(b.id, { status: "generating", errorMessage: null });
              })
              .catch((e) =>
                toast({
                  variant: "destructive",
                  title: `Block ${b.position + 1} media`,
                  description: e instanceof Error ? e.message : "Failed",
                }),
              ),
          ),
      );
    } finally {
      setMediaBusy(false);
    }
  }

  async function reorderBlocks(newOrder: StoryBlock[]) {
    const reorderedWithPositions = newOrder.map((b, i) => ({ ...b, position: i }));
    setBlocks(reorderedWithPositions);
    try {
      await Promise.all(
        reorderedWithPositions.map((b) =>
          fetch(`/api/blocks/${b.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: b.position }),
          }),
        ),
      );
    } catch {
      toast({ variant: "destructive", title: "Could not save reorder" });
    }
  }

  function onPrevBlock() {
    let elapsed = 0;
    for (const b of blocks) {
      if (currentTime < elapsed + 0.05) {
        const prev = blocks[blocks.indexOf(b) - 1];
        if (prev) {
          let prevStart = 0;
          for (const x of blocks) {
            if (x.id === prev.id) break;
            prevStart += x.durationSeconds;
          }
          setCurrentTime(prevStart);
          setSelectedBlockId(prev.id);
        } else {
          setCurrentTime(0);
        }
        return;
      }
      if (currentTime < elapsed + b.durationSeconds) {
        setCurrentTime(elapsed);
        setSelectedBlockId(b.id);
        return;
      }
      elapsed += b.durationSeconds;
    }
  }
  function onNextBlock() {
    let elapsed = 0;
    for (const b of blocks) {
      if (currentTime < elapsed + b.durationSeconds) {
        const nextStart = elapsed + b.durationSeconds;
        if (nextStart < totalDuration) {
          setCurrentTime(nextStart);
          const nb = blocks[blocks.indexOf(b) + 1];
          if (nb) setSelectedBlockId(nb.id);
        }
        return;
      }
      elapsed += b.durationSeconds;
    }
  }

  function fitTimeline() {
    if (totalDuration <= 0) return;
    const target = Math.max(8, Math.min(60, Math.floor(900 / totalDuration)));
    setPxPerSecond(target);
  }

  const refreshExports = React.useCallback(async () => {
    setExportsRefreshing(true);
    try {
      const next = await fetchProjectExports(project.id);
      setProjectExports(next);
    } finally {
      setExportsRefreshing(false);
    }
  }, [project.id]);

  async function exportFinal(resolution: ExportResolutionId = "1080p") {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      let data: {
        finalVideoUrl?: string;
        mode?: string;
        resolutionLabel?: string;
        downloadFilename?: string;
        version?: number;
        error?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        // fall through to error handling below
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Export failed (${res.status})`);
      }
      await refreshExports();
      const versionLabel = data.version ? `v${data.version}` : "new export";
      toast({
        variant: "success",
        title: `Exported ${versionLabel} · ${data.resolutionLabel ?? resolution}`,
        description: "Saved to Exports — download again anytime.",
      });
      if (data.finalVideoUrl) {
        triggerFileDownload(
          data.finalVideoUrl,
          data.downloadFilename ?? `${project.title}-${resolution}.mp4`,
        );
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setExporting(false);
    }
  }

  const exportBlockerReason = React.useMemo(() => {
    if (blocks.length === 0) return "Add at least one block to export.";
    const noVideo = blocks.filter((b) => !b.videoUrl);
    if (noVideo.length > 0) {
      return `${noVideo.length} block(s) without video — generate media first.`;
    }
    return null;
  }, [blocks]);

  const canExport = exportBlockerReason === null;

  const canGenerateKeyframes = blocks.length > 0;
  const canGenerateNarration =
    blocks.length > 0 && blocks.some((b) => b.narrativeText.trim());
  const canGenerateMedia =
    blocks.length > 0 && blocks.every((b) => b.keyframeUrl);

  const togglePlay = React.useCallback(() => {
    setPlaying((prev) => !prev);
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);

  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const isVertical = formatSpec.id === "vertical";

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        onExport={exportFinal}
        canExport={canExport}
        exportBlockerReason={exportBlockerReason}
        exporting={exporting}
        projectExports={projectExports}
        onRefreshExports={refreshExports}
        exportsRefreshing={exportsRefreshing}
        avatars={avatars}
        avatarCast={avatarCast}
        onAvatarCastChange={setProjectAvatarCast}
        onApiModelsChange={setProjectApiModels}
        onStyleBibleUpdated={applyStyleBibleUpdate}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col bg-panel">
            <TimelineSplitPane
              top={
                <div
                  className={cn(
                    "grid grid-cols-1 gap-3 p-3",
                    isVertical ? "md:grid-cols-[minmax(0,280px)_1fr]" : "md:grid-cols-[1fr_320px]",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg border border-border bg-background p-2",
                      isVertical && "flex justify-center",
                    )}
                  >
                    <PreviewPlayer
                      blocks={blocks}
                      currentTime={currentTime}
                      playing={playing}
                      onTimeChange={setCurrentTime}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      musicUrl={project.musicUrl ?? null}
                      musicVolume={project.musicVolume ?? 30}
                      narrationVolume={project.narrationVolume ?? 100}
                      sceneVolume={project.sceneVolume ?? 60}
                      masterVolume={project.masterVolume ?? 100}
                      videoFormat={project.videoFormat}
                      captionMode={project.captionMode}
                    />
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Project</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettingsOpen(true)}
                        title="Open project settings"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Settings
                      </Button>
                    </div>
                    <dl className="mt-3 space-y-1.5 text-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Format</dt>
                        <dd className="truncate font-medium">{formatSpec.shortLabel}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Cut pace</dt>
                        <dd className="truncate font-medium">
                          {CUT_PACE_OPTIONS.find(
                            (o) => o.id === normalizeCutPace(project.cutPace),
                          )?.label ?? "—"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Narration</dt>
                        <dd className="truncate font-medium">
                          {NARRATION_MODE_OPTIONS.find(
                            (o) => o.id === normalizeNarrationMode(project.narrationMode),
                          )?.label ?? "—"}
                        </dd>
                      </div>
                    </dl>
                    <ul className="mt-3 space-y-0.5 border-t border-border pt-2 text-2xs text-muted-foreground">
                      <li>{blocks.length} blocks · {totalDuration}s total</li>
                      <li>
                        {blocks.filter((b) => b.keyframeUrl).length} keyframes,{" "}
                        {blocks.filter((b) => b.videoUrl).length} videos,{" "}
                        {blocks.filter((b) => b.audioUrl).length} audios
                      </li>
                    </ul>
                  </div>
                </div>
              }
              bottom={
                <>
                  <TimelineToolbar
                    playing={playing}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onPrev={onPrevBlock}
                    onNext={onNextBlock}
                    onZoomIn={() => setPxPerSecond((p) => Math.min(120, p + 10))}
                    onZoomOut={() => setPxPerSecond((p) => Math.max(4, p - 10))}
                    onFit={fitTimeline}
                    currentTime={currentTime}
                    totalTime={totalDuration}
                    pxPerSecond={pxPerSecond}
                    onGenerateStory={generateStory}
                    onGenerateAllKeyframes={generateAllKeyframes}
                    onGenerateAllNarration={generateAllNarration}
                    onGenerateAllMedia={generateAllMedia}
                    onOpenMusic={() => setMusicPanelOpen(true)}
                    storyBusy={storyBusy}
                    keyframesBusy={keyframesBusy}
                    narrationBusy={narrationBusy}
                    mediaBusy={mediaBusy}
                    musicBusy={project.musicStatus === "generating"}
                    musicReady={!!project.musicUrl}
                    canGenerateKeyframes={canGenerateKeyframes}
                    canGenerateNarration={canGenerateNarration}
                    canGenerateMedia={canGenerateMedia}
                    narrationSpeedId={narrationSpeedIdForValue(project.ttsSpeed ?? 1)}
                    onNarrationSpeedChange={setNarrationSpeed}
                  />
                  <div className="min-h-0 flex-1">
                    <Timeline
                      blocks={blocks}
                      pxPerSecond={pxPerSecond}
                      currentTime={currentTime}
                      playing={playing}
                      onScrub={scrubTo}
                      selectedBlockId={selectedBlockId}
                      onSelect={setSelectedBlockId}
                      onReorder={reorderBlocks}
                      musicUrl={project.musicUrl}
                      musicStatus={project.musicStatus}
                      musicPrompt={project.musicPrompt}
                      onMusicClick={() => setMusicPanelOpen(true)}
                      volumes={timelineVolumes}
                      onVolumesChange={setTimelineVolumes}
                      projectAvatarId={project.avatarId ?? null}
                      avatarMap={avatarMap}
                      videoFormat={project.videoFormat}
                    />
                  </div>
                </>
              }
            />
          </div>
        </div>

        <BlockDetailPanel
          block={selectedBlock}
          avatars={avatars}
          projectAvatarId={project.avatarId ?? null}
          projectAvatarName={avatar?.name ?? null}
          videoFormat={project.videoFormat}
          onPatched={patchBlock}
          onRemoved={removeBlock}
        />
      </div>

      {musicPanelOpen && (
        <MusicPanel
          project={project}
          onClose={() => setMusicPanelOpen(false)}
          onChange={(patch) => setProject((prev) => patchProjectShallow(prev, patch))}
        />
      )}

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={project}
        projectDnaItems={projectDna}
        onVideoFormatChange={setProjectVideoFormat}
        onCaptionModeChange={setProjectCaptionMode}
        onCutSettingsChange={setProjectCutSettings}
        onBriefChange={(patch) => setProject((prev) => patchProjectShallow(prev, patch))}
        onBriefSave={setProjectBrief}
      />
    </div>
  );
}
