"use client";

import * as React from "react";
import { Reorder } from "framer-motion";
import { TimelineRuler } from "./TimelineRuler";
import {
  AudioTrackBlock,
  KeyframeTrackBlock,
  MusicTrackBlock,
  SceneAudioTrackBlock,
  TextTrackBlock,
  VideoTrackBlock,
} from "./TimelineBlock";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { TimelineVolumeSlider } from "./TimelineVolumeSlider";
import {
  TimelineContextMenu,
  type TimelineContextMenuTarget,
} from "./TimelineContextMenu";
import type { Block, AvatarLookup } from "./types";
import { buildNarrationTrackSpans } from "./types";
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";
import { isVisualCutOnly } from "@/lib/cut-pace";
import type { BlockMediaField } from "@/lib/block-media";
import {
  canLeaveNarrationGroup,
  listJoinableNarrationTargets,
  type JoinableNarrationTarget,
} from "@/lib/narration-group-reorder";
import { TimelineClip } from "./TimelineClip";
import {
  runTimelineScrubFollowLoop,
  scrubTimelineAtClientX,
} from "@/lib/timeline-scrub";
import {
  nextTimelinePxPerSecondFromWheel,
  scrollLeftForZoomAtCursor,
} from "@/lib/timeline-zoom";
import {
  computeTimelineDurationSeconds,
  resolveNarrationSpanStartSeconds,
  resolveSceneStartSeconds,
  resolveVideoStartSeconds,
  sortBlocksByPosition,
} from "@/lib/timeline-free-edit";
import { listMusicSwellZones } from "@/lib/music-swell";
import { applyTimelineAltWheelPan } from "@/lib/timeline-alt-pan";
import type { BlockVideoDurationAlert } from "@/lib/video-duration-mismatch";

export interface TimelineVolumes {
  master: number;
  narration: number;
  scene: number;
  music: number;
}

interface Props {
  blocks: Block[];
  pxPerSecond: number;
  currentTime: number;
  playing?: boolean;
  onScrub: (t: number) => void;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onDurationChange?: (blockId: string, durationSeconds: number) => void;
  onReorderBlocks?: (blocks: Block[]) => void;
  onMoveBlockEarlier?: (blockId: string) => void;
  onMoveBlockLater?: (blockId: string) => void;
  canMoveBlockEarlier?: (blockId: string) => boolean;
  canMoveBlockLater?: (blockId: string) => boolean;
  onDeleteBlocks?: (blockIds: string[]) => void;
  onDuplicateBlock?: (blockId: string) => void;
  onClearBlockMedia?: (blockId: string, field: BlockMediaField) => void;
  onJoinNarration?: (
    blockId: string,
    groupId: string,
    placement: JoinableNarrationTarget["placement"],
  ) => void;
  onLeaveNarrationGroup?: (blockId: string) => void;
  musicUrl?: string | null;
  musicStatus?: string | null;
  musicPrompt?: string | null;
  musicStartSeconds?: number;
  musicSpanSeconds?: number | null;
  music2Url?: string | null;
  music2TimelineStartSeconds?: number | null;
  onMusicClick?: () => void;
  volumes: TimelineVolumes;
  onVolumesChange: (patch: Partial<TimelineVolumes>) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
  videoFormat?: VideoFormat | string | null;
  onPxPerSecondChange?: (pxPerSecond: number) => void;
  videoDurationAlerts?: Record<string, BlockVideoDurationAlert>;
}

const TRACK_LABEL_WIDTH = 108;
const RULER_HEIGHT = 24;
const TRACK_ROW = 44;
const VIDEO_TRACK_ROW_MIN = 36;
const VIDEO_TRACK_ROW_MAX = 160;

function readStoredVideoTrackHeight(formatId: string, defaultHeight: number): number {
  if (typeof window === "undefined") return defaultHeight;
  const raw = localStorage.getItem(`imagine.timelineVideoTrackHeight.${formatId}`);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return defaultHeight;
  return Math.min(VIDEO_TRACK_ROW_MAX, Math.max(VIDEO_TRACK_ROW_MIN, Math.round(parsed)));
}

function getTotalRowHeight(videoTrackHeight: number, keyframeRowHeight: number) {
  return videoTrackHeight + keyframeRowHeight + TRACK_ROW * 4;
}

