"use client";

import * as React from "react";
import type { VideoClipAudioMode } from "@/lib/project-api-models";
import { cn } from "@/lib/utils";

interface Estimate {
  label: string;
  note: string;
  estimateUsd: number | null;
  durationSeconds: number;
}

export function VideoModelCostHint({
  videoModel,
  videoClipAudio,
  durationSeconds = 8,
  className,
}: {
  videoModel: string;
  videoClipAudio: VideoClipAudioMode;
  durationSeconds?: number;
  className?: string;
}) {
  const [estimate, setEstimate] = React.useState<Estimate | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      model: videoModel,
      duration: String(durationSeconds),
      audio: videoClipAudio,
      resolution: "720p",
      firstFrame: "1",
    });

    void fetch(`/api/openrouter/video-estimate?${params}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Estimate;
      })
      .then((data) => {
        if (!cancelled && data) setEstimate(data);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      });

    return () => {
      cancelled = true;
    };
  }, [videoModel, videoClipAudio, durationSeconds]);

  if (!estimate) return null;

  return (
    <p className={cn("text-[10px] tabular-nums text-muted-foreground", className)} title={estimate.note}>
      <span className="font-medium text-foreground/80">{estimate.label}</span>
      <span className="text-muted-foreground"> · {estimate.note}</span>
    </p>
  );
}

export function formatBlockOpenRouterCost(cost: number | null | undefined): string | null {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return null;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(3)}`;
}
