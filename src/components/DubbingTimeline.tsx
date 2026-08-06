"use client";

import * as React from "react";
import { TimelineRuler } from "@/components/timeline/TimelineRuler";
import { TimelinePlayhead } from "@/components/timeline/TimelinePlayhead";
import {
  clampTimelinePxPerSecond,
  nextTimelinePxPerSecondFromWheel,
  scrollLeftForZoomAtCursor,
  timelineClipWidthPx,
  TIMELINE_MAX_PX_PER_SECOND,
  TIMELINE_MIN_PX_PER_SECOND,
} from "@/lib/timeline-zoom";
import { dubLanguageInfo } from "@/lib/dub-languages";
import type { DubSegmentClip, DubTrack } from "@/lib/dubbing/track-view";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "@/components/timeline/AudioWaveform";
import { Minus, Plus } from "lucide-react";

/**
 * A dubbing-focused timeline in the same visual style as the Imagine video
 * editor. It shows the *original* speech windows (STT) side-by-side with the
 * *dubbed* takes so the user can visually confirm alignment.
 *
 * Audio waveforms: full source audio behind the Original row; per-segment TTS
 * waveform inside each dub clip (after synthesis).
 *
 * Multi-language ready: pass an array of `DubTrack` and each becomes a row.
 */

export type { DubTrack, DubSegmentClip } from "@/lib/dubbing/track-view";

