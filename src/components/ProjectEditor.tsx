"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProjectHeader, type ExportResolutionId } from "@/components/ProjectHeader";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { Timeline, type TimelineVolumes } from "@/components/timeline/Timeline";
import { TimelineToolbar } from "@/components/timeline/TimelineToolbar";
import { BlockDetailPanel } from "@/components/BlockDetailPanel";
import { MusicPanel } from "@/components/MusicPanel";
import { useToast } from "@/components/ui/use-toast";
import type { Avatar, Project, StoryBlock } from "@/lib/db/schema";
import type { ProjectApiModels } from "@/lib/project-api-models";

interface Props {
  project: Project;
  initialBlocks: StoryBlock[];
  avatars: Avatar[];
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

export function ProjectEditor({ project: initialProject, initialBlocks, avatars, initialAvatar }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = React.useState<Project>(initialProject);
  const [musicPanelOpen, setMusicPanelOpen] = React.useState(false);
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
  const [finalVideoUrl, setFinalVideoUrl] = React.useState<string | null>(null);
  const [avatar, setAvatar] = React.useState<Avatar | null>(initialAvatar);
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

  async function setProjectAvatar(nextId: string | null) {
    const previous = avatar;
    const found = nextId ? avatars.find((a) => a.id === nextId) ?? null : null;
    setAvatar(found);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarId: nextId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({
        variant: "success",
        title: found ? `Avatar set to ${found.name}` : "Avatar removed",
      });
    } catch (err) {
      setAvatar(previous);
      toast({
        variant: "destructive",
        title: "Could not update avatar",
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

  async function generateStory() {
    setStoryBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/story`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setBlocks(data.blocks ?? []);
      setSelectedBlockId((data.blocks?.[0]?.id as string) ?? null);
      setCurrentTime(0);
      // Pull fresh project state so the new style bible / anchor are reflected
      // in the Style dialog and downstream keyframe generations.
      router.refresh();
      if (data.styleBibleError) {
        toast({
          variant: "default",
          title: "Story generated — style bible skipped",
          description:
            "Open the Style panel to generate it manually. " +
            String(data.styleBibleError).slice(0, 120),
        });
      } else if (data.styleBible) {
        toast({
          variant: "success",
          title: "Story + editorial line ready",
          description: data.anchorImageUrl
            ? "Editorial reference generated. Review in Style panel, then generate keyframes."
            : "Open Style panel to generate the editorial reference, then keyframes.",
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

  async function generateAllNarration() {
    setNarrationBusy(true);
    try {
      await Promise.all(
        blocks
          .filter((b) => !b.audioUrl && b.narrativeText.trim())
          .map((b) =>
            fetch(`/api/blocks/${b.id}/audio`, { method: "POST" })
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
          .filter((b) => !(b.videoUrl && b.audioUrl))
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
      setFinalVideoUrl(data.finalVideoUrl ?? null);
      toast({
        variant: "success",
        title: `Exported MP4 · ${data.resolutionLabel ?? resolution}`,
        description: "Download started — use the Download button to get the file again.",
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
    const incomplete = blocks.filter((b) => !b.videoUrl || !b.audioUrl);
    if (incomplete.length === 0) return null;
    const noVideo = incomplete.filter((b) => !b.videoUrl).length;
    const noAudio = incomplete.filter((b) => !b.audioUrl).length;
    const parts: string[] = [];
    if (noVideo > 0) parts.push(`${noVideo} block(s) without video`);
    if (noAudio > 0) parts.push(`${noAudio} block(s) without narration`);
    return parts.join(" · ");
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

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        onExport={exportFinal}
        canExport={canExport}
        exportBlockerReason={exportBlockerReason}
        exporting={exporting}
        finalVideoUrl={finalVideoUrl}
        avatars={avatars}
        avatar={avatar}
        onAvatarChange={setProjectAvatar}
        onApiModelsChange={setProjectApiModels}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col bg-panel">
            <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[1fr_320px]">
              <div className="rounded-lg border border-border bg-background p-2">
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
                />
              </div>
              <div className="rounded-lg border border-border bg-background p-3 text-xs">
                <h3 className="text-sm font-semibold">Project</h3>
                <p className="mt-1 line-clamp-3 text-2xs text-muted-foreground">
                  {project.storyDescription}
                </p>
                <ul className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
                  <li>{blocks.length} blocks</li>
                  <li>{totalDuration}s total</li>
                  <li>
                    {blocks.filter((b) => b.keyframeUrl).length} keyframes,{" "}
                    {blocks.filter((b) => b.videoUrl).length} videos,{" "}
                    {blocks.filter((b) => b.audioUrl).length} audios
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-1 flex-1 overflow-hidden">
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
              />
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
              />
            </div>
          </div>
        </div>

        <BlockDetailPanel
          block={selectedBlock}
          avatars={avatars}
          projectAvatarId={project.avatarId ?? null}
          projectAvatarName={avatar?.name ?? null}
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
    </div>
  );
}
