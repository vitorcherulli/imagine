"use client";

import * as React from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  GripVertical,
  Image as ImageIcon,
  Film,
  AudioLines,
  Music,
  Loader2,
  Waves,
  Repeat,
} from "lucide-react";
import type { BlockVideoDurationAlert } from "@/lib/video-duration-mismatch";
import { videoShortTooltip } from "@/lib/video-duration-mismatch";
import type { Block } from "./types";
import { segmentColor, resolveBlockCharacterDisplay, statusDot, type AvatarLookup } from "./types";
import { cn } from "@/lib/utils";
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";
import {
  durationFromResizeDelta,
  snapTimelineDurationSeconds,
} from "@/lib/timeline-duration";
import { timelineClipWidthPx } from "@/lib/timeline-zoom";
import { AudioWaveform, useAudioWaveformDuration } from "@/components/timeline/AudioWaveform";
import { effectiveMusicSpanSeconds } from "@/lib/music-timeline";
import {
  musicNeedsLoopForTimeline,
  musicPlayableSeconds,
  musicShortTooltip,
} from "@/lib/music-duration-mismatch";
import {
  MUSIC_SWELL_FADE_SECONDS,
  MUSIC_SWELL_VOLUME_MULTIPLIER,
  type MusicSwellZone,
} from "@/lib/music-swell";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "@/lib/script-pause";
import { TimelineThumbImage } from "@/components/timeline/TimelineThumbImage";
import { timelineThumbCandidates } from "@/lib/timeline-preview-media";

interface VideoTrackBlockProps {
  block: Block;
  /** Stable identity for timeline reorder — pass the block from `sortedBlocks`, not preview clones. */
  reorderValue?: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
  videoFormat?: VideoFormat | string | null;
  rowHeight?: number;
  previewDurationSeconds?: number | null;
  minDurationSeconds?: number;
  onResizePreview?: (durationSeconds: number) => void;
  onResizeCommit?: (durationSeconds: number) => void;
  onResizeCancel?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  allBlocks?: Block[];
  videoShortAlert?: BlockVideoDurationAlert | null;
}

function TimelineVideoThumb({
  visual,
  className,
}: {
  visual: Block | null;
  className?: string;
}) {
  return <TimelineThumbImage visual={visual} className={className} />;
}

