"use client";

import * as React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Music,
  AudioLines,
  ChevronDown,
  ChevronUp,
  Link2,
  Gauge,
  Loader2,
  Layers,
  PictureInPicture2,
  PanelTop,
  Plus,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTimelineLayout } from "@/components/TimelineSplitPane";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  NARRATION_SPEED_OPTIONS,
  type NarrationSpeedId,
} from "@/lib/narration-speed";
import { PAUSE_PRESET_SECONDS } from "@/lib/script-pause";

interface Props {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historyBusy?: boolean;
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
  onFitCutsToAudio?: () => void;
  canFitCutsToAudio?: boolean;
  fitCutsToAudioBusy?: boolean;
  onFitAllCutsToAudio?: () => void;
  canFitAllCutsToAudio?: boolean;
  fitAllCutsToAudioBusy?: boolean;
  onRealignTimeline?: () => void;
  realignTimelineBusy?: boolean;
  canRealignTimeline?: boolean;
  onInsertPause?: (seconds: number) => void;
  insertPauseBusy?: boolean;
  onInsertFrame?: () => void;
  insertFrameBusy?: boolean;
  onExportFrame?: () => void;
  exportFrameBusy?: boolean;
  canExportFrame?: boolean;
  previewFloating?: boolean;
  onTogglePreviewFloating?: () => void;
}