export function Timeline({
  blocks,
  pxPerSecond,
  currentTime,
  playing,
  onScrub,
  selectedBlockId,
  onSelect,
  onDurationChange,
  onReorderBlocks,
  onMoveBlockEarlier,
  onMoveBlockLater,
  canMoveBlockEarlier,
  canMoveBlockLater,
  onDeleteBlocks,
  onDuplicateBlock,
  onClearBlockMedia,
  onJoinNarration,
  onLeaveNarrationGroup,
  musicUrl,
  musicStatus,
  musicPrompt,
  musicStartSeconds = 0,
  musicSpanSeconds = null,
  music2Url = null,
  music2TimelineStartSeconds = null,
  onMusicClick,
  volumes,
  onVolumesChange,
  projectAvatarId = null,
  avatarMap = {},
  videoFormat = "horizontal",
  onPxPerSecondChange,
  videoDurationAlerts = {},
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const keyframeRowHeight = formatSpec.timelineKeyframeRowHeight;
  const [videoTrackHeight, setVideoTrackHeight] = React.useState(
    formatSpec.timelineVideoTrackHeight,
  );
  React.useEffect(() => {
    setVideoTrackHeight(
      readStoredVideoTrackHeight(formatSpec.id, formatSpec.timelineVideoTrackHeight),
    );
  }, [formatSpec.id, formatSpec.timelineVideoTrackHeight]);

  const persistVideoTrackHeight = React.useCallback(
    (next: number) => {
      const clamped = Math.min(
        VIDEO_TRACK_ROW_MAX,
        Math.max(VIDEO_TRACK_ROW_MIN, Math.round(next)),
      );
      setVideoTrackHeight(clamped);
      try {
        localStorage.setItem(
          `imagine.timelineVideoTrackHeight.${formatSpec.id}`,
          String(clamped),
        );
      } catch {
        // ignore quota errors
      }
    },
    [formatSpec.id],
  );

  const totalRowHeight = getTotalRowHeight(videoTrackHeight, keyframeRowHeight);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const zoomAnchorRef = React.useRef<{
    timeAtMouseSeconds: number;
    mouseX: number;
    targetPxPerSecond: number;
  } | null>(null);
  const prevZoomScrollRef = React.useRef<{ pxPerSecond: number; scrollLeft: number } | null>(
    null,
  );
  const [durationPreview, setDurationPreview] = React.useState<{
    blockId: string;
    durationSeconds: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = React.useState<TimelineContextMenuTarget | null>(
    null,
  );

  const openBlockContextMenu = React.useCallback(
    (
      event: React.MouseEvent,
      blockIds: string[],
      options?: { removableMedia?: BlockMediaField[] },
    ) => {
      if ((!onDeleteBlocks && !onClearBlockMedia && !onJoinNarration && !onLeaveNarrationGroup && !onDuplicateBlock) || blockIds.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const primaryId = blockIds[0]!;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        blockIds,
        removableMedia: options?.removableMedia,
        canMoveEarlier:
          blockIds.length === 1 ? (canMoveBlockEarlier?.(primaryId) ?? false) : false,
        canMoveLater:
          blockIds.length === 1 ? (canMoveBlockLater?.(primaryId) ?? false) : false,
        joinNarrationTargets:
          blockIds.length === 1 && onJoinNarration
            ? listJoinableNarrationTargets(blocks, primaryId)
            : undefined,
        canLeaveNarrationGroup:
          blockIds.length === 1
            ? (() => {
                const block = blocks.find((item) => item.id === primaryId);
                return block ? canLeaveNarrationGroup(block) : false;
              })()
            : false,
      });
      onSelect(primaryId);
    },
    [
      blocks,
      canMoveBlockEarlier,
      canMoveBlockLater,
      onClearBlockMedia,
      onDeleteBlocks,
      onDuplicateBlock,
      onJoinNarration,
      onLeaveNarrationGroup,
      onSelect,
    ],
  );

  const handleContextMoveEarlier = React.useCallback(
    (blockId: string) => {
      setContextMenu(null);
      onMoveBlockEarlier?.(blockId);
    },
    [onMoveBlockEarlier],
  );

  const handleContextMoveLater = React.useCallback(
    (blockId: string) => {
      setContextMenu(null);
      onMoveBlockLater?.(blockId);
    },
    [onMoveBlockLater],
  );

  const handleContextDelete = React.useCallback(
    (blockIds: string[]) => {
      setContextMenu(null);
      onDeleteBlocks?.(blockIds);
    },
    [onDeleteBlocks],
  );

  const handleContextClearMedia = React.useCallback(
    (blockId: string, field: BlockMediaField) => {
      setContextMenu(null);
      onClearBlockMedia?.(blockId, field);
    },
    [onClearBlockMedia],
  );

  const handleContextDuplicate = React.useCallback(
    (blockId: string) => {
      setContextMenu(null);
      onDuplicateBlock?.(blockId);
    },
    [onDuplicateBlock],
  );

  const displayBlocks = React.useMemo(() => {
    if (!durationPreview) return blocks;
    return blocks.map((block) =>
      block.id === durationPreview.blockId
        ? { ...block, durationSeconds: durationPreview.durationSeconds }
        : block,
    );
  }, [blocks, durationPreview]);

  const totalSeconds = computeTimelineDurationSeconds(displayBlocks);
  const contentWidth = Math.max(800, Math.ceil(totalSeconds * pxPerSecond));
  const sortedBlocks = React.useMemo(
    () => sortBlocksByPosition(displayBlocks),
    [displayBlocks],
  );
  const narrationSpans = React.useMemo(
    () => buildNarrationTrackSpans(displayBlocks),
    [displayBlocks],
  );
  const musicSwellZones = React.useMemo(
    () => listMusicSwellZones(sortedBlocks),
    [sortedBlocks],
  );

  const clearDurationPreview = React.useCallback(() => {
    setDurationPreview(null);
  }, []);

  const commitDurationPreview = React.useCallback(
    (durationSeconds: number) => {
      if (!durationPreview) {
        clearDurationPreview();
        return;
      }
      const { blockId } = durationPreview;
      clearDurationPreview();
      onDurationChange?.(blockId, durationSeconds);
    },
    [clearDurationPreview, durationPreview, onDurationChange],
  );

  const trackScrubbing = React.useRef(false);
  const scrubClientXRef = React.useRef(0);
  const stopScrubFollowRef = React.useRef<(() => void) | null>(null);

  const scrubFromClientX = React.useCallback(
    (clientX: number) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      scrubClientXRef.current = clientX;
      scrubTimelineAtClientX(clientX, scrollEl, pxPerSecond, totalSeconds, onScrub);
    },
    [onScrub, pxPerSecond, totalSeconds],
  );

  const stopScrubFollow = React.useCallback(() => {
    stopScrubFollowRef.current?.();
    stopScrubFollowRef.current = null;
  }, []);

  const startScrubFollow = React.useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    stopScrubFollow();
    stopScrubFollowRef.current = runTimelineScrubFollowLoop(
      () => scrubClientXRef.current,
      scrollEl,
      pxPerSecond,
      totalSeconds,
      onScrub,
      () => trackScrubbing.current,
    );
  }, [onScrub, pxPerSecond, stopScrubFollow, totalSeconds]);

  React.useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!trackScrubbing.current) return;
      scrubFromClientX(event.clientX);
    }
    function onUp() {
      trackScrubbing.current = false;
      stopScrubFollow();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopScrubFollow();
    };
  }, [scrubFromClientX, stopScrubFollow]);

  const startTrackScrub = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      trackScrubbing.current = true;
      scrubClientXRef.current = event.clientX;
      startScrubFollow();
      scrubFromClientX(event.clientX);
    },
    [scrubFromClientX, startScrubFollow],
  );

  React.useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = currentTime * pxPerSecond;
    const margin = 80;
    const minVisible = el.scrollLeft + margin;
    const maxVisible = el.scrollLeft + el.clientWidth - margin;
    if (playheadX < minVisible || playheadX > maxVisible) {
      el.scrollTo({
        left: Math.max(0, playheadX - el.clientWidth / 2),
        behavior: "smooth",
      });
    }
  }, [currentTime, pxPerSecond, playing]);

  React.useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    if (anchor && anchor.targetPxPerSecond === pxPerSecond) {
      scrollEl.scrollLeft = scrollLeftForZoomAtCursor({
        timeAtMouseSeconds: anchor.timeAtMouseSeconds,
        mouseXInViewport: anchor.mouseX,
        pxPerSecond,
      });
      zoomAnchorRef.current = null;
      prevZoomScrollRef.current = { pxPerSecond, scrollLeft: scrollEl.scrollLeft };
      return;
    }

    const prev = prevZoomScrollRef.current;
    if (prev && prev.pxPerSecond !== pxPerSecond && prev.pxPerSecond > 0) {
      const centerTime = Math.min(
        totalSeconds,
        Math.max(0, currentTime),
      );
      scrollEl.scrollLeft = Math.max(
        0,
        centerTime * pxPerSecond - scrollEl.clientWidth / 2,
      );
    }
    prevZoomScrollRef.current = { pxPerSecond, scrollLeft: scrollEl.scrollLeft };
  }, [pxPerSecond, contentWidth, currentTime, totalSeconds]);

  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    function onWheel(event: WheelEvent) {
      const el = scrollRef.current;
      if (!el) return;

      if (event.altKey) {
        if (!onPxPerSecondChange) return;
        event.preventDefault();
        const next = nextTimelinePxPerSecondFromWheel(pxPerSecond, event.deltaY);
        if (next === pxPerSecond) return;

        const rect = el.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const timeAtMouse = (el.scrollLeft + mouseX) / pxPerSecond;
        zoomAnchorRef.current = {
          timeAtMouseSeconds: timeAtMouse,
          mouseX,
          targetPxPerSecond: next,
        };
        onPxPerSecondChange(next);
        return;
      }

      event.preventDefault();
      applyTimelineAltWheelPan(el, event);
    }

    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollEl.removeEventListener("wheel", onWheel);
  }, [onPxPerSecondChange, pxPerSecond, totalSeconds]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-timeline-bg text-timeline-foreground">
      <div className="flex min-h-0 flex-1">
        <TrackMixer
          volumes={volumes}
          onVolumesChange={onVolumesChange}
          videoTrackHeight={videoTrackHeight}
          keyframeRowHeight={keyframeRowHeight}
          onVideoTrackHeightChange={persistVideoTrackHeight}
          formatLabel={formatSpec.shortLabel}
        />
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-dark"
          title="Scroll wheel: pan left/right · Alt+scroll: zoom in/out at cursor"
        >
          <div className="relative" style={{ width: contentWidth }}>
            <TimelineRuler
              totalSeconds={totalSeconds}
              pxPerSecond={pxPerSecond}
              onScrub={onScrub}
              scrollRef={scrollRef}
            />

            <div className="relative">
              <div
                className="relative border-b border-timeline-border bg-timeline-track/40"
                style={{ height: videoTrackHeight }}
              >
                <div
                  className="absolute inset-0 z-0 cursor-ew-resize"
                  onPointerDown={startTrackScrub}
                />
                {onReorderBlocks ? (
                  <Reorder.Group
                    axis="x"
                    values={sortedBlocks}
                    onReorder={onReorderBlocks}
                    className="relative z-10 flex h-full items-center py-1"
                  >
                    {sortedBlocks.map((b) => {
                      const previewSeconds =
                        durationPreview?.blockId === b.id
                          ? durationPreview.durationSeconds
                          : null;
                      const displayBlock =
                        previewSeconds != null ? { ...b, durationSeconds: previewSeconds } : b;
                      return (
                        <VideoTrackBlock
                          key={b.id}
                          block={displayBlock}
                          reorderValue={b}
                          allBlocks={sortedBlocks}
                          pxPerSecond={pxPerSecond}
                          selected={b.id === selectedBlockId}
                          onSelect={onSelect}
                          projectAvatarId={projectAvatarId}
                          avatarMap={avatarMap}
                          videoFormat={videoFormat}
                          rowHeight={videoTrackHeight}
                          previewDurationSeconds={previewSeconds}
                          minDurationSeconds={
                            isVisualCutOnly(b) || b.narrativeText.trim().length === 0 ? 1 : 2
                          }
                          onResizePreview={(durationSeconds) =>
                            setDurationPreview({ blockId: b.id, durationSeconds })
                          }
                          onResizeCommit={commitDurationPreview}
                          onResizeCancel={clearDurationPreview}
                          onContextMenu={(event) =>
                            openBlockContextMenu(event, [b.id], {
                              removableMedia: [
                                b.keyframeUrl ? "keyframe" : null,
                                b.videoUrl ? "video" : null,
                                b.audioUrl ? "audio" : null,
                                b.sceneAudioUrl ? "sceneAudio" : null,
                              ].filter((field): field is BlockMediaField => field != null),
                            })
                          }
                          videoShortAlert={videoDurationAlerts[b.id] ?? null}
                        />
                      );
                    })}
                  </Reorder.Group>
                ) : (
                  sortedBlocks.map((b) => {
                    const previewSeconds =
                      durationPreview?.blockId === b.id ? durationPreview.durationSeconds : null;
                    const displayBlock =
                      previewSeconds != null ? { ...b, durationSeconds: previewSeconds } : b;
                    return (
                      <TimelineClip
                        key={b.id}
                        startSeconds={resolveVideoStartSeconds(b, sortedBlocks)}
                        pxPerSecond={pxPerSecond}
                        rowHeight={videoTrackHeight}
                      >
                        <VideoTrackBlock
                          block={displayBlock}
                          allBlocks={sortedBlocks}
                          pxPerSecond={pxPerSecond}
                          selected={b.id === selectedBlockId}
                          onSelect={onSelect}
                          projectAvatarId={projectAvatarId}
                          avatarMap={avatarMap}
                          videoFormat={videoFormat}
                          rowHeight={videoTrackHeight}
                          previewDurationSeconds={previewSeconds}
                          minDurationSeconds={
                            isVisualCutOnly(b) || b.narrativeText.trim().length === 0 ? 1 : 2
                          }
                          onResizePreview={(durationSeconds) =>
                            setDurationPreview({ blockId: b.id, durationSeconds })
                          }
                          onResizeCommit={commitDurationPreview}
                          onResizeCancel={clearDurationPreview}
                          onContextMenu={(event) =>
                            openBlockContextMenu(event, [b.id], {
                              removableMedia: [
                                b.keyframeUrl ? "keyframe" : null,
                                b.videoUrl ? "video" : null,
                                b.audioUrl ? "audio" : null,
                                b.sceneAudioUrl ? "sceneAudio" : null,
                              ].filter((field): field is BlockMediaField => field != null),
                            })
                          }
                          videoShortAlert={videoDurationAlerts[b.id] ?? null}
                        />
                      </TimelineClip>
                    );
                  })
                )}
              </div>

              <div
                className="relative border-b border-timeline-border bg-violet-500/10"
                style={{ height: keyframeRowHeight }}
              >
                <div
                  className="absolute inset-0 z-0 cursor-ew-resize"
                  onPointerDown={startTrackScrub}
                />
                {onReorderBlocks ? (
                  <div className="relative z-10 flex h-full items-center py-1">
                    {sortedBlocks.map((b) => {
                      const previewSeconds =
                        durationPreview?.blockId === b.id
                          ? durationPreview.durationSeconds
                          : null;
                      const displayBlock =
                        previewSeconds != null ? { ...b, durationSeconds: previewSeconds } : b;
                      return (
                        <KeyframeTrackBlock
                          key={`kf-${b.id}`}
                          block={displayBlock}
                          allBlocks={sortedBlocks}
                          pxPerSecond={pxPerSecond}
                          selected={b.id === selectedBlockId}
                          onSelect={onSelect}
                          videoFormat={videoFormat}
                          rowHeight={keyframeRowHeight}
                          previewDurationSeconds={previewSeconds}
                          onContextMenu={(event) =>
                            openBlockContextMenu(event, [b.id], {
                              removableMedia: [
                                b.keyframeUrl ? "keyframe" : null,
                              ].filter((field): field is BlockMediaField => field != null),
                            })
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  sortedBlocks.map((b) => {
                    const previewSeconds =
                      durationPreview?.blockId === b.id ? durationPreview.durationSeconds : null;
                    const displayBlock =
                      previewSeconds != null ? { ...b, durationSeconds: previewSeconds } : b;
                    return (
                      <TimelineClip
                        key={`kf-${b.id}`}
                        startSeconds={resolveVideoStartSeconds(b, sortedBlocks)}
                        pxPerSecond={pxPerSecond}
                        rowHeight={keyframeRowHeight}
                      >
                        <KeyframeTrackBlock
                          block={displayBlock}
                          allBlocks={sortedBlocks}
                          pxPerSecond={pxPerSecond}
                          selected={b.id === selectedBlockId}
                          onSelect={onSelect}
                          videoFormat={videoFormat}
                          rowHeight={keyframeRowHeight}
                          previewDurationSeconds={previewSeconds}
                          onContextMenu={(event) =>
                            openBlockContextMenu(event, [b.id], {
                              removableMedia: [
                                b.keyframeUrl ? "keyframe" : null,
                              ].filter((field): field is BlockMediaField => field != null),
                            })
                          }
                        />
                      </TimelineClip>
                    );
                  })
                )}
              </div>

              <div
                className="relative border-b border-timeline-border bg-cyan-500/10"
                style={{ height: 44 }}
              >
                <div
                  className="absolute inset-0 z-0 cursor-ew-resize"
                  onPointerDown={startTrackScrub}
                />
                {sortedBlocks.map((b) => (
                  <TimelineClip
                    key={`scene-${b.id}`}
                    startSeconds={resolveSceneStartSeconds(b, sortedBlocks)}
                    pxPerSecond={pxPerSecond}
                    rowHeight={44}
                  >
                    <SceneAudioTrackBlock
                      block={b}
                      pxPerSecond={pxPerSecond}
                      selected={b.id === selectedBlockId}
                      onSelect={onSelect}
                      onContextMenu={(event) => openBlockContextMenu(event, [b.id])}
                    />
                  </TimelineClip>
                ))}
              </div>

              <div
                className="relative border-b border-timeline-border bg-timeline-track/30"
                style={{ height: 44 }}
              >
                <div
                  className="absolute inset-0 z-0 cursor-ew-resize"
                  onPointerDown={startTrackScrub}
                />
                {narrationSpans.map((span) => (
                  <TimelineClip
                    key={span.id}
                    startSeconds={resolveNarrationSpanStartSeconds(
                      span.leadBlock,
                      span.blocks,
                      sortedBlocks,
                    )}
                    pxPerSecond={pxPerSecond}
                    rowHeight={44}
                  >
                    <AudioTrackBlock
                      block={span.leadBlock}
                      spanBlocks={span.blocks.length > 1 ? span.blocks : undefined}
                      pxPerSecond={pxPerSecond}
                      selected={span.blocks.some((item) => item.id === selectedBlockId)}
                      onSelect={onSelect}
                      projectAvatarId={projectAvatarId}
                      avatarMap={avatarMap}
                      onContextMenu={(event) =>
                        openBlockContextMenu(
                          event,
                          span.blocks.map((item) => item.id),
                        )
                      }
                    />
                  </TimelineClip>
                ))}
              </div>

              <div className="flex h-[44px] items-center gap-0 border-b border-timeline-border bg-amber-500/10 px-0.5">
                <MusicTrackBlock
                  totalSeconds={totalSeconds}
                  pxPerSecond={pxPerSecond}
                  musicUrl={musicUrl}
                  musicStatus={musicStatus}
                  musicPrompt={musicPrompt}
                  musicStartSeconds={musicStartSeconds}
                  musicSpanSeconds={musicSpanSeconds}
                  music2Url={music2Url}
                  music2TimelineStartSeconds={music2TimelineStartSeconds}
                  swellZones={musicSwellZones}
                  onClick={onMusicClick}
                />
              </div>

              <div className="relative bg-timeline-track/20" style={{ height: 44 }}>
                <div
                  className="absolute inset-0 z-0 cursor-ew-resize"
                  onPointerDown={startTrackScrub}
                />
                {narrationSpans.map((span) => (
                  <TimelineClip
                    key={`text-${span.id}`}
                    startSeconds={resolveNarrationSpanStartSeconds(
                      span.leadBlock,
                      span.blocks,
                      sortedBlocks,
                    )}
                    pxPerSecond={pxPerSecond}
                    rowHeight={44}
                  >
                    <TextTrackBlock
                      block={span.leadBlock}
                      spanBlocks={span.blocks.length > 1 ? span.blocks : undefined}
                      pxPerSecond={pxPerSecond}
                      selected={span.blocks.some((item) => item.id === selectedBlockId)}
                      onSelect={onSelect}
                      onContextMenu={(event) =>
                        openBlockContextMenu(
                          event,
                          span.blocks.map((item) => item.id),
                        )
                      }
                    />
                  </TimelineClip>
                ))}
              </div>
            </div>

            <TimelinePlayhead
              currentTime={currentTime}
              pxPerSecond={pxPerSecond}
              height={RULER_HEIGHT + totalRowHeight}
              rulerHeight={RULER_HEIGHT}
              totalSeconds={totalSeconds}
              scrollRef={scrollRef}
              onScrub={onScrub}
            />
          </div>
        </div>
      </div>
      {contextMenu ? (
        <TimelineContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleContextDelete}
          onClearMedia={onClearBlockMedia ? handleContextClearMedia : undefined}
          onMoveEarlier={onMoveBlockEarlier ? handleContextMoveEarlier : undefined}
          onMoveLater={onMoveBlockLater ? handleContextMoveLater : undefined}
          onJoinNarration={onJoinNarration}
          onLeaveNarrationGroup={onLeaveNarrationGroup}
          onDuplicate={onDuplicateBlock ? handleContextDuplicate : undefined}
        />
      ) : null}
    </div>
  );
}

function TrackMixer({
  volumes,
  onVolumesChange,
  videoTrackHeight,
  keyframeRowHeight,
  onVideoTrackHeightChange,
  formatLabel,
}: {
  volumes: TimelineVolumes;
  onVolumesChange: (patch: Partial<TimelineVolumes>) => void;
  videoTrackHeight: number;
  keyframeRowHeight: number;
  onVideoTrackHeightChange: (height: number) => void;
  formatLabel: string;
}) {
  const resizeRef = React.useRef({ active: false, startY: 0, startHeight: videoTrackHeight });

  function onVideoRowResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { active: true, startY: event.clientY, startHeight: videoTrackHeight };
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current.active) return;
      const delta = moveEvent.clientY - resizeRef.current.startY;
      onVideoTrackHeightChange(resizeRef.current.startHeight + delta);
    };

    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  return (
    <div
      className="flex shrink-0 flex-col border-r border-timeline-border bg-timeline-ruler text-timeline-muted"
      style={{ width: TRACK_LABEL_WIDTH }}
    >
      <div className="flex h-6 flex-col justify-center border-b border-timeline-border px-1.5">
        <TimelineVolumeSlider
          label="Master"
          value={volumes.master}
          onChange={(v) => onVolumesChange({ master: v })}
          compact
        />
      </div>
      <div
        className="relative flex flex-col justify-center border-b border-timeline-border px-2 text-[10px] uppercase tracking-wide"
        style={{ height: videoTrackHeight }}
      >
        <span>Video · {formatLabel}</span>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize video track height"
          onPointerDown={onVideoRowResizeStart}
          className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize hover:bg-accent/40"
          title="Drag to resize video track"
        />
      </div>
      <div
        className="flex items-center border-b border-timeline-border px-2 text-[10px] uppercase tracking-wide text-violet-300/90 [html[data-theme=light-all]_&]:text-violet-700"
        style={{ height: keyframeRowHeight }}
      >
        Keyframe · {formatLabel}
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-timeline-border px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-cyan-300/90 [html[data-theme=light-all]_&]:text-cyan-700">
          Scene
        </span>
        <TimelineVolumeSlider
          value={volumes.scene}
          onChange={(v) => onVolumesChange({ scene: v })}
          accent="cyan"
          compact
        />
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-timeline-border px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-emerald-300/90 [html[data-theme=light-all]_&]:text-emerald-700">
          Narration
        </span>
        <TimelineVolumeSlider
          value={volumes.narration}
          onChange={(v) => onVolumesChange({ narration: v })}
          accent="emerald"
          compact
        />
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-timeline-border px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-amber-300/90 [html[data-theme=light-all]_&]:text-amber-700">
          Music
        </span>
        <TimelineVolumeSlider
          value={volumes.music}
          onChange={(v) => onVolumesChange({ music: v })}
          accent="amber"
          compact
        />
      </div>
      <div className="flex h-[44px] items-center px-2 text-[10px] uppercase tracking-wide">
        Text
      </div>
    </div>
  );
}