export function VideoTrackBlock({
  block,
  reorderValue,
  pxPerSecond,
  selected,
  onSelect,
  projectAvatarId = null,
  avatarMap = {},
  videoFormat = "horizontal",
  previewDurationSeconds = null,
  minDurationSeconds = 1,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
  onContextMenu,
  allBlocks = [],
  rowHeight,
  videoShortAlert = null,
}: VideoTrackBlockProps) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const trackRowHeight = rowHeight ?? formatSpec.timelineVideoTrackHeight;
  const controls = useDragControls();
  const canReorder = Boolean(reorderValue);
  const visualBlock = isStoryBlockPause(block)
    ? resolveNeighborVisualBlock(allBlocks.length > 0 ? allBlocks : [block], block)
    : block;
  const displayDuration = previewDurationSeconds ?? block.durationSeconds;
  const width = timelineClipWidthPx(displayDuration, pxPerSecond);
  const blockHeight = trackRowHeight - 8;
  const compact = trackRowHeight < 72;
  const videoUrl = visualBlock?.videoUrl ?? null;
  const videoGenerating = block.status === "video_generating" || block.status === "generating";
  const grad = isStoryBlockPause(block)
    ? "from-slate-500/70 to-slate-700/80 border-dashed"
    : segmentColor(block.segmentType);
  const status = statusDot(block);
  const isResizing = previewDurationSeconds !== null;
  const resizeRef = React.useRef({
    active: false,
    startX: 0,
    startDuration: block.durationSeconds,
    latestDuration: block.durationSeconds,
    didMove: false,
  });

  const finishResize = React.useCallback(
    (commit: boolean) => {
      const state = resizeRef.current;
      if (!state.active) return;
      state.active = false;
      const finalDuration = snapTimelineDurationSeconds(
        state.latestDuration,
        minDurationSeconds,
      );
      if (commit && state.didMove && finalDuration !== block.durationSeconds) {
        onResizeCommit?.(finalDuration);
      } else {
        onResizeCancel?.();
      }
    },
    [block.durationSeconds, minDurationSeconds, onResizeCancel, onResizeCommit],
  );

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!onResizePreview || !onResizeCommit) return;
    event.stopPropagation();
    event.preventDefault();

    const startDuration = block.durationSeconds;
    resizeRef.current = {
      active: true,
      startX: event.clientX,
      startDuration,
      latestDuration: startDuration,
      didMove: false,
    };
    onResizePreview(startDuration);
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current.active) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const deltaPx = moveEvent.clientX - resizeRef.current.startX;
      if (Math.abs(deltaPx) > 2) resizeRef.current.didMove = true;
      const next = durationFromResizeDelta(
        resizeRef.current.startDuration,
        deltaPx,
        pxPerSecond,
        minDurationSeconds,
        { snap: false },
      );
      resizeRef.current.latestDuration = next;
      onResizePreview(next);
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        event.currentTarget.releasePointerCapture(upEvent.pointerId);
      } catch {}
      finishResize(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  React.useEffect(() => {
    if (!isResizing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishResize(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishResize, isResizing]);

  return (
    <BlockShell
      reorderValue={reorderValue}
      blockId={block.id}
      controls={controls}
      className={cn(
        "group relative shrink-0 rounded-md border bg-gradient-to-br shadow-sm",
        isResizing ? "overflow-visible" : "overflow-hidden",
        !isResizing && "transition-[width] duration-75",
        grad,
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-white/10 hover:border-white/30",
        isResizing && "z-20 ring-1 ring-white/50",
      )}
      style={{ width, height: blockHeight }}
      onClick={() => {
        if (resizeRef.current.didMove) {
          resizeRef.current.didMove = false;
          return;
        }
        onSelect(block.id);
      }}
      onContextMenu={onContextMenu}
    >
      {canReorder ? (
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            controls.start(event);
          }}
          className="absolute left-0 top-0 z-20 flex h-full w-3 cursor-grab items-center justify-center bg-black/30 text-white/70 hover:bg-black/50 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      ) : null}

      {videoUrl ? (
        <TimelineVideoThumb visual={visualBlock} className="absolute inset-0" />
      ) : videoGenerating ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-4 w-4 animate-spin text-white/80" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/60">
          <Film className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30",
          canReorder ? "left-3" : "left-0",
        )}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-1 px-1.5 py-0.5",
          canReorder ? "left-3" : "left-0",
        )}
      >
        <div className="flex min-w-0 items-center gap-1">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.color)} title={status.label} />
          {!compact && (
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/95">
              {isStoryBlockPause(block) ? "Music" : block.segmentType}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded bg-black/60 px-1 text-[9px] font-mono text-white/90">
          {Number.isInteger(displayDuration)
            ? `${displayDuration}s`
            : `${displayDuration.toFixed(1)}s`}
        </span>
      </div>

      {videoShortAlert ? (
        <div
          className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/60 bg-amber-500/90 text-amber-950 shadow-sm"
          title={videoShortTooltip(videoShortAlert)}
        >
          <Repeat className="h-3 w-3" />
        </div>
      ) : null}

      {onResizePreview && onResizeCommit ? (
        <>
          <div
            data-timeline-clip-resize="end"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize clip duration"
            aria-valuemin={minDurationSeconds}
            aria-valuemax={60}
            aria-valuenow={displayDuration}
            onPointerDown={handleResizePointerDown}
            className={cn(
              "absolute right-0 top-0 z-30 h-full w-4 touch-none",
              "cursor-ew-resize select-none",
            )}
            title="Drag left to shorten · drag right to lengthen (start stays fixed)"
          >
            <div
              className={cn(
                "absolute right-0 top-1 bottom-1 w-1 rounded-full bg-white/70 opacity-0 transition-opacity",
                "group-hover:opacity-100",
                isResizing && "opacity-100 bg-white",
              )}
            />
          </div>
          {isResizing ? (
            <div className="pointer-events-none absolute -top-5 right-1 z-40 rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-mono text-white shadow-md">
              {Number.isInteger(displayDuration)
                ? `${displayDuration}s`
                : `${displayDuration.toFixed(1)}s`}
            </div>
          ) : null}
        </>
      ) : null}
    </BlockShell>
  );
}

