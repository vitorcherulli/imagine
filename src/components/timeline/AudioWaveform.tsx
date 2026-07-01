"use client";

import * as React from "react";
import {
  getAudioWaveform,
  subsampleWaveformPeaks,
  type AudioWaveformData,
} from "@/lib/audio-waveform-client";
import { cn } from "@/lib/utils";

interface Props {
  audioUrl: string;
  widthPx: number;
  heightPx?: number;
  className?: string;
  barClassName?: string;
  onDurationKnown?: (durationSeconds: number) => void;
}

export function AudioWaveform({
  audioUrl,
  widthPx,
  heightPx = 22,
  className,
  barClassName = "fill-emerald-300",
  onDurationKnown,
}: Props) {
  const [waveform, setWaveform] = React.useState<AudioWaveformData | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setWaveform(null);
    setFailed(false);

    void getAudioWaveform(audioUrl).then((result) => {
      if (cancelled) return;
      if (!result) {
        setFailed(true);
        return;
      }
      setWaveform(result);
      onDurationKnown?.(result.durationSeconds);
    });

    return () => {
      cancelled = true;
    };
  }, [audioUrl, onDurationKnown]);

  const peaks = React.useMemo(() => {
    if (!waveform || widthPx <= 0) return [];
    const targetCount = Math.max(16, Math.min(512, Math.floor(widthPx / 2)));
    return subsampleWaveformPeaks(waveform.peaks, targetCount);
  }, [waveform, widthPx]);

  if (failed || widthPx <= 0) {
    return (
      <div
        className={cn("bg-emerald-400/10", className)}
        style={{ width: widthPx, height: heightPx }}
      />
    );
  }

  if (!waveform) {
    return (
      <div
        className={cn("animate-pulse bg-emerald-400/15", className)}
        style={{ width: widthPx, height: heightPx }}
      />
    );
  }

  const maxPeak = Math.max(...peaks, 0.001);
  const barWidth = widthPx / peaks.length;

  return (
    <svg
      width={widthPx}
      height={heightPx}
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      {peaks.map((peak, index) => {
        const normalized = peak / maxPeak;
        const barHeight = Math.max(1, normalized * (heightPx - 2));
        return (
          <rect
            key={index}
            x={index * barWidth}
            y={(heightPx - barHeight) / 2}
            width={Math.max(0.75, barWidth - 0.25)}
            height={barHeight}
            className={barClassName}
            rx={0.25}
          />
        );
      })}
    </svg>
  );
}

export function useAudioWaveformDuration(audioUrl: string | null | undefined): number | null {
  const [durationSeconds, setDurationSeconds] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!audioUrl) {
      setDurationSeconds(null);
      return;
    }
    let cancelled = false;
    void getAudioWaveform(audioUrl).then((result) => {
      if (!cancelled) setDurationSeconds(result?.durationSeconds ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  return durationSeconds;
}