function timecode(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const f = Math.floor((s - Math.floor(s)) * 30);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}:${f
    .toString()
    .padStart(2, "0")}`;
}

const SPEED_SHORT: Record<NarrationSpeedId, string> = {
  slow: "0.85×",
  normal: "1×",
  fast: "1.15×",
  faster: "1.25×",
};

function ToolbarIconButton({
  title,
  onClick,
  disabled,
  busy,
  active,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="timeline"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={cn(
        (disabled || busy) && "opacity-60",
        active && "text-amber-300",
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : children}
    </Button>
  );
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
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  historyBusy = false,
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
  onFitCutsToAudio,
  canFitCutsToAudio,
  fitCutsToAudioBusy,
  onFitAllCutsToAudio,
  canFitAllCutsToAudio,
  fitAllCutsToAudioBusy = false,
  onRealignTimeline,
  realignTimelineBusy,
  canRealignTimeline,
  onInsertPause,
  insertPauseBusy,
  onInsertFrame,
  insertFrameBusy,
  onExportFrame,
  exportFrameBusy,
  canExportFrame = false,
  previewFloating = false,
  onTogglePreviewFloating,
}: Props) {
  const timelineLayout = useTimelineLayout();

  return (
    <div className="flex h-9 items-center gap-0.5 border-b border-timeline-border bg-timeline-bg px-1.5 text-timeline-foreground">
      {/* Transport */}
      <ToolbarIconButton title="Previous block" onClick={onPrev}>
        <SkipBack className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title={playing ? "Pause (Space)" : "Play (Space)"}
        onClick={playing ? onPause : onPlay}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </ToolbarIconButton>
      <ToolbarIconButton title="Next block" onClick={onNext}>
        <SkipForward className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      <div
        className="ml-0.5 hidden font-mono text-2xs text-timeline-muted sm:block"
        title={`${pxPerSecond}px per second`}
      >
        <span className="text-timeline-foreground">{timecode(currentTime)}</span>
        <span className="text-timeline-muted/70"> / {timecode(totalTime)}</span>
      </div>

      <div className="mx-1 h-4 w-px bg-timeline-muted/30" />

      {/* History */}
      {onUndo ? (
        <ToolbarIconButton
          title={canUndo ? "Undo" : "Nothing to undo"}
          onClick={onUndo}
          disabled={!canUndo || historyBusy}
          busy={historyBusy}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}
      {onRedo ? (
        <ToolbarIconButton
          title={canRedo ? "Redo" : "Nothing to redo"}
          onClick={onRedo}
          disabled={!canRedo || historyBusy}
          busy={historyBusy}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}

      {(onUndo || onRedo) ? <div className="mx-1 h-4 w-px bg-timeline-muted/30" /> : null}

      {/* View / zoom */}
      <ToolbarIconButton title="Zoom out" onClick={onZoomOut}>
        <ZoomOut className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      <ToolbarIconButton title={`Zoom in (${pxPerSecond}px/s)`} onClick={onZoomIn}>
        <ZoomIn className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      <ToolbarIconButton title="Fit timeline" onClick={onFit}>
        <Maximize2 className="h-3.5 w-3.5" />
      </ToolbarIconButton>
      {timelineLayout ? (
        <ToolbarIconButton
          title={timelineLayout.collapsed ? "Expand timeline tracks" : "Collapse timeline"}
          onClick={timelineLayout.toggleCollapsed}
        >
          {timelineLayout.collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </ToolbarIconButton>
      ) : null}
      {onTogglePreviewFloating ? (
        <ToolbarIconButton
          title={
            previewFloating
              ? "Dock preview above timeline"
              : "Full timeline — preview becomes a small floating window"
          }
          onClick={onTogglePreviewFloating}
          active={previewFloating}
        >
          {previewFloating ? (
            <PanelTop className="h-3.5 w-3.5" />
          ) : (
            <PictureInPicture2 className="h-3.5 w-3.5" />
          )}
        </ToolbarIconButton>
      ) : null}

      {(onInsertFrame ||
        onInsertPause ||
        onFitCutsToAudio ||
        onFitAllCutsToAudio ||
        onRealignTimeline ||
        onExportFrame) ? (
        <div className="mx-1 h-4 w-px bg-timeline-muted/30" />
      ) : null}

      {/* Timeline editing */}
      {onInsertFrame ? (
        <ToolbarIconButton
          title="Add visual frame after selected block (upload or generate image in block panel)"
          onClick={onInsertFrame}
          disabled={insertFrameBusy}
          busy={insertFrameBusy}
        >
          <span className="relative inline-flex">
            <ImageIcon className="h-3.5 w-3.5" />
            <Plus className="absolute -bottom-1 -right-1 h-2 w-2 stroke-[3]" />
          </span>
        </ToolbarIconButton>
      ) : null}
      {onInsertPause
        ? PAUSE_PRESET_SECONDS.slice(0, 3).map((seconds) => (
            <ToolbarIconButton
              key={seconds}
              title={`Insert ${seconds}s music pause after selected block`}
              onClick={() => onInsertPause(seconds)}
              disabled={insertPauseBusy}
              busy={insertPauseBusy}
            >
              <span className="text-[9px] font-semibold tabular-nums">{seconds}</span>
            </ToolbarIconButton>
          ))
        : null}
      {onFitCutsToAudio ? (
        <ToolbarIconButton
          title="Fit visual cuts in this paragraph to narration audio"
          onClick={onFitCutsToAudio}
          disabled={!canFitCutsToAudio || fitAllCutsToAudioBusy}
          busy={fitCutsToAudioBusy}
        >
          <AudioLines className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}
      {onFitAllCutsToAudio ? (
        <ToolbarIconButton
          title="Fit all visual cuts on timeline to narration audio (every paragraph)"
          onClick={onFitAllCutsToAudio}
          disabled={!canFitAllCutsToAudio || fitCutsToAudioBusy}
          busy={fitAllCutsToAudioBusy}
        >
          <Layers className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}
      {onRealignTimeline ? (
        <ToolbarIconButton
          title="Align tracks to narration"
          onClick={onRealignTimeline}
          disabled={!canRealignTimeline}
          busy={realignTimelineBusy}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}
      {onExportFrame ? (
        <ToolbarIconButton
          title={
            canExportFrame
              ? "Export current frame as PNG (Full HD)"
              : "Move the playhead onto the timeline to export a frame"
          }
          onClick={onExportFrame}
          disabled={!canExportFrame}
          busy={exportFrameBusy}
        >
          <Camera className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      ) : null}

      {/* Batch generation — story → images → narration → video → music */}
      <div className="ml-auto flex items-center gap-0.5">
        {(onGenerateStory ||
          onGenerateAllKeyframes ||
          onGenerateAllNarration ||
          onGenerateAllMedia ||
          onOpenMusic) ? (
          <div className="mr-1 hidden h-4 w-px bg-timeline-muted/30 sm:block" />
        ) : null}
        {onGenerateStory ? (
          <ToolbarIconButton
            title="Generate story blocks"
            onClick={onGenerateStory}
            busy={storyBusy}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </ToolbarIconButton>
        ) : null}
        {onGenerateAllKeyframes ? (
          <ToolbarIconButton
            title="Generate all keyframes"
            onClick={onGenerateAllKeyframes}
            disabled={!canGenerateKeyframes}
            busy={keyframesBusy}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarIconButton>
        ) : null}
        {onGenerateAllNarration ? (
          <>
            {onNarrationSpeedChange ? (
              <Select
                value={narrationSpeedId}
                onValueChange={(v) => onNarrationSpeedChange(v as NarrationSpeedId)}
              >
                <SelectTrigger
                  className="h-7 w-11 gap-0 border-timeline-border bg-timeline-bg px-1.5 text-[9px] text-timeline-foreground"
                  title="Narration speed for batch generation"
                >
                  <Gauge className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="tabular-nums">{SPEED_SHORT[narrationSpeedId]}</span>
                </SelectTrigger>
                <SelectContent>
                  {NARRATION_SPEED_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label} ({o.speed}×)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <ToolbarIconButton
              title="Generate all narration"
              onClick={onGenerateAllNarration}
              disabled={!canGenerateNarration}
              busy={narrationBusy}
            >
              <AudioLines className="h-3.5 w-3.5" />
            </ToolbarIconButton>
          </>
        ) : null}
        {onGenerateAllMedia ? (
          <ToolbarIconButton
            title="Generate all video media"
            onClick={onGenerateAllMedia}
            disabled={!canGenerateMedia}
            busy={mediaBusy}
          >
            <Wand2 className="h-3.5 w-3.5" />
          </ToolbarIconButton>
        ) : null}
        {onOpenMusic ? (
          <ToolbarIconButton
            title="Background music"
            onClick={onOpenMusic}
            busy={musicBusy}
            active={musicReady}
          >
            <Music className="h-3.5 w-3.5" />
          </ToolbarIconButton>
        ) : null}
      </div>
    </div>
  );
}