interface KeyframeTrackBlockProps {
  block: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  videoFormat?: VideoFormat | string | null;
  rowHeight?: number;
  previewDurationSeconds?: number | null;
  onContextMenu?: (event: React.MouseEvent) => void;
  allBlocks?: Block[];
}

export function KeyframeTrackBlock({
  block,
  pxPerSecond,
  selected,
  onSelect,
  videoFormat = "horizontal",
  rowHeight,
  previewDurationSeconds = null,
  onContextMenu,
  allBlocks = [],
}: KeyframeTrackBlockProps) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const trackRowHeight = rowHeight ?? formatSpec.timelineKeyframeRowHeight;
  const visualBlock = isStoryBlockPause(block)
    ? resolveNeighborVisualBlock(allBlocks.length > 0 ? allBlocks : [block], block)
    : block;
  const displayDuration = previewDurationSeconds ?? block.durationSeconds;
  const width = timelineClipWidthPx(displayDuration, pxPerSecond);
  const blockHeight = trackRowHeight - 8;
  const grad = isStoryBlockPause(block)
    ? "from-slate-500/70 to-slate-700/80 border-dashed"
    : segmentColor(block.segmentType);
  const generating = block.status === "image_generating";
  const thumbCandidates = timelineThumbCandidates(visualBlock);
  const hasThumb = thumbCandidates.length > 0 || Boolean(visualBlock?.videoUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md border bg-gradient-to-br shadow-sm",
        grad,
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-white/10 hover:border-white/30",
        !hasThumb && !generating && "opacity-90",
      )}
      style={{ width, height: blockHeight }}
      onClick={() => onSelect(block.id)}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(block.id);
        }
      }}
      title={
        hasThumb
          ? "Keyframe — click to select block"
          : generating
            ? "Generating keyframe…"
            : "No keyframe yet"
      }
    >
      <div className="flex h-full items-center justify-center p-1">
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded bg-black/40 text-white/80",
            formatSpec.timelineKeyframeThumbClass,
          )}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasThumb ? (
            <TimelineThumbImage visual={visualBlock} className="h-full w-full" iconClassName="h-3.5 w-3.5" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </div>
      </div>
    </div>
  );
}