interface Props {
  totalSeconds: number;
  currentTime: number;
  onSeek: (t: number) => void;
  tracks: DubTrack[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  /** Full source audio — waveform drawn behind the Original row. */
  sourceAudioUrl?: string | null;
  activeTrackId?: string | null;
  onSelectTrack?: (trackId: string) => void;
  onAddLanguage?: () => void;
  addingLanguage?: boolean;
}

const LABEL_WIDTH = 96;
const ROW_HEIGHT = 44;
const CLIP_HEIGHT = 32;
const DEFAULT_PX_PER_SECOND = 40;

export function DubbingTimeline({
  totalSeconds,
  currentTime,
  onSeek,
  tracks,
  selectedSegmentId,
  onSelectSegment,
  sourceAudioUrl,
  activeTrackId,
  onSelectTrack,
  onAddLanguage,
  addingLanguage,
}: Props) {
  const [pxPerSecond, setPxPerSecond] = React.useState(DEFAULT_PX_PER_SECOND);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const totalRowHeight = tracks.length * ROW_HEIGHT;
  const totalPixelWidth = Math.max(
    800,
    Math.ceil(Math.max(1, totalSeconds) * pxPerSecond),
  );

  const handleWheel = React.useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
      e.preventDefault();
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();
      const mouseXInViewport = e.clientX - rect.left;
      const timeAtMouseSeconds =
        (scrollEl.scrollLeft + mouseXInViewport) / pxPerSecond;
      const next = nextTimelinePxPerSecondFromWheel(pxPerSecond, e.deltaY);
      if (next === pxPerSecond) return;
      setPxPerSecond(next);
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollLeft = scrollLeftForZoomAtCursor({
          timeAtMouseSeconds,
          mouseXInViewport,
          pxPerSecond: next,
        });
      });
    },
    [pxPerSecond],
  );

  // Auto-scroll to keep the playhead comfortably in view during playback.
  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const playheadX = currentTime * pxPerSecond;
    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    if (playheadX < viewLeft + 60 || playheadX > viewRight - 120) {
      scrollEl.scrollTo({
        left: Math.max(0, playheadX - scrollEl.clientWidth / 3),
        behavior: "smooth",
      });
    }
  }, [currentTime, pxPerSecond]);

  return (
    <div className="rounded border border-timeline-border bg-timeline-track text-timeline-foreground">
      <div className="flex items-center justify-between border-b border-timeline-border/60 px-2 py-1 text-2xs text-timeline-muted">
        <span className="uppercase tracking-wide">Timeline</span>
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 hover:bg-timeline-muted/20 disabled:opacity-40"
            onClick={() =>
              setPxPerSecond((p) =>
                clampTimelinePxPerSecond(Math.max(TIMELINE_MIN_PX_PER_SECOND, p - 8)),
              )
            }
            disabled={pxPerSecond <= TIMELINE_MIN_PX_PER_SECOND}
            title="Zoom out"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="font-mono">{pxPerSecond}px/s</span>
          <button
            className="rounded p-1 hover:bg-timeline-muted/20 disabled:opacity-40"
            onClick={() =>
              setPxPerSecond((p) =>
                clampTimelinePxPerSecond(Math.min(TIMELINE_MAX_PX_PER_SECOND, p + 8)),
              )
            }
            disabled={pxPerSecond >= TIMELINE_MAX_PX_PER_SECOND}
            title="Zoom in"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Row labels */}
        <div
          className="flex shrink-0 flex-col border-r border-timeline-border/60 bg-timeline-track"
          style={{ width: LABEL_WIDTH }}
        >
          <div className="h-6 border-b border-timeline-border" />
          {tracks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => t.kind === "dub" && onSelectTrack?.(t.id)}
              className={cn(
                "flex w-full items-center gap-1.5 border-b border-timeline-border/40 px-2 text-left text-xs transition",
                t.kind === "dub" && "hover:bg-timeline-muted/15",
                t.kind === "dub" &&
                  activeTrackId === t.id &&
                  "bg-sky-500/15 font-semibold text-sky-200",
              )}
              style={{ height: ROW_HEIGHT }}
              title={
                t.kind === "original"
                  ? "Original speech (from STT)"
                  : `Edit & preview ${t.label}`
              }
              disabled={t.kind === "original"}
            >
              <span>{t.flag}</span>
              <span className="min-w-0 truncate font-medium">{t.label}</span>
            </button>
          ))}
          {onAddLanguage ? (
            <button
              type="button"
              onClick={onAddLanguage}
              disabled={addingLanguage}
              className="flex w-full items-center justify-center gap-1 border-b border-timeline-border/40 px-2 text-2xs text-sky-300 hover:bg-timeline-muted/15 disabled:opacity-50"
              style={{ height: ROW_HEIGHT }}
            >
              {addingLanguage ? "…" : "+ Language"}
            </button>
          ) : null}
        </div>

        {/* Scrollable timeline area */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={handleWheel}
        >
          <div style={{ width: totalPixelWidth, position: "relative" }}>
            <TimelineRuler
              totalSeconds={Math.max(1, totalSeconds)}
              pxPerSecond={pxPerSecond}
              onScrub={onSeek}
              scrollRef={scrollRef}
            />

            <div style={{ position: "relative", height: totalRowHeight }}>
              {sourceAudioUrl && tracks.some((t) => t.kind === "original") ? (
                <SourceAudioWaveform
                  audioUrl={sourceAudioUrl}
                  widthPx={totalPixelWidth}
                  heightPx={ROW_HEIGHT}
                  top={tracks.findIndex((t) => t.kind === "original") * ROW_HEIGHT}
                />
              ) : null}
              {tracks.map((track, rowIdx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  rowIndex={rowIdx}
                  pxPerSecond={pxPerSecond}
                  selectedSegmentId={selectedSegmentId}
                  onSelectSegment={onSelectSegment}
                  currentTime={currentTime}
                />
              ))}
            </div>

            <TimelinePlayhead
              currentTime={currentTime}
              pxPerSecond={pxPerSecond}
              height={totalRowHeight + 24}
              onScrub={onSeek}
              totalSeconds={Math.max(1, totalSeconds)}
              scrollRef={scrollRef}
              rulerHeight={24}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceAudioWaveform({
  audioUrl,
  widthPx,
  heightPx,
  top,
}: {
  audioUrl: string;
  widthPx: number;
  heightPx: number;
  top: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-0 overflow-hidden opacity-35"
      style={{ top, height: heightPx }}
    >
      <AudioWaveform
        audioUrl={audioUrl}
        widthPx={widthPx}
        heightPx={heightPx - 4}
        barClassName="fill-slate-300/90"
        className="mx-auto"
      />
    </div>
  );
}

function TrackRow({
  track,
  rowIndex,
  pxPerSecond,
  selectedSegmentId,
  onSelectSegment,
  currentTime,
}: {
  track: DubTrack;
  rowIndex: number;
  pxPerSecond: number;
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  currentTime: number;
}) {
  const top = rowIndex * ROW_HEIGHT;
  return (
    <>
      <div
        className={cn(
          "absolute inset-x-0 border-b border-timeline-border/40",
          rowIndex % 2 === 0 ? "bg-timeline-track" : "bg-timeline-ruler",
        )}
        style={{ top, height: ROW_HEIGHT }}
      />
      {track.segments.map((seg) => {
        const width = timelineClipWidthPx(
          Math.max(0.1, seg.endSeconds - seg.startSeconds),
          pxPerSecond,
        );
        const left = seg.startSeconds * pxPerSecond;
        const active =
          currentTime >= seg.startSeconds &&
          currentTime <= seg.endSeconds + 0.05;
        const selected = seg.id === selectedSegmentId;
        return (
          <DubClip
            key={`${track.id}_${seg.id}`}
            segment={seg}
            top={top + (ROW_HEIGHT - CLIP_HEIGHT) / 2}
            left={left}
            width={width}
            kind={track.kind}
            active={active}
            selected={selected}
            onClick={() => onSelectSegment(seg.id)}
          />
        );
      })}
    </>
  );
}

function clipColorForSync(seg: DubSegmentClip): string {
  if (seg.status === "error") return "bg-destructive/70 border-destructive";
  const overflow = /still slightly over/i.test(seg.errorMessage ?? "");
  if (overflow) return "bg-red-500/70 border-red-400";
  if (!seg.ttsAudioUrl) return "bg-timeline-muted/40 border-timeline-muted/60";
  const dist = Math.abs((seg.stretchRatio ?? 1) - 1);
  if (dist <= 0.08) return "bg-emerald-500/60 border-emerald-400";
  if (dist <= 0.2) return "bg-yellow-500/60 border-yellow-400";
  return "bg-orange-500/60 border-orange-400";
}

function DubClip({
  segment,
  top,
  left,
  width,
  kind,
  active,
  selected,
  onClick,
}: {
  segment: DubSegmentClip;
  top: number;
  left: number;
  width: number;
  kind: "original" | "dub";
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const text =
    kind === "original" ? segment.sourceText : segment.translatedText;
  const displayText = text.trim() || (kind === "original" ? "…" : "—");
  const stretch = segment.stretchRatio ?? 1;
  const clipColor =
    kind === "original"
      ? "bg-slate-500/40 border-slate-400/70"
      : clipColorForSync(segment);
  const hint =
    kind === "original"
      ? `${segment.startSeconds.toFixed(2)}s → ${segment.endSeconds.toFixed(2)}s`
      : `${segment.startSeconds.toFixed(2)}s → ${segment.endSeconds.toFixed(2)}s · stretch ${stretch.toFixed(2)}x${segment.errorMessage ? ` · ${segment.errorMessage}` : ""}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "absolute z-10 overflow-hidden rounded border text-left text-2xs leading-tight text-white/95 shadow-sm transition",
        clipColor,
        active && "ring-2 ring-sky-300/80",
        selected && "outline outline-2 outline-sky-400",
        "hover:brightness-110",
      )}
      style={{
        top,
        left,
        width: Math.max(4, width),
        height: CLIP_HEIGHT,
      }}
    >
      {kind === "dub" && segment.ttsAudioUrl ? (
        <div className="absolute inset-0 overflow-hidden">
          <AudioWaveform
            audioUrl={segment.ttsAudioUrl}
            widthPx={Math.max(4, width)}
            heightPx={CLIP_HEIGHT}
            barClassName={
              selected
                ? "fill-white/70"
                : active
                  ? "fill-white/60"
                  : "fill-white/45"
            }
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/25 to-black/40" />
        </div>
      ) : null}
      <span className="relative z-10 flex h-full items-center truncate px-1.5">
        {displayText}
      </span>
    </button>
  );
}
