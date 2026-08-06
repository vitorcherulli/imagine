"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProjectHeader } from "@/components/ProjectHeader";
import { DEFAULT_EXPORT_QUALITY, type ExportQualityId } from "@/lib/export-quality";
import type { ExportResolutionId } from "@/lib/export-resolutions";
import { pollProjectExport, type ExportPollResult } from "@/lib/export-poll-client";
import type { ExportProgressUiState } from "@/components/ExportProgressPanel";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { usePreviewWarmup } from "@/hooks/use-preview-warmup";
import { usePlatformPreviewDefaults } from "@/hooks/use-platform-preview-defaults";
import { previewModeLabel, resolvePreviewSettings, type ProjectPreviewMode } from "@/lib/preview-settings";
import { clearBlockPreviewCache, syncBlockPreviewCache } from "@/lib/preview-video-cache";
import { Timeline, type TimelineVolumes } from "@/components/timeline/Timeline";
import { TimelineToolbar } from "@/components/timeline/TimelineToolbar";
import { BlockDetailPanel } from "@/components/BlockDetailPanel";
import { TimelineSplitPane } from "@/components/TimelineSplitPane";
import { VERTICAL_PREVIEW_RESERVE, readPreviewFloating, readProjectSummaryCollapsed, writePreviewFloating, writeProjectSummaryCollapsed } from "@/lib/layout-preferences";
import { snapTimelineDurationSeconds } from "@/lib/timeline-duration";
import { resolveTimelineVisualAtTime } from "@/lib/timeline-preview-media";
import { PAUSE_PRESET_SECONDS } from "@/lib/script-pause";
import { getAudioWaveform } from "@/lib/audio-waveform-client";
import {
  leadBlockForNarrationGroup,
  narrationGroupForBlock,
  planFitVisualCutsToAudio,
  continuousSpeechNarrationGroups,
  canFitVisualCutsGroupToAudio,
} from "@/lib/timeline-narration-group";
import { isVisualCutOnly } from "@/lib/cut-pace";
import type { BlockMediaField } from "@/lib/block-media";
import { MusicPanel } from "@/components/MusicPanel";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { DnaEvolveDialog } from "@/components/DnaEvolveDialog";
import { ProjectInfoPanel } from "@/components/ProjectInfoPanel";
import { ScriptStudio } from "@/components/ScriptStudio";
import { Button } from "@/components/ui/button";
import { FileText, LayoutPanelTop, ChevronLeft, ChevronRight } from "lucide-react";
import {
  normalizeScriptDraftStatus,
  parseScriptDraftNotes,
  type ScriptDraftNotes,
  type ScriptDraftStatus,
} from "@/lib/script-studio";
import {
  blockRequiresNarrationAudio,
  normalizeCutPace,
  type CutPaceId,
} from "@/lib/cut-pace";
import {
  normalizeProjectScriptLanguage,
  type ProjectScriptLanguage,
} from "@/lib/project-language";
import { useToast } from "@/components/ui/use-toast";
import { useBlocksHistory } from "@/hooks/use-blocks-history";
import { useBlockVideoDurationAlerts } from "@/hooks/use-block-video-duration-alerts";
import { serializeBlocksForSync } from "@/lib/blocks-history";
import {
  canMoveBlockEarlier,
  canMoveBlockLater,
  moveBlockEarlier,
  moveBlockLater,
} from "@/lib/timeline-block-reorder";
import { repairNarrationGroupsAfterReorder, rejoinAdjacentVisualCuts, attachVisualCutToNarrationGroup, detachVisualCutFromNarrationGroup, type NarrationJoinPlacement } from "@/lib/narration-group-reorder";
import type { Avatar, Project, ProjectDna, Scenario, StoryBlock, YoutubeMetadata } from "@/lib/db/schema";
import { resolveProjectApiModels, type ProjectApiModels } from "@/lib/project-api-models";
import { getVideoFormatSpec, normalizeVideoFormat, type VideoFormat } from "@/lib/video-format";
import { serializeStyleBible, type StyleBible, type StyleBibleBlockImages } from "@/lib/style-bible";
import { normalizeCaptionMode, type CaptionMode } from "@/lib/captions";
import { cn } from "@/lib/utils";
import { parseProjectAvatarIds } from "@/lib/project-avatars";
import {
  clampTimelinePxPerSecond,
  TIMELINE_MAX_PX_PER_SECOND,
  TIMELINE_MIN_PX_PER_SECOND,
} from "@/lib/timeline-zoom";
import {
  computeTimelineDurationSeconds,
  blocksMissingTimelineStarts,
  realignTimelineStarts,
  seedTimelineStarts,
  sortBlocksByPosition,
} from "@/lib/timeline-free-edit";
import type { AvatarCastValue } from "@/components/AvatarCastPicker";
import type { ProjectExportItem } from "@/lib/export-history";
import { fetchProjectExports } from "@/lib/export-history";
import { computeProjectWorkflow } from "@/lib/project-workflow";
import { premierePackReadiness } from "@/lib/premiere-pack-readiness";
import { ProjectWorkflowRail } from "@/components/ProjectWorkflowRail";
import type { ProjectWorkflowStep, ProjectWorkflowAction } from "@/lib/project-workflow";
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
  initialYoutubeMetadata?: Pick<
    YoutubeMetadata,
    "thumbnailUrl" | "selectedTitle" | "description"
  > | null;
  avatars: Avatar[];
  projectDna: ProjectDna[];
  scenarios?: Scenario[];
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
  initialYoutubeMetadata = null,
  avatars,
  projectDna,
  scenarios = [],
  initialAvatar,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = React.useState<Project>(initialProject);
  const projectApiModels = React.useMemo(() => resolveProjectApiModels(project), [project]);
  const [musicPanelOpen, setMusicPanelOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [projectSummaryCollapsed, setProjectSummaryCollapsed] = React.useState(false);
  const [previewFloating, setPreviewFloating] = React.useState(false);

  React.useEffect(() => {
    setProjectSummaryCollapsed(readProjectSummaryCollapsed());
    setPreviewFloating(readPreviewFloating());
  }, []);

  function toggleProjectSummaryCollapsed() {
    setProjectSummaryCollapsed((prev) => {
      const next = !prev;
      writeProjectSummaryCollapsed(next);
      return next;
    });
  }

  const applyPreviewFloating = React.useCallback((next: boolean) => {
    setPreviewFloating(next);
    writePreviewFloating(next);
    if (next) {
      setProjectSummaryCollapsed(true);
      writeProjectSummaryCollapsed(true);
    }
  }, []);

  const togglePreviewFloating = React.useCallback(() => {
    applyPreviewFloating(!previewFloating);
  }, [applyPreviewFloating, previewFloating]);
  const blocksHistory = useBlocksHistory(project.id, initialBlocks);
  const blocks = blocksHistory.blocks;
  const setBlocksSilent = blocksHistory.setBlocksSilent;
  const setBlocksWithHistory = blocksHistory.setBlocksWithHistory;
  const resetBlocksHistory = blocksHistory.resetHistory;
  const rememberBlocksHistory = blocksHistory.rememberCurrent;
  const timelineStartsSyncedRef = React.useRef(false);

  const prunedBlockMediaRef = React.useRef(false);
  React.useEffect(() => {
    if (prunedBlockMediaRef.current) return;
    prunedBlockMediaRef.current = true;
    void fetch(`/api/projects/${project.id}/blocks/media/prune`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          prunedCount?: number;
          repairedCount?: number;
          blocks?: typeof initialBlocks;
        }>;
      })
      .then((data) => {
        if (data?.blocks && ((data.prunedCount ?? 0) > 0 || (data.repairedCount ?? 0) > 0)) {
          setBlocksSilent(data.blocks);
        }
      })
      .catch(() => {});
  }, [project.id, setBlocksSilent]);

  React.useEffect(() => {
    timelineStartsSyncedRef.current = false;
  }, [project.id]);

  React.useEffect(() => {
    if (timelineStartsSyncedRef.current || blocks.length === 0) return;
    if (!blocksMissingTimelineStarts(blocks)) {
      timelineStartsSyncedRef.current = true;
      return;
    }

    timelineStartsSyncedRef.current = true;
    const seeded = seedTimelineStarts(blocks);
    setBlocksSilent(seeded);

    void Promise.all(
      seeded.map((block) => {
        const before = blocks.find((item) => item.id === block.id);
        if (!before) return Promise.resolve();
        if (
          before.videoTimelineStart === block.videoTimelineStart &&
          before.sceneTimelineStart === block.sceneTimelineStart &&
          before.narrationTimelineStart === block.narrationTimelineStart
        ) {
          return Promise.resolve();
        }
        return fetch(`/api/blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoTimelineStart: block.videoTimelineStart,
            sceneTimelineStart: block.sceneTimelineStart,
            narrationTimelineStart: block.narrationTimelineStart,
          }),
        });
      }),
    ).catch(() => {
      toast({ variant: "destructive", title: "Could not save timeline positions" });
    });
  }, [blocks, project.id, setBlocksSilent, toast]);

  async function saveTimelineStartsForBlocks(
    aligned: StoryBlock[],
    previousBlocks: StoryBlock[],
  ) {
    await Promise.all(
      aligned.map((block) => {
        const before = previousBlocks.find((item) => item.id === block.id);
        if (!before) return Promise.resolve();
        if (
          before.videoTimelineStart === block.videoTimelineStart &&
          before.sceneTimelineStart === block.sceneTimelineStart &&
          before.narrationTimelineStart === block.narrationTimelineStart
        ) {
          return Promise.resolve();
        }
        return fetch(`/api/blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoTimelineStart: block.videoTimelineStart,
            sceneTimelineStart: block.sceneTimelineStart,
            narrationTimelineStart: block.narrationTimelineStart,
          }),
        });
      }),
    );
  }

  async function persistLinkedTimelineStarts(
    sourceBlocks: StoryBlock[],
    options?: { withHistory?: boolean },
  ) {
    const aligned = realignTimelineStarts(sourceBlocks);
    if (options?.withHistory) {
      setBlocksWithHistory(aligned);
    } else {
      setBlocksSilent(aligned);
    }
    await saveTimelineStartsForBlocks(aligned, sourceBlocks);
    return aligned;
  }

  async function realignTimelineByNarration() {
    if (blocks.length === 0) return;
    setRealignTimelineBusy(true);
    try {
      await persistLinkedTimelineStarts(blocks, { withHistory: true });
      toast({
        variant: "success",
        title: "Timeline realigned",
        description: "All tracks follow block order and narration groups.",
      });
    } catch {
      toast({ variant: "destructive", title: "Could not realign timeline" });
    } finally {
      setRealignTimelineBusy(false);
    }
  }

  const reorderSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderDraggingRef = React.useRef(false);

  async function saveBlockOrderToServer(aligned: StoryBlock[]) {
    const res = await fetch(`/api/projects/${project.id}/blocks/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: serializeBlocksForSync(aligned) }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      blocks?: StoryBlock[];
    };
    if (!res.ok) throw new Error(data.error ?? "Could not save block order");
    if (Array.isArray(data.blocks)) setBlocksSilent(data.blocks);
  }

  async function commitBlockOrder(nextBlocks: StoryBlock[]) {
    const aligned = realignTimelineStarts(
      nextBlocks.map((block, index) => ({ ...block, position: index })),
    );
    setBlocksWithHistory(aligned);
    try {
      await saveBlockOrderToServer(aligned);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save block order",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function handleReorderBlocks(nextOrder: StoryBlock[]) {
    const reordered = nextOrder.map((block, index) => ({ ...block, position: index }));
    const { blocks: rejoined, joinedCount } = rejoinAdjacentVisualCuts(reordered);
    const { blocks: repaired, detachedCount } = repairNarrationGroupsAfterReorder(rejoined);
    const aligned = realignTimelineStarts(repaired);

    if (joinedCount > 0) {
      toast({
        variant: "success",
        title: "Scene rejoined narration",
        description:
          joinedCount === 1
            ? "This visual cut shares the voice-over again because it sits beside that narration group."
            : `${joinedCount} visual cuts rejoined their narration groups.`,
      });
    } else if (detachedCount > 0) {
      toast({
        title: "Visual cut moved off narration",
        description:
          detachedCount === 1
            ? "One scene was detached so the narration track stays continuous. It keeps its video but no longer shares that voice-over."
            : `${detachedCount} scenes were detached so narration stays continuous.`,
      });
    }

    if (!reorderDraggingRef.current) {
      reorderDraggingRef.current = true;
      rememberBlocksHistory();
    }

    setBlocksSilent(aligned);

    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
    reorderSaveTimerRef.current = setTimeout(() => {
      reorderDraggingRef.current = false;
      reorderSaveTimerRef.current = null;
      void saveBlockOrderToServer(aligned).catch((err) => {
        toast({
          variant: "destructive",
          title: "Could not save block order",
          description: err instanceof Error ? err.message : "Unknown error",
        });
      });
    }, 350);
  }

  function handleMoveBlockEarlier(blockId: string) {
    const next = moveBlockEarlier(blocks, blockId);
    if (!next) return;
    void commitBlockOrder(next);
  }

  function handleMoveBlockLater(blockId: string) {
    const next = moveBlockLater(blocks, blockId);
    if (!next) return;
    void commitBlockOrder(next);
  }

  function handleJoinNarration(
    blockId: string,
    groupId: string,
    placement: NarrationJoinPlacement,
  ) {
    const next = attachVisualCutToNarrationGroup(blocks, blockId, groupId, placement);
    if (!next) return;
    void commitBlockOrder(next);
    toast({
      variant: "success",
      title: "Scene joined narration",
      description:
        "This visual cut shares the voice-over again. Drag it beside other cuts in the same group to keep narration continuous.",
    });
  }

  function handleLeaveNarrationGroup(blockId: string) {
    const sorted = sortBlocksByPosition(blocks);
    const block = sorted.find((item) => item.id === blockId);
    if (!block) return;
    const next = sorted.map((item) =>
      item.id === blockId ? detachVisualCutFromNarrationGroup(item) : item,
    );
    void commitBlockOrder(next);
    toast({
      title: "Scene detached from narration",
      description:
        "The video stays on the timeline but no longer shares that voice-over. Rejoin from the context menu or drag it back beside the narration group.",
    });
  }

  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(
    initialBlocks[0]?.id ?? null,
  );
  const [currentTime, setCurrentTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const playingRef = React.useRef(playing);
  const [pxPerSecond, setPxPerSecond] = React.useState(30);

  playingRef.current = playing;

  function scrubTo(t: number) {
    setPlaying(false);
    setCurrentTime(t);
  }

  const pausePlayback = React.useCallback(() => {
    setPlaying(false);
  }, []);

  const playPlayback = React.useCallback(() => {
    setPlaying(true);
  }, []);

  const [view, setView] = React.useState<"script" | "timeline">(() => {
    const status = normalizeScriptDraftStatus(initialProject.scriptDraftStatus);
    if (initialBlocks.length === 0 && (status === "draft" || initialProject.scriptDraft)) {
      return "script";
    }
    if (initialBlocks.length === 0) return "script";
    return "timeline";
  });
  const [scriptDraft, setScriptDraft] = React.useState<string>(
    initialProject.scriptDraft ?? "",
  );
  const [scriptNotes, setScriptNotes] = React.useState<ScriptDraftNotes>(() =>
    parseScriptDraftNotes(initialProject.scriptDraftNotes),
  );
  const [scriptStatus, setScriptStatus] = React.useState<ScriptDraftStatus>(() =>
    normalizeScriptDraftStatus(initialProject.scriptDraftStatus),
  );
  const [scriptFocusSection, setScriptFocusSection] = React.useState<string | null>(null);
  const [youtubeMetadata, setYoutubeMetadata] = React.useState(initialYoutubeMetadata);
  const [storyBusy, setStoryBusy] = React.useState(false);
  const [keyframesBusy, setKeyframesBusy] = React.useState(false);
  const [narrationBusy, setNarrationBusy] = React.useState(false);
  const [mediaBusy, setMediaBusy] = React.useState(false);
  const [fitCutsToAudioBusy, setFitCutsToAudioBusy] = React.useState(false);
  const [fitAllCutsToAudioBusy, setFitAllCutsToAudioBusy] = React.useState(false);
  const [insertPauseBusy, setInsertPauseBusy] = React.useState(false);
  const [insertFrameBusy, setInsertFrameBusy] = React.useState(false);
  const [realignTimelineBusy, setRealignTimelineBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState<ExportProgressUiState | null>(null);
  const [dnaEvolveOpen, setDnaEvolveOpen] = React.useState(false);
  const [exportingPremiere, setExportingPremiere] = React.useState(false);
  const [exportingFrame, setExportingFrame] = React.useState(false);
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

  async function setProjectCutSettings(patch: { cutPace?: CutPaceId }) {
    const previous = {
      cutPace: normalizeCutPace(project.cutPace),
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

  async function setProjectScriptLanguage(language: ProjectScriptLanguage) {
    const next = normalizeProjectScriptLanguage(language);
    const previous = normalizeProjectScriptLanguage(project.scriptLanguage);
    if (next === previous) return;
    setProject((prev) => patchProjectShallow(prev, { scriptLanguage: next }));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scriptLanguage: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setProject((prev) => patchProjectShallow(prev, { scriptLanguage: previous }));
      toast({ variant: "destructive", title: "Could not save script language" });
    }
  }

  async function setProjectBrief(patch: {
    projectDnaId?: string | null;
    scenarioId?: string | null;
    storyDescription?: string;
  }) {
    const previous = {
      projectDnaId: project.projectDnaId ?? null,
      scenarioId: project.scenarioId ?? null,
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
        videoClipAudio: models.videoClipAudio,
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

  async function setProjectPreviewMode(mode: ProjectPreviewMode) {
    const previous = project.previewMode ?? "auto";
    const next = mode;
    if (next === previous) return;
    setProject((prev) => patchProjectShallow(prev, { previewMode: next }));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewMode: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setProject((prev) => patchProjectShallow(prev, { previewMode: previous }));
      toast({
        variant: "destructive",
        title: "Could not save preview settings",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function cleanupProjectPreviews(): Promise<number> {
    try {
      const res = await fetch(`/api/projects/${project.id}/previews/cleanup`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        deletedCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not delete preview files");
      clearBlockPreviewCache();
      const deletedCount = data.deletedCount ?? 0;
      toast({
        variant: deletedCount > 0 ? "success" : "default",
        title:
          deletedCount > 0
            ? `Deleted ${deletedCount} preview file${deletedCount === 1 ? "" : "s"}`
            : "No preview files to delete",
        description: "Full-quality export clips were not touched.",
      });
      return deletedCount;
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not delete preview files",
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  const totalDuration = computeTimelineDurationSeconds(blocks);

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

  const videoDurationAlertsMap = useBlockVideoDurationAlerts(blocks);
  const videoDurationAlerts = React.useMemo(
    () => Object.fromEntries(videoDurationAlertsMap),
    [videoDurationAlertsMap],
  );
  const selectedVideoShortAlert = selectedBlockId
    ? (videoDurationAlerts[selectedBlockId] ?? null)
    : null;

  const canFitCutsToAudio = React.useMemo(() => {
    if (!selectedBlockId) return false;
    const group = narrationGroupForBlock(blocks, selectedBlockId);
    return canFitVisualCutsGroupToAudio(group);
  }, [blocks, selectedBlockId]);

  const canFitAllCutsToAudio = React.useMemo(
    () => continuousSpeechNarrationGroups(blocks).some((group) => canFitVisualCutsGroupToAudio(group)),
    [blocks],
  );

  const anyGenerating = React.useMemo(
    () =>
      blocks.some(
        (b) => b.status === "generating" || b.status.endsWith("_generating"),
      ),
    [blocks],
  );
  const musicGenerating =
    project.musicStatus === "generating" || project.music2Status === "generating";

  const projectOpenRouterCostUsd = React.useMemo(
    () =>
      blocks.reduce((sum, block) => {
        const cost = block.openRouterCostUsd;
        return sum + (typeof cost === "number" && Number.isFinite(cost) ? cost : 0);
      }, 0),
    [blocks],
  );

  React.useEffect(() => {
    syncBlockPreviewCache(blocks);
  }, [blocks]);

  React.useEffect(() => {
    if (!anyGenerating && !musicGenerating) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setBlocksSilent(data.blocks ?? []);
        if (data.project) setProject((prev) => patchProjectShallow(prev, data.project));
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyGenerating, musicGenerating, project.id]);

  function patchBlock(id: string, patch: Partial<StoryBlock>) {
    setBlocksSilent((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function patchBlockWithHistory(id: string, patch: Partial<StoryBlock>) {
    setBlocksWithHistory((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBlockSilent(id: string) {
    setBlocksSilent((prev) =>
      prev
        .filter((b) => b.id !== id)
        .map((b, i) => ({ ...b, position: i })),
    );
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  async function deleteBlocks(blockIds: string[]) {
    const ids = [...new Set(blockIds.filter(Boolean))];
    if (ids.length === 0) return;
    const message =
      ids.length === 1
        ? "Delete this block?"
        : `Delete these ${ids.length} visual cuts from the timeline?`;
    if (!confirm(message)) return;

    rememberBlocksHistory();
    try {
      for (const id of ids) {
        const res = await fetch(`/api/blocks/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        removeBlockSilent(id);
      }
      toast({
        variant: "success",
        title: ids.length === 1 ? "Block deleted" : `${ids.length} blocks deleted`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function deleteBlockById(id: string) {
    if (!confirm("Delete this block?")) return;
    rememberBlocksHistory();
    try {
      const res = await fetch(`/api/blocks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      removeBlockSilent(id);
      toast({ variant: "success", title: "Block deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function duplicateBlock(blockId: string) {
    rememberBlocksHistory();
    try {
      const res = await fetch(`/api/blocks/${blockId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setBlocksSilent(data.blocks ?? []);
      if (data.block?.id) {
        setSelectedBlockId(data.block.id as string);
        const inserted = (data.blocks as StoryBlock[] | undefined)?.find(
          (b) => b.id === data.block.id,
        );
        if (inserted) {
          const start =
            inserted.position === 0
              ? 0
              : computeTimelineDurationSeconds(
                  (data.blocks as StoryBlock[]).filter((b) => b.position < inserted.position),
                );
          setCurrentTime(start);
        }
      }
      toast({
        variant: "success",
        title: "Block duplicated",
        description: "Copy inserted right after the original.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Duplicate failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function clearBlockMedia(blockId: string, field: BlockMediaField) {
    const labels: Record<BlockMediaField, string> = {
      keyframe: "keyframe image",
      video: "video",
      audio: "narration audio",
      sceneAudio: "scene audio",
    };
    if (
      !confirm(
        `Remove the ${labels[field]} from this block? The block will stay on the timeline.`,
      )
    ) {
      return;
    }
    rememberBlocksHistory();
    try {
      const res = await fetch(`/api/blocks/${blockId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = (await res.json()) as { patch: Partial<StoryBlock> };
      patchBlockWithHistory(blockId, data.patch);
      toast({ variant: "success", title: `${labels[field]} removed` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleTimelineUndo() {
    try {
      const nextBlocks = await blocksHistory.undo();
      if (nextBlocks) {
        setSelectedBlockId((prev) =>
          nextBlocks.some((block) => block.id === prev) ? prev : (nextBlocks[0]?.id ?? null),
        );
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Undo failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleTimelineRedo() {
    try {
      const nextBlocks = await blocksHistory.redo();
      if (nextBlocks) {
        setSelectedBlockId((prev) =>
          nextBlocks.some((block) => block.id === prev) ? prev : (nextBlocks[0]?.id ?? null),
        );
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Redo failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function handleBlockPatched(
    id: string,
    patch: Partial<StoryBlock>,
    options?: { recordHistory?: boolean },
  ) {
    if (options?.recordHistory) patchBlockWithHistory(id, patch);
    else patchBlock(id, patch);
  }

  function applyStyleBibleUpdate(next: {
    styleBible: StyleBible | null;
    blockImages?: StyleBibleBlockImages;
    anchorImageUrl?: string | null;
  }) {
    setProject((prev) =>
      patchProjectShallow(prev, {
        styleBible: next.styleBible
          ? serializeStyleBible(next.styleBible, next.blockImages ?? {})
          : prev.styleBible,
        anchorImageUrl: next.anchorImageUrl === undefined ? prev.anchorImageUrl : next.anchorImageUrl,
      }),
    );
  }

  async function generateStory() {
    setStoryBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/story`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      resetBlocksHistory(data.blocks ?? []);
      setSelectedBlockId((data.blocks?.[0]?.id as string) ?? null);
      setCurrentTime(0);
      if (typeof data.scriptDraft === "string" && data.scriptDraft.trim()) {
        setScriptDraft(data.scriptDraft);
        setScriptStatus(
          (data.scriptDraftStatus as typeof scriptStatus) ?? "draft",
        );
        if (typeof data.scriptDraftVersion === "number") {
          setProject((prev) =>
            patchProjectShallow(prev, {
              scriptDraft: data.scriptDraft,
              scriptDraftStatus: data.scriptDraftStatus ?? "draft",
              scriptDraftVersion: data.scriptDraftVersion,
            }),
          );
        }
      }
      if (data.styleBible) {
        applyStyleBibleUpdate({
          styleBible: data.styleBible as StyleBible,
          blockImages: {},
          anchorImageUrl: null,
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
          description: data.scriptDraft
            ? "Timeline and script updated. Open Style to generate block references, then keyframes."
            : "Style bible created. Open Style to generate one reference per block, then keyframes.",
        });
      } else {
        toast({
          variant: "success",
          title: "Story generated",
          description: data.scriptDraft
            ? "Timeline blocks and script narration are in sync."
            : undefined,
        });
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

  async function changeBlockDuration(blockId: string, durationSeconds: number) {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return;
    const minSeconds =
      isVisualCutOnly(block) || block.narrativeText.trim().length === 0 ? 1 : 2;
    const clamped = snapTimelineDurationSeconds(durationSeconds, minSeconds);
    if (clamped === block.durationSeconds) return;

    const previousDuration = block.durationSeconds;
    setBlocksWithHistory((prev) =>
      prev.map((item) =>
        item.id === blockId ? { ...item, durationSeconds: clamped } : item,
      ),
    );
    try {
      const res = await fetch(`/api/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSeconds: clamped }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const withDuration = blocks.map((item) =>
        item.id === blockId ? { ...item, durationSeconds: clamped } : item,
      );
      await persistLinkedTimelineStarts(withDuration);
    } catch (err) {
      patchBlock(blockId, { durationSeconds: previousDuration });
      toast({
        variant: "destructive",
        title: "Could not save duration",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function applyVisualCutDurationPlan(
    plan: Array<{ blockId: string; durationSeconds: number }>,
    successToast: { title: string; description: string },
  ) {
    if (!plan.length) throw new Error("Nothing to adjust");

    rememberBlocksHistory();
    for (const item of plan) {
      patchBlock(item.blockId, { durationSeconds: item.durationSeconds });
    }

    await Promise.all(
      plan.map((item) =>
        fetch(`/api/blocks/${item.blockId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSeconds: item.durationSeconds }),
        }),
      ),
    );

    const withDurations = blocks.map((block) => {
      const item = plan.find((entry) => entry.blockId === block.id);
      return item ? { ...block, durationSeconds: item.durationSeconds } : block;
    });
    await persistLinkedTimelineStarts(withDurations);

    toast({
      variant: "success",
      title: successToast.title,
      description: successToast.description,
    });
  }

  async function fitSelectedGroupToAudio() {
    if (!selectedBlockId) return;
    const group = narrationGroupForBlock(blocks, selectedBlockId);
    const lead = leadBlockForNarrationGroup(group);
    if (!lead?.audioUrl) return;

    setFitCutsToAudioBusy(true);
    const previous = new Map(group.map((block) => [block.id, block.durationSeconds]));
    try {
      const waveform = await getAudioWaveform(lead.audioUrl);
      if (!waveform) throw new Error("Could not read narration audio");
      const plan = planFitVisualCutsToAudio(group, waveform.durationSeconds);
      if (!plan?.length) throw new Error("Nothing to adjust");

      const total = plan.reduce((sum, item) => sum + item.durationSeconds, 0);
      await applyVisualCutDurationPlan(plan, {
        title: "Visual cuts fit to narration",
        description: `${group.length} cut${group.length === 1 ? "" : "s"} · ${waveform.durationSeconds.toFixed(1)}s audio · ${total}s on timeline`,
      });
    } catch (err) {
      for (const [blockId, durationSeconds] of previous) {
        patchBlock(blockId, { durationSeconds });
      }
      toast({
        variant: "destructive",
        title: "Fit to audio failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setFitCutsToAudioBusy(false);
    }
  }

  async function fitAllGroupsToAudio() {
    const groups = continuousSpeechNarrationGroups(blocks).filter((group) =>
      canFitVisualCutsGroupToAudio(group),
    );
    if (groups.length === 0) return;

    setFitAllCutsToAudioBusy(true);
    const previous = new Map(blocks.map((block) => [block.id, block.durationSeconds]));
    try {
      const plan: Array<{ blockId: string; durationSeconds: number }> = [];
      let adjustedGroups = 0;
      let adjustedCuts = 0;
      let totalAudioSeconds = 0;

      for (const group of groups) {
        const lead = leadBlockForNarrationGroup(group);
        if (!lead?.audioUrl) continue;
        const waveform = await getAudioWaveform(lead.audioUrl);
        if (!waveform) continue;
        const groupPlan = planFitVisualCutsToAudio(group, waveform.durationSeconds);
        if (!groupPlan?.length) continue;
        plan.push(...groupPlan);
        adjustedGroups += 1;
        adjustedCuts += groupPlan.length;
        totalAudioSeconds += waveform.durationSeconds;
      }

      if (!plan.length) throw new Error("Nothing to adjust");

      const totalTimelineSeconds = plan.reduce((sum, item) => sum + item.durationSeconds, 0);
      await applyVisualCutDurationPlan(plan, {
        title: "All visual cuts fit to narration",
        description: `${adjustedGroups} paragraph${adjustedGroups === 1 ? "" : "s"} · ${adjustedCuts} cut${adjustedCuts === 1 ? "" : "s"} · ${totalAudioSeconds.toFixed(1)}s narration · ${totalTimelineSeconds}s on timeline`,
      });
    } catch (err) {
      for (const [blockId, durationSeconds] of previous) {
        patchBlock(blockId, { durationSeconds });
      }
      toast({
        variant: "destructive",
        title: "Fit all to audio failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setFitAllCutsToAudioBusy(false);
    }
  }

  async function insertFrameAfterSelected() {
    setInsertFrameBusy(true);
    rememberBlocksHistory();
    try {
      const res = await fetch(`/api/projects/${project.id}/blocks/insert-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          afterBlockId: selectedBlockId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string) ?? "Failed");
      setBlocksSilent(data.blocks ?? []);
      if (data.block?.id) {
        setSelectedBlockId(data.block.id as string);
        const inserted = (data.blocks as StoryBlock[] | undefined)?.find(
          (b) => b.id === data.block.id,
        );
        if (inserted) {
          const start =
            inserted.position === 0
              ? 0
              : computeTimelineDurationSeconds(
                  (data.blocks as StoryBlock[]).filter((b) => b.position < inserted.position),
                );
          setCurrentTime(start);
        }
      }
      toast({
        variant: "success",
        title: "New frame added",
        description: "Upload or generate a keyframe in the block panel on the right.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not add frame",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setInsertFrameBusy(false);
    }
  }

  async function insertPauseAfterSelected(seconds: number) {
    setInsertPauseBusy(true);
    rememberBlocksHistory();
    try {
      const res = await fetch(`/api/projects/${project.id}/blocks/insert-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          afterBlockId: selectedBlockId ?? undefined,
          durationSeconds: seconds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string) ?? "Failed");
      setBlocksSilent(data.blocks ?? []);
      if (data.block?.id) setSelectedBlockId(data.block.id as string);
      toast({
        variant: "success",
        title: "Music moment inserted",
        description: `${seconds}s — trilha sobe neste trecho; narração retoma no corte seguinte.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not insert music moment",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setInsertPauseBusy(false);
    }
  }

  function onPrevBlock() {
    setPlaying(false);
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
    setPlaying(false);
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
    const target = clampTimelinePxPerSecond(
      Math.max(TIMELINE_MIN_PX_PER_SECOND, Math.min(TIMELINE_MAX_PX_PER_SECOND, Math.floor(900 / totalDuration))),
    );
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

  async function postMp4Export(resolution: ExportResolutionId, quality: ExportQualityId) {
    const body = JSON.stringify({ resolution, quality });
    const headers = { "content-type": "application/json" };
    const urls = [
      `/api/projects/${project.id}/render`,
      `/api/projects/${project.id}/export`,
    ];

    let lastRes: Response | null = null;
    for (const url of urls) {
      const res = await fetch(url, { method: "POST", headers, body });
      if (res.status !== 404) return res;
      lastRes = res;
    }
    return lastRes!;
  }

  async function exportFinal(
    resolution: ExportResolutionId = "1080p",
    quality: ExportQualityId = DEFAULT_EXPORT_QUALITY,
  ) {
    const startedAtMs = Date.now();
    setExporting(true);
    setExportProgress({
      exportId: "pending",
      percent: 0,
      stage: "preparing",
      message: "Iniciando exportação…",
      startedAtMs,
    });
    try {
      const res = await postMp4Export(resolution, quality);
      let data: {
        async?: boolean;
        exportId?: string;
        finalVideoUrl?: string;
        resolutionLabel?: string;
        downloadFilename?: string;
        version?: number;
        warnings?: string[];
        error?: string;
      } = {};
      const raw = await res.text();
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        if (res.status === 404) {
          throw new Error(
            "Export API not found on the server (404). Deploy the latest Imagine build and try again.",
          );
        }
        throw new Error(
          `Export failed (${res.status}). Server returned an unexpected response — try redeploying.`,
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Export failed (${res.status})`);
      }

      let result: ExportPollResult = {
        exportId: data.exportId ?? "",
        status: data.async ? "running" : "done",
        progressPercent: data.async ? 0 : 100,
        progressStage: data.async ? "preparing" : "done",
        progressMessage: null,
        errorMessage: null,
        finalVideoUrl: data.finalVideoUrl ?? null,
        version: data.version,
        downloadFilename: data.downloadFilename ?? null,
      };
      if (data.async && data.exportId) {
        result = await pollProjectExport(project.id, data.exportId, setExportProgress, startedAtMs);
      } else if (data.finalVideoUrl) {
        result = {
          ...result,
          status: "done",
          progressPercent: 100,
          finalVideoUrl: data.finalVideoUrl,
          version: data.version,
          downloadFilename: data.downloadFilename ?? null,
        };
      }

      await refreshExports();
      const versionLabel = result.version ? `v${result.version}` : "new export";
      const warnings =
        result.errorMessage && result.status === "done"
          ? result.errorMessage.split("; ").filter(Boolean)
          : [];
      const warningHint =
        warnings.length > 0
          ? ` ${warnings.length} bloco${warnings.length === 1 ? "" : "s"} usou fallback (veja o console).`
          : "";
      toast({
        variant: warnings.length ? "default" : "success",
        title: `Exportado ${versionLabel} · ${data.resolutionLabel ?? resolution}`,
        description: `Salvo em Exports — baixe de novo quando quiser.${warningHint}`,
      });
      if (warnings.length) {
        console.warn("[export] media fallbacks:", warnings);
      }
      if (result.finalVideoUrl) {
        triggerFileDownload(
          result.finalVideoUrl,
          result.downloadFilename ?? `${project.title}-${resolution}.mp4`,
        );
      }
      if (project.projectDnaId) {
        setDnaEvolveOpen(true);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Exportação falhou",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  async function exportPremierePack() {
    setExportingPremiere(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export/premiere`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        downloadUrl?: string;
        downloadFilename?: string;
        assetCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Premiere export failed (${res.status})`);
      toast({
        variant: "success",
        title: "Pacote Premiere pronto",
        description: [
          data.assetCount != null ? `${data.assetCount} arquivo(s) de mídia` : null,
          "Timeline.xml + Footage/ no ZIP",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (data.downloadUrl) {
        triggerFileDownload(
          data.downloadUrl,
          data.downloadFilename ?? `${project.title}-premiere.zip`,
        );
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export Premiere falhou",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setExportingPremiere(false);
    }
  }

  const canExportFrame = React.useMemo(
    () => resolveTimelineVisualAtTime(blocks, currentTime) !== null,
    [blocks, currentTime],
  );

  async function exportCurrentFrame() {
    if (!canExportFrame) return;
    setExportingFrame(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export/frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeSeconds: currentTime, resolution: "1080p" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        downloadUrl?: string;
        downloadFilename?: string;
        resolutionLabel?: string;
        source?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Frame export failed (${res.status})`);
      if (data.downloadUrl) {
        triggerFileDownload(
          data.downloadUrl,
          data.downloadFilename ?? `${project.title}-frame.png`,
        );
      }
      const sourceLabel =
        data.source === "video"
          ? "do vídeo"
          : data.source === "image"
            ? "da imagem"
            : "preto";
      toast({
        variant: "success",
        title: "Frame exportado",
        description: [
          data.resolutionLabel ?? "Full HD 1080p",
          `PNG ${sourceLabel}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível exportar o frame",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setExportingFrame(false);
    }
  }

  const exportBlockerReason = React.useMemo(() => {
    if (blocks.length === 0) return "Add at least one block to export.";
    return null;
  }, [blocks]);

  const exportVisualNote = React.useMemo(() => {
    const imageOnly = blocks.filter((b) => !b.videoUrl?.trim() && b.keyframeUrl?.trim()).length;
    const black = blocks.filter((b) => !b.videoUrl?.trim() && !b.keyframeUrl?.trim()).length;
    if (imageOnly === 0 && black === 0) return null;
    const parts: string[] = [];
    if (imageOnly > 0) parts.push(`${imageOnly} bloco(s) só com imagem`);
    if (black > 0) parts.push(`${black} bloco(s) em preto`);
    return parts.join(" · ");
  }, [blocks]);

  const canExport = exportBlockerReason === null;

  const premiereReadiness = React.useMemo(
    () => premierePackReadiness(blocks, project.musicUrl),
    [blocks, project.musicUrl],
  );
  const canExportPremiere = premiereReadiness.ok;
  const exportPremiereBlockerReason = premiereReadiness.reason ?? null;

  const projectWorkflow = React.useMemo(
    () =>
      computeProjectWorkflow({
        project,
        scriptDraft,
        scriptStatus,
        notes: scriptNotes,
        blocks,
        exportCount: projectExports.length,
        youtubeMetadata,
      }),
    [
      project,
      scriptDraft,
      scriptStatus,
      scriptNotes,
      blocks,
      projectExports.length,
      youtubeMetadata,
    ],
  );

  const handleWorkflowStepAction = React.useCallback(
    (_step: ProjectWorkflowStep, action: ProjectWorkflowAction) => {
      switch (action.type) {
        case "view":
          setView(action.view);
          break;
        case "script_section":
          setView("script");
          setScriptFocusSection(action.sectionId);
          break;
        case "youtube":
          router.push(`/projects/${project.id}/youtube`);
          break;
        case "export_hint":
          setView("timeline");
          toast({
            title: canExport ? "Pronto para exportar" : "Edição incompleta",
            description: canExport
              ? "Use Export no topo quando quiser gerar o MP4 final."
              : exportBlockerReason ?? "Adicione pelo menos um bloco na timeline.",
          });
          break;
      }
    },
    [canExport, exportBlockerReason, project.id, router, toast],
  );

  const canGenerateKeyframes = blocks.length > 0;
  const canGenerateNarration =
    blocks.length > 0 && blocks.some((b) => b.narrativeText.trim());
  const canGenerateMedia =
    blocks.length > 0 && blocks.every((b) => b.keyframeUrl);

  React.useEffect(() => {
    if (view !== "timeline") return;

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
      e.stopPropagation();
      if (playingRef.current) pausePlayback();
      else playPlayback();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [view, pausePlayback, playPlayback]);

  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const isVertical = formatSpec.id === "vertical";
  const platformPreviewDefaults = usePlatformPreviewDefaults();
  const previewSettings = React.useMemo(
    () => resolvePreviewSettings(project.previewMode, platformPreviewDefaults),
    [project.previewMode, platformPreviewDefaults],
  );

  usePreviewWarmup(
    blocks,
    currentTime,
    view === "timeline" && previewSettings.warmupEnabled,
  );

  const previewPlayerProps = React.useMemo(
    () => ({
      blocks,
      currentTime,
      playing,
      onTimeChange: setCurrentTime,
      onPlay: playPlayback,
      onPause: pausePlayback,
      musicUrl: project.musicUrl ?? null,
      musicVolume: project.musicVolume ?? 30,
      musicStartSeconds: project.musicStartSeconds ?? 0,
      musicSpanSeconds: project.musicSpanSeconds ?? null,
      music2Url: project.music2Url ?? null,
      music2TimelineStartSeconds: project.music2TimelineStartSeconds ?? null,
      music2FileStartSeconds: project.music2FileStartSeconds ?? 0,
      narrationVolume: project.narrationVolume ?? 100,
      sceneVolume: project.sceneVolume ?? 60,
      masterVolume: project.masterVolume ?? 100,
      videoFormat: project.videoFormat,
      captionMode: project.captionMode,
      previewSettings,
    }),
    [
      blocks,
      currentTime,
      playing,
      playPlayback,
      pausePlayback,
      project.musicUrl,
      project.musicVolume,
      project.musicStartSeconds,
      project.musicSpanSeconds,
      project.music2Url,
      project.music2TimelineStartSeconds,
      project.music2FileStartSeconds,
      project.narrationVolume,
      project.sceneVolume,
      project.masterVolume,
      project.videoFormat,
      project.captionMode,
      previewSettings,
    ],
  );

  const refreshProjectAndBlocks = React.useCallback(
    async (options?: { resetHistory?: boolean }) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.project) setProject((prev) => patchProjectShallow(prev, data.project));
      if (data.youtube !== undefined) {
        setYoutubeMetadata(
          data.youtube
            ? {
                thumbnailUrl: data.youtube.thumbnailUrl ?? null,
                selectedTitle: data.youtube.selectedTitle ?? null,
                description: data.youtube.description ?? null,
              }
            : null,
        );
      }
      if (Array.isArray(data.blocks)) {
        if (options?.resetHistory) resetBlocksHistory(data.blocks);
        else setBlocksSilent(data.blocks);
        setSelectedBlockId(data.blocks[0]?.id ?? null);
      }
      setCurrentTime(0);
      router.refresh();
    } catch {
      // ignore
    }
  }, [project.id, resetBlocksHistory, router, setBlocksSilent]);

  async function onScriptApplied() {
    await refreshProjectAndBlocks({ resetHistory: true });
    setView("timeline");
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        onExport={exportFinal}
        onExportPremiere={exportPremierePack}
        canExport={canExport}
        canExportPremiere={canExportPremiere}
        exportPremiereBlockerReason={exportPremiereBlockerReason}
        exportingPremiere={exportingPremiere}
        exportBlockerReason={exportBlockerReason}
        exportVisualNote={exportVisualNote}
        exporting={exporting}
        exportProgress={exportProgress}
        projectExports={projectExports}
        onRefreshExports={refreshExports}
        exportsRefreshing={exportsRefreshing}
        avatars={avatars}
        avatarCast={avatarCast}
        onAvatarCastChange={setProjectAvatarCast}
        onApiModelsChange={setProjectApiModels}
        onStyleBibleUpdated={applyStyleBibleUpdate}
        onOpenSettings={() => setSettingsOpen(true)}
        canEnrichDna={Boolean(project.projectDnaId)}
        onEnrichDna={() => setDnaEvolveOpen(true)}
        projectOpenRouterCostUsd={projectOpenRouterCostUsd}
      />

      <DnaEvolveDialog
        projectId={project.id}
        open={dnaEvolveOpen}
        onOpenChange={setDnaEvolveOpen}
      />

      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("script")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-medium transition-colors",
              view === "script"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Script
            {scriptStatus === "draft" && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setView("timeline")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-medium transition-colors",
              view === "timeline"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutPanelTop className="h-3.5 w-3.5" /> Timeline
            {blocks.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-2xs">{blocks.length}</span>
            )}
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 text-right text-[10px] text-muted-foreground lg:block">
          {view === "script"
            ? "Roteiro → mídia → narração → aplicar"
            : "Keyframes, vídeo e export final"}
        </div>
        </div>

        <ProjectWorkflowRail
          className="shrink-0"
          workflow={projectWorkflow}
          onStepAction={handleWorkflowStepAction}
        />
      </div>

      {view === "script" ? (
        <div className="flex min-h-0 flex-1">
          <ScriptStudio
            project={project}
            script={scriptDraft}
            notes={scriptNotes}
            status={scriptStatus}
            hasBlocks={blocks.length > 0}
            focusSectionId={scriptFocusSection}
            onFocusSectionHandled={() => setScriptFocusSection(null)}
            onScriptChange={setScriptDraft}
            onNotesChange={setScriptNotes}
            onStatusChange={setScriptStatus}
            onAppliedToTimeline={onScriptApplied}
            onProjectChanged={(patch) =>
              setProject((prev) => patchProjectShallow(prev, patch))
            }
            onGenerateStory={generateStory}
            storyBusy={storyBusy}
          />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col bg-panel">
            <TimelineSplitPane
              minPreviewReserve={isVertical ? VERTICAL_PREVIEW_RESERVE : undefined}
              previewFloating={previewFloating}
              onPreviewFloatingChange={applyPreviewFloating}
              floatingPreview={<PreviewPlayer {...previewPlayerProps} compact />}
              top={
                <div
                  className={cn(
                    "grid h-full min-h-0 grid-cols-1 items-stretch gap-3 p-3",
                    isVertical
                      ? projectSummaryCollapsed
                        ? "md:grid-cols-1"
                        : "md:grid-cols-[minmax(0,280px)_1fr]"
                      : projectSummaryCollapsed
                        ? "md:grid-cols-1"
                        : "md:grid-cols-[minmax(0,1fr)_320px]",
                  )}
                >
                  <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-background p-2">
                    <PreviewPlayer {...previewPlayerProps} />
                    {projectSummaryCollapsed && (
                      <button
                        type="button"
                        onClick={toggleProjectSummaryCollapsed}
                        title="Show info panel"
                        className={cn(
                          "absolute -right-3 top-14 z-20 flex h-6 w-6 items-center justify-center rounded-full",
                          "border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {!projectSummaryCollapsed && (
                    <div className="relative min-h-0 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs md:max-h-full">
                      <button
                        type="button"
                        onClick={toggleProjectSummaryCollapsed}
                        title="Collapse info panel"
                        className={cn(
                          "absolute -left-3 top-14 z-20 flex h-6 w-6 items-center justify-center rounded-full",
                          "border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <ProjectInfoPanel
                        project={project}
                        blocks={blocks}
                        totalDuration={totalDuration}
                      />
                    </div>
                  )}
                </div>
              }
              bottom={
                <>
                  <TimelineToolbar
                    playing={playing}
                    onPlay={playPlayback}
                    onPause={pausePlayback}
                    onPrev={onPrevBlock}
                    onNext={onNextBlock}
                    onZoomIn={() =>
                      setPxPerSecond((p) =>
                        clampTimelinePxPerSecond(p + Math.max(2, Math.round(p * 0.12))),
                      )
                    }
                    onZoomOut={() =>
                      setPxPerSecond((p) =>
                        clampTimelinePxPerSecond(p - Math.max(2, Math.round(p * 0.12))),
                      )
                    }
                    onFit={fitTimeline}
                    onUndo={() => void handleTimelineUndo()}
                    onRedo={() => void handleTimelineRedo()}
                    canUndo={blocksHistory.canUndo}
                    canRedo={blocksHistory.canRedo}
                    historyBusy={blocksHistory.historySyncing}
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
                    musicBusy={
                      project.musicStatus === "generating" ||
                      project.music2Status === "generating"
                    }
                    musicReady={!!project.musicUrl}
                    canGenerateKeyframes={canGenerateKeyframes}
                    canGenerateNarration={canGenerateNarration}
                    canGenerateMedia={canGenerateMedia}
                    narrationSpeedId={narrationSpeedIdForValue(project.ttsSpeed ?? 1)}
                    onNarrationSpeedChange={setNarrationSpeed}
                    onFitCutsToAudio={() => void fitSelectedGroupToAudio()}
                    canFitCutsToAudio={canFitCutsToAudio}
                    fitCutsToAudioBusy={fitCutsToAudioBusy}
                    onFitAllCutsToAudio={() => void fitAllGroupsToAudio()}
                    canFitAllCutsToAudio={canFitAllCutsToAudio}
                    fitAllCutsToAudioBusy={fitAllCutsToAudioBusy}
                    onRealignTimeline={() => void realignTimelineByNarration()}
                    realignTimelineBusy={realignTimelineBusy}
                    canRealignTimeline={blocks.length > 0}
                    onInsertPause={(seconds) => void insertPauseAfterSelected(seconds)}
                    insertPauseBusy={insertPauseBusy}
                    onInsertFrame={() => void insertFrameAfterSelected()}
                    insertFrameBusy={insertFrameBusy}
                    onExportFrame={() => void exportCurrentFrame()}
                    exportFrameBusy={exportingFrame}
                    canExportFrame={canExportFrame}
                    previewFloating={previewFloating}
                    onTogglePreviewFloating={togglePreviewFloating}
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
                      onDurationChange={changeBlockDuration}
                      onReorderBlocks={handleReorderBlocks}
                      onMoveBlockEarlier={handleMoveBlockEarlier}
                      onMoveBlockLater={handleMoveBlockLater}
                      canMoveBlockEarlier={(blockId) => canMoveBlockEarlier(blocks, blockId)}
                      canMoveBlockLater={(blockId) => canMoveBlockLater(blocks, blockId)}
                      onDeleteBlocks={deleteBlocks}
                      onDuplicateBlock={duplicateBlock}
                      onClearBlockMedia={clearBlockMedia}
                      onJoinNarration={handleJoinNarration}
                      onLeaveNarrationGroup={handleLeaveNarrationGroup}
                      musicUrl={project.musicUrl}
                      musicStatus={project.musicStatus}
                      musicPrompt={project.musicPrompt}
                      musicStartSeconds={project.musicStartSeconds ?? 0}
                      musicSpanSeconds={project.musicSpanSeconds ?? null}
                      music2Url={project.music2Url}
                      music2TimelineStartSeconds={project.music2TimelineStartSeconds}
                      onMusicClick={() => setMusicPanelOpen(true)}
                      volumes={timelineVolumes}
                      onVolumesChange={setTimelineVolumes}
                      projectAvatarId={project.avatarId ?? null}
                      avatarMap={avatarMap}
                      videoFormat={project.videoFormat}
                      onPxPerSecondChange={setPxPerSecond}
                      videoDurationAlerts={videoDurationAlerts}
                    />
                  </div>
                </>
              }
            />
          </div>
        </div>

        <BlockDetailPanel
          block={selectedBlock}
          blocks={blocks}
          projectId={project.id}
          avatars={avatars}
          projectAvatarId={project.avatarId ?? null}
          projectAvatarName={avatar?.name ?? null}
          scenarios={scenarios}
          projectScenarioId={project.scenarioId ?? null}
          projectScenarioName={
            scenarios.find((s) => s.id === project.scenarioId)?.name ?? null
          }
          videoFormat={project.videoFormat}
          timelineExpanded={previewFloating}
          onPatched={handleBlockPatched}
          onRemoved={removeBlockSilent}
          onDeleteBlock={deleteBlockById}
          onJoinNarration={handleJoinNarration}
          onLeaveNarrationGroup={handleLeaveNarrationGroup}
          videoShortAlert={selectedVideoShortAlert}
          videoDurationAlerts={videoDurationAlerts}
          projectImageModel={projectApiModels.imageModel}
          projectVideoModel={projectApiModels.videoModel}
          projectTtsModel={projectApiModels.ttsModel}
        />
      </div>
      )}

      {musicPanelOpen && (
        <MusicPanel
          project={project}
          timelineTotalSeconds={totalDuration}
          onClose={() => setMusicPanelOpen(false)}
          onChange={(patch) => setProject((prev) => patchProjectShallow(prev, patch))}
        />
      )}

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={project}
        projectDnaItems={projectDna}
        scenarioItems={scenarios}
        onVideoFormatChange={setProjectVideoFormat}
        onCaptionModeChange={setProjectCaptionMode}
        onCutSettingsChange={setProjectCutSettings}
        onScriptLanguageChange={setProjectScriptLanguage}
        onPreviewModeChange={setProjectPreviewMode}
        onCleanupProjectPreviews={cleanupProjectPreviews}
        onBriefChange={(patch) => setProject((prev) => patchProjectShallow(prev, patch))}
        onBriefSave={setProjectBrief}
      />
    </div>
  );
}