function BlockShell({
  reorderValue,
  blockId,
  controls,
  className,
  style,
  onClick,
  onContextMenu,
  children,
}: {
  reorderValue?: Block;
  blockId: string;
  controls: ReturnType<typeof useDragControls>;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  if (!reorderValue) {
    return (
      <div className={className} style={style} onClick={onClick} onContextMenu={onContextMenu}>
        {children}
      </div>
    );
  }

  return (
    <Reorder.Item
      value={reorderValue}
      id={blockId}
      dragListener={false}
      dragControls={controls}
      className={className}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </Reorder.Item>
  );
}

export function AudioTrackBlock({
  block,
  spanBlocks,
  pxPerSecond,
  selected,
  onSelect,
  projectAvatarId = null,
  avatarMap = {},
  onContextMenu,
}: {
  block: Block;
  /** When set, this lane spans multiple visual cuts under one narration group. */
  spanBlocks?: Block[];
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const groupBlocks = spanBlocks ?? [block];
  const spanWidthPx = timelineClipWidthPx(
    groupBlocks.reduce((sum, item) => sum + item.durationSeconds, 0),
    pxPerSecond,
  );
  const spanDurationSeconds = groupBlocks.reduce(
    (sum, item) => sum + item.durationSeconds,
    0,
  );
  const hasAudio = !!block.audioUrl;
  const audioDurationSeconds = useAudioWaveformDuration(hasAudio ? block.audioUrl : null);
  const waveformWidthPx =
    hasAudio && audioDurationSeconds != null
      ? Math.min(spanWidthPx, timelineClipWidthPx(audioDurationSeconds, pxPerSecond))
      : hasAudio
        ? spanWidthPx
        : 0;
  const visualCuts = groupBlocks.length;
  const vol = block.audioVolume ?? 100;
  const muted = vol === 0;
  const isPause = isStoryBlockPause(block);
  const character = resolveBlockCharacterDisplay(block, projectAvatarId, avatarMap);
  const audioEndsBeforeSpan =
    hasAudio &&
    audioDurationSeconds != null &&
    audioDurationSeconds + 0.05 < spanDurationSeconds;

  const title = isPause
    ? `Music moment · ${spanDurationSeconds}s · music swells, narration resumes next`
    : hasAudio && audioDurationSeconds != null
      ? audioEndsBeforeSpan
        ? `Narration ${audioDurationSeconds.toFixed(1)}s · visual span ${spanDurationSeconds.toFixed(1)}s · ${vol}%`
        : visualCuts > 1
          ? `Narration ${audioDurationSeconds.toFixed(1)}s over ${visualCuts} cuts · ${vol}%`
          : `Narration ${audioDurationSeconds.toFixed(1)}s · ${vol}%`
      : hasAudio
        ? visualCuts > 1
          ? `Narration over ${visualCuts} visual cuts · ${vol}%`
          : `Narration · ${vol}%`
        : "No narration yet";

  return (
    <div
      onClick={() => onSelect(block.id)}
      onContextMenu={onContextMenu}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        selected ? "border-accent" : "border-timeline-border/50",
        muted
          ? "bg-timeline-track/60 text-timeline-muted/50"
          : isPause
            ? "bg-violet-500/10 text-violet-200 [html[data-theme=light-all]_&]:text-violet-800"
            : hasAudio
            ? "bg-emerald-950/40 text-emerald-200 [html[data-theme=light-all]_&]:bg-emerald-500/10 [html[data-theme=light-all]_&]:text-emerald-800"
            : "bg-timeline-track text-timeline-muted",
      )}
      style={{ width: spanWidthPx, height: 36 }}
      title={title}
    >
      {hasAudio && block.audioUrl ? (
        <>
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: waveformWidthPx }}
          >
            <AudioWaveform
              audioUrl={block.audioUrl}
              widthPx={waveformWidthPx}
              heightPx={34}
              barClassName={muted ? "fill-emerald-300/35" : "fill-emerald-300/90"}
            />
          </div>
          {audioEndsBeforeSpan ? (
            <div
              className="absolute inset-y-0 border-l border-dashed border-emerald-300/25 bg-black/15"
              style={{ left: waveformWidthPx, right: 0 }}
              title="Visual hold after narration ends"
            />
          ) : null}
        </>
      ) : null}

      <div className="pointer-events-none relative z-10 flex h-full items-center gap-1 bg-gradient-to-r from-black/55 via-black/35 to-transparent px-1.5 pr-8">
        <AudioLines className="h-3 w-3 shrink-0 drop-shadow-sm" />
        {character && (
          <div
            className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/30 ring-1 ring-white/15"
            title={character.name}
          >
            {character.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={character.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[7px] font-bold">{character.name.slice(0, 1)}</span>
            )}
          </div>
        )}
        <span className="truncate drop-shadow-sm">
          {isPause
            ? `Music · ${spanDurationSeconds}s · swell`
            : hasAudio
            ? muted
              ? "Muted"
              : audioDurationSeconds != null
                ? visualCuts > 1
                  ? `Narration · ${audioDurationSeconds.toFixed(1)}s · ${visualCuts} cuts`
                  : `Narration · ${audioDurationSeconds.toFixed(1)}s`
                : visualCuts > 1
                  ? `Narration · ${visualCuts} cuts`
                  : "Narration"
            : "No narration yet"}
        </span>
        {hasAudio && vol !== 100 && (
          <span className="ml-auto shrink-0 font-mono text-[8px] text-emerald-300/80 drop-shadow-sm">
            {vol}%
          </span>
        )}
      </div>
    </div>
  );
}

