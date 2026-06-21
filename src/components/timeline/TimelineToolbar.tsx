"use client";

import * as React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Music,
  AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NARRATION_SPEED_OPTIONS,
  type NarrationSpeedId,
} from "@/lib/narration-speed";

interface Props {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  currentTime: number;
  totalTime: number;
  pxPerSecond: number;

  onGenerateStory?: () => void;
  onGenerateAllKeyframes?: () => void;
  onGenerateAllNarration?: () => void;
  onGenerateAllMedia?: () => void;
  onOpenMusic?: () => void;

  storyBusy?: boolean;
  keyframesBusy?: boolean;
  narrationBusy?: boolean;
  mediaBusy?: boolean;
  musicBusy?: boolean;
  musicReady?: boolean;
  canGenerateKeyframes?: boolean;
  canGenerateNarration?: boolean;
  canGenerateMedia?: boolean;
  narrationSpeedId?: NarrationSpeedId;
  onNarrationSpeedChange?: (id: NarrationSpeedId) => void;
}

function timecode(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const f = Math.floor((s - Math.floor(s)) * 30);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}:${f
    .toString()
    .padStart(2, "0")}`;
}

export function TimelineToolbar({
  playing,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onFit,
  currentTime,
  totalTime,
  pxPerSecond,
  onGenerateStory,
  onGenerateAllKeyframes,
  onGenerateAllNarration,
  onGenerateAllMedia,
  onOpenMusic,
  storyBusy,
  keyframesBusy,
  narrationBusy,
  mediaBusy,
  musicBusy,
  musicReady,
  canGenerateKeyframes,
  canGenerateNarration,
  canGenerateMedia,
  narrationSpeedId = "normal",
  onNarrationSpeedChange,
}: Props) {
  return (
    <div className="flex h-9 items-center gap-1 border-b border-timeline-border bg-timeline-bg px-2 text-timeline-foreground">
      <Button
        variant="timeline"
        size="icon-sm"
        onClick={onPrev}
        title="Previous block"
      >
        <SkipBack className="h-3 w-3" />
      </Button>
      <Button
        variant="timeline"
        size="icon-sm"
        onClick={playing ? onPause : onPlay}
        title={playing ? "Pause (Space)" : "Play (Space)"}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Button
        variant="timeline"
        size="icon-sm"
        onClick={onNext}
        title="Next block"
      >
        <SkipForward className="h-3 w-3" />
      </Button>

      <div className="mx-1.5 h-4 w-px bg-timeline-muted/30" />

      <Button variant="timeline" size="icon-sm" onClick={onZoomOut} title="Zoom out">
        <ZoomOut className="h-3 w-3" />
      </Button>
      <span className="w-10 text-center font-mono text-2xs text-timeline-muted">
        {pxPerSecond}px/s
      </span>
      <Button variant="timeline" size="icon-sm" onClick={onZoomIn} title="Zoom in">
        <ZoomIn className="h-3 w-3" />
      </Button>
      <Button variant="timeline" size="icon-sm" onClick={onFit} title="Fit timeline">
        <Maximize2 className="h-3 w-3" />
      </Button>

      <div className="mx-2 font-mono text-2xs text-timeline-muted">
        <span className="text-timeline-foreground">{timecode(currentTime)}</span>
        <span className="text-timeline-muted/70"> / {timecode(totalTime)}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {onGenerateStory && (
          <Button
            variant="timeline"
            size="sm"
            onClick={onGenerateStory}
            disabled={storyBusy}
            className={cn(storyBusy && "opacity-60")}
          >
            <Sparkles className="h-3 w-3" />
            {storyBusy ? "Writing…" : "Story"}
          </Button>
        )}
        {onGenerateAllKeyframes && (
          <Button
            variant="timeline"
            size="sm"
            onClick={onGenerateAllKeyframes}
            disabled={!canGenerateKeyframes || keyframesBusy}
            className={cn((keyframesBusy || !canGenerateKeyframes) && "opacity-60")}
          >
            <ImageIcon className="h-3 w-3" />
            {keyframesBusy ? "Keyframes…" : "Keyframes"}
          </Button>
        )}
        {onGenerateAllNarration && (
          <div className="flex items-center gap-0.5">
            {onNarrationSpeedChange && (
              <Select
                value={narrationSpeedId}
                onValueChange={(v) => onNarrationSpeedChange(v as NarrationSpeedId)}
              >
                <SelectTrigger
                  className="h-7 w-[5.5rem] border-timeline-border bg-timeline-bg text-[10px] text-timeline-foreground"
                  title="Narration speed — applies to the next batch generation"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NARRATION_SPEED_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="timeline"
              size="sm"
              onClick={onGenerateAllNarration}
              disabled={!canGenerateNarration || narrationBusy}
              className={cn((narrationBusy || !canGenerateNarration) && "opacity-60")}
              title="Generate narration for all blocks (uses speed setting)"
            >
              <AudioLines className="h-3 w-3" />
              {narrationBusy ? "Narration…" : "Narration"}
            </Button>
          </div>
        )}
        {onGenerateAllMedia && (
          <Button
            variant="timeline"
            size="sm"
            onClick={onGenerateAllMedia}
            disabled={!canGenerateMedia || mediaBusy}
            className={cn((mediaBusy || !canGenerateMedia) && "opacity-60")}
          >
            <Wand2 className="h-3 w-3" />
            {mediaBusy ? "Media…" : "Media"}
          </Button>
        )}
        {onOpenMusic && (
          <Button
            variant="timeline"
            size="sm"
            onClick={onOpenMusic}
            className={cn(musicBusy && "opacity-60", musicReady && "text-amber-300")}
            title="Background music"
          >
            <Music className="h-3 w-3" />
            {musicBusy ? "Music…" : musicReady ? "Music" : "Music"}
          </Button>
        )}
      </div>
    </div>
  );
}
