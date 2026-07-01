"use client";

import * as React from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScriptParagraphNarrationClip } from "@/lib/script-studio";
import {
  countOutdatedParagraphClips,
  listScriptSpeechParagraphs,
  narrationClipForSpeechIndex,
} from "@/lib/script-narration-utils";

interface Props {
  script: string;
  clips: ScriptParagraphNarrationClip[];
  activeSpeechIndex: number | null;
  playing: boolean;
  onPlayAll: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function ScriptNarrationBar({
  script,
  clips,
  activeSpeechIndex,
  playing,
  onPlayAll,
  onStop,
  onPrev,
  onNext,
  className,
}: Props) {
  const paragraphs = React.useMemo(() => listScriptSpeechParagraphs(script), [script]);
  const readyCount = paragraphs.filter((p) =>
    narrationClipForSpeechIndex(clips, p.speechIndex, p.textKey),
  ).length;
  const outdatedCount = React.useMemo(
    () => countOutdatedParagraphClips(script, clips),
    [script, clips],
  );
  const missingCount = paragraphs.length - readyCount;

  const activeLabel =
    activeSpeechIndex !== null
      ? `¶ ${activeSpeechIndex + 1}${playing ? " · playing" : ""}`
      : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-1.5 text-2xs",
        className,
      )}
    >
      <Button
        variant="outline"
        size="xs"
        className="h-7 gap-1"
        onClick={playing ? onStop : onPlayAll}
        disabled={readyCount === 0}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {playing ? "Stop" : "Play all"}
      </Button>
      <Button variant="ghost" size="xs" className="h-7 w-7 p-0" onClick={onPrev} disabled={!playing}>
        <SkipBack className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="xs" className="h-7 w-7 p-0" onClick={onNext} disabled={!playing}>
        <SkipForward className="h-3.5 w-3.5" />
      </Button>
      <span className="text-muted-foreground">
        Narration {readyCount}/{paragraphs.length} ready
        {outdatedCount > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            · {outdatedCount} outdated
          </span>
        ) : null}
        {activeLabel ? ` · ${activeLabel}` : null}
      </span>
      {!playing && missingCount > 0 && (
        <span className="text-[10px] text-muted-foreground/80">
          Re-narrate outdated ¶ with ↻ — or use Generate in the header.
        </span>
      )}
    </div>
  );
}