export function MusicTrackBlock({
  totalSeconds,
  pxPerSecond,
  musicUrl,
  musicStatus,
  musicPrompt,
  musicStartSeconds = 0,
  musicSpanSeconds = null,
  music2Url = null,
  music2TimelineStartSeconds = null,
  swellZones = [],
  onClick,
}: {
  totalSeconds: number;
  pxPerSecond: number;
  musicUrl?: string | null;
  musicStatus?: string | null;
  musicPrompt?: string | null;
  musicStartSeconds?: number;
  musicSpanSeconds?: number | null;
  music2Url?: string | null;
  music2TimelineStartSeconds?: number | null;
  swellZones?: MusicSwellZone[];
  onClick?: () => void;
}) {
  const timelineSpanSeconds = effectiveMusicSpanSeconds(
    { musicSpanSeconds },
    totalSeconds,
  );
  const spanWidthPx = timelineClipWidthPx(totalSeconds, pxPerSecond);
  const clipWidthPx = timelineClipWidthPx(timelineSpanSeconds, pxPerSecond);
  const hasMusic = !!musicUrl;
  const hasMusic2 = Boolean(music2Url?.trim());
  const generating = musicStatus === "generating";
  const error = musicStatus === "error";
  const audioDurationSeconds = useAudioWaveformDuration(hasMusic ? musicUrl : null);
  const music2DurationSeconds = useAudioWaveformDuration(hasMusic2 ? music2Url : null);
  const playableTrack1Seconds =
    audioDurationSeconds != null
      ? musicPlayableSeconds(audioDurationSeconds, musicStartSeconds)
      : null;
  const musicShort =
    hasMusic &&
    audioDurationSeconds != null &&
    !hasMusic2 &&
    musicNeedsLoopForTimeline(playableTrack1Seconds ?? audioDurationSeconds, timelineSpanSeconds);
  const music2Start =
    music2TimelineStartSeconds ??
    (playableTrack1Seconds != null ? playableTrack1Seconds : audioDurationSeconds ?? 0);
  const track1WidthPx =
    hasMusic2 && music2Start > 0
      ? timelineClipWidthPx(Math.min(music2Start, timelineSpanSeconds), pxPerSecond)
      : clipWidthPx;
  const track2WidthPx = hasMusic2
    ? timelineClipWidthPx(Math.max(0, timelineSpanSeconds - music2Start), pxPerSecond)
    : 0;
  const waveformWidthPx =
    hasMusic && audioDurationSeconds != null
      ? Math.min(track1WidthPx, timelineClipWidthPx(audioDurationSeconds, pxPerSecond))
      : hasMusic
        ? track1WidthPx
        : 0;
  const musicEndsBeforeVideo =
    hasMusic && timelineSpanSeconds + 0.05 < totalSeconds;
  const fileLongerThanTimeline =
    hasMusic &&
    audioDurationSeconds != null &&
    audioDurationSeconds > timelineSpanSeconds + 0.5;
  const shortTooltip =
    audioDurationSeconds != null
      ? musicShortTooltip(
          {
            fileDurationSec: playableTrack1Seconds ?? audioDurationSeconds,
            timelineSpanSec: timelineSpanSeconds,
          },
          hasMusic2,
        )
      : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        error
          ? "border-red-500/40 bg-red-900/30 text-red-200 [html[data-theme=light-all]_&]:bg-red-500/15 [html[data-theme=light-all]_&]:text-red-800"
          : hasMusic
            ? "border-amber-400/40 bg-amber-900/40 text-amber-100 [html[data-theme=light-all]_&]:bg-amber-500/15 [html[data-theme=light-all]_&]:text-amber-900"
            : "border-timeline-border/50 bg-timeline-track text-timeline-muted",
      )}
      style={{ width: spanWidthPx, height: 36 }}
      title={
        hasMusic
          ? shortTooltip ??
            `Music ${timelineSpanSeconds.toFixed(1)}s on timeline${
              audioDurationSeconds != null ? ` · ${audioDurationSeconds.toFixed(1)}s file` : ""
            }${hasMusic2 ? " · 2 tracks" : ""}${
              musicStartSeconds > 0 ? ` · starts at ${musicStartSeconds.toFixed(1)}s` : ""
            } · ${(musicPrompt ?? "background score").slice(0, 80)}`
          : (musicPrompt ?? "No background music")
      }
    >
      {hasMusic && musicUrl ? (
        <>
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-md"
            style={{ width: track1WidthPx }}
          >
            <AudioWaveform
              audioUrl={musicUrl}
              widthPx={waveformWidthPx}
              heightPx={34}
              className="bg-amber-400/10"
              barClassName="fill-amber-300/90"
            />
          </div>
          {hasMusic2 && music2Url && track2WidthPx > 0 ? (
            <div
              className="absolute inset-y-0 overflow-hidden rounded-md border-l border-amber-200/30 bg-orange-500/15"
              style={{ left: track1WidthPx, width: track2WidthPx }}
            >
              <AudioWaveform
                audioUrl={music2Url}
                widthPx={Math.min(
                  track2WidthPx,
                  music2DurationSeconds != null
                    ? timelineClipWidthPx(music2DurationSeconds, pxPerSecond)
                    : track2WidthPx,
                )}
                heightPx={34}
                className="bg-orange-400/10"
                barClassName="fill-orange-300/90"
              />
            </div>
          ) : null}
          {swellZones.map((zone) => {
            const fadeInWidth = Math.max(0, zone.pauseStartSeconds - zone.fadeStartSeconds);
            const coreWidth = Math.max(0, zone.pauseEndSeconds - zone.pauseStartSeconds);
            const fadeOutWidth = Math.max(0, zone.fadeEndSeconds - zone.pauseEndSeconds);
            const swellLabel = `Music +${Math.round((MUSIC_SWELL_VOLUME_MULTIPLIER - 1) * 100)}% · ${MUSIC_SWELL_FADE_SECONDS}s fade in/out`;
            return (
              <React.Fragment key={`${zone.pauseStartSeconds}-${zone.pauseEndSeconds}`}>
                {fadeInWidth > 0.02 ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 bg-gradient-to-r from-transparent via-fuchsia-500/25 to-fuchsia-500/50"
                    style={{
                      left: zone.fadeStartSeconds * pxPerSecond,
                      width: fadeInWidth * pxPerSecond,
                    }}
                    title={swellLabel}
                  />
                ) : null}
                {coreWidth > 0.02 ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 border-x border-fuchsia-400/70 bg-fuchsia-500/45"
                    style={{
                      left: zone.pauseStartSeconds * pxPerSecond,
                      width: coreWidth * pxPerSecond,
                    }}
                    title={swellLabel}
                  />
                ) : null}
                {fadeOutWidth > 0.02 ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 bg-gradient-to-r from-fuchsia-500/50 via-fuchsia-500/25 to-transparent"
                    style={{
                      left: zone.pauseEndSeconds * pxPerSecond,
                      width: fadeOutWidth * pxPerSecond,
                    }}
                    title={swellLabel}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
          {musicEndsBeforeVideo ? (
            <div
              className="absolute inset-y-0 border-l border-dashed border-amber-300/25 bg-black/15"
              style={{ left: clipWidthPx, right: 0 }}
              title="No music on this part of the timeline"
            />
          ) : null}
        </>
      ) : null}

      <div className="pointer-events-none relative z-10 flex h-full items-center gap-1 bg-gradient-to-r from-black/55 via-black/35 to-transparent px-1.5 pr-8">
        {generating ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin drop-shadow-sm" />
        ) : (
          <Music className="h-3 w-3 shrink-0 drop-shadow-sm" />
        )}
        <span className="truncate drop-shadow-sm">
          {error
            ? "Music failed"
            : generating
              ? "Generating music…"
              : hasMusic
                ? audioDurationSeconds != null
                  ? fileLongerThanTimeline
                    ? `Music · ${timelineSpanSeconds.toFixed(1)}s on timeline · ${audioDurationSeconds.toFixed(0)}s file`
                    : `Music · ${timelineSpanSeconds.toFixed(1)}s · ${(musicPrompt ?? "background score").slice(0, 48)}`
                  : `Music · ${timelineSpanSeconds.toFixed(1)}s · ${(musicPrompt ?? "background score").slice(0, 48)}`
                : "No music — click to generate"}
        </span>
      </div>

      {musicShort ? (
        <div
          className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/60 bg-amber-500/90 text-amber-950 shadow-sm"
          title={shortTooltip ?? undefined}
        >
          <Repeat className="h-3 w-3" />
        </div>
      ) : null}
    </div>
  );
}

export function SceneAudioTrackBlock({
  block,
  pxPerSecond,
  selected,
  onSelect,
  onContextMenu,
}: {
  block: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const spanWidthPx = timelineClipWidthPx(block.durationSeconds, pxPerSecond);
  const hasAudio = !!block.sceneAudioUrl;
  const vol = block.sceneAudioVolume ?? 60;
  const muted = vol === 0;
  const audioDurationSeconds = useAudioWaveformDuration(
    hasAudio ? block.sceneAudioUrl : null,
  );
  const waveformWidthPx =
    hasAudio && audioDurationSeconds != null
      ? Math.min(spanWidthPx, timelineClipWidthPx(audioDurationSeconds, pxPerSecond))
      : hasAudio
        ? spanWidthPx
        : 0;
  const audioEndsBeforeSpan =
    hasAudio &&
    audioDurationSeconds != null &&
    audioDurationSeconds + 0.05 < block.durationSeconds;

  const title =
    hasAudio && audioDurationSeconds != null
      ? audioEndsBeforeSpan
        ? `Scene audio ${audioDurationSeconds.toFixed(1)}s · clip ${block.durationSeconds.toFixed(1)}s · ${vol}%`
        : `Scene audio ${audioDurationSeconds.toFixed(1)}s · ${vol}%`
      : hasAudio
        ? `Scene audio · ${vol}%`
        : "Scene audio not available (model returned silent video)";

  return (
    <div
      onClick={() => onSelect(block.id)}
      onContextMenu={onContextMenu}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        selected ? "border-accent" : "border-timeline-border/50",
        muted
          ? "bg-timeline-track/60 text-timeline-muted/50"
          : hasAudio
            ? "bg-cyan-950/40 text-cyan-200 [html[data-theme=light-all]_&]:bg-cyan-500/10 [html[data-theme=light-all]_&]:text-cyan-800"
            : "bg-timeline-track text-timeline-muted",
      )}
      style={{ width: spanWidthPx, height: 36 }}
      title={title}
    >
      {hasAudio && block.sceneAudioUrl ? (
        <>
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: waveformWidthPx }}
          >
            <AudioWaveform
              audioUrl={block.sceneAudioUrl}
              widthPx={waveformWidthPx}
              heightPx={34}
              className="bg-cyan-400/10"
              barClassName={muted ? "fill-cyan-300/35" : "fill-cyan-300/90"}
            />
          </div>
          {audioEndsBeforeSpan ? (
            <div
              className="absolute inset-y-0 border-l border-dashed border-cyan-300/25 bg-black/15"
              style={{ left: waveformWidthPx, right: 0 }}
              title="Clip continues after scene audio ends"
            />
          ) : null}
        </>
      ) : null}

      <div className="pointer-events-none relative z-10 flex h-full items-center gap-1 bg-gradient-to-r from-black/55 via-black/35 to-transparent px-1.5 pr-8">
        <Waves className="h-3 w-3 shrink-0 drop-shadow-sm" />
        <span className="truncate drop-shadow-sm">
          {hasAudio
            ? muted
              ? "Muted"
              : audioDurationSeconds != null
                ? `Scene audio · ${audioDurationSeconds.toFixed(1)}s`
                : "Scene audio"
            : "No scene audio"}
        </span>
        {hasAudio && vol !== 60 && (
          <span className="ml-auto shrink-0 font-mono text-[8px] text-cyan-300/80 drop-shadow-sm">
            {vol}%
          </span>
        )}
      </div>
    </div>
  );
}

export function TextTrackBlock({
  block,
  spanBlocks,
  pxPerSecond,
  selected,
  onSelect,
  onContextMenu,
}: {
  block: Block;
  spanBlocks?: Block[];
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const groupBlocks = spanBlocks ?? [block];
  const width = timelineClipWidthPx(
    groupBlocks.reduce((sum, item) => sum + item.durationSeconds, 0),
    pxPerSecond,
  );
  const narrativeText =
    block.narrativeText.trim() ||
    groupBlocks.find((item) => item.narrativeText.trim())?.narrativeText ||
    "";
  return (
    <div
      onClick={() => onSelect(block.id)}
      onContextMenu={onContextMenu}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border bg-timeline-track text-[10px]",
        selected ? "border-accent" : "border-timeline-border/50",
      )}
      style={{ width, height: 36 }}
    >
      <div className="line-clamp-2 px-1.5 py-0.5 text-timeline-foreground/85">
        {narrativeText}
      </div>
    </div>
  );
}
