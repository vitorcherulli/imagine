"use client";

import * as React from "react";
import type { StoryBlock } from "@/lib/db/schema";
import { stableFullVideoUrl } from "@/lib/preview-video-cache";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "@/lib/script-pause";
import {
  type BlockVideoDurationAlert,
  videoNeedsLoopForBlock,
} from "@/lib/video-duration-mismatch";

function probeVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const timeout = window.setTimeout(finish, 15_000);

    function finish(result: number | null = null) {
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      resolve(result);
    }

    video.onloadedmetadata = () => {
      const duration = video.duration;
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function blocksProbeKey(blocks: StoryBlock[]): string {
  return blocks
    .map((b) => {
      const visual = isStoryBlockPause(b)
        ? resolveNeighborVisualBlock(blocks, b)
        : b;
      return `${b.id}:${visual?.videoUrl ?? ""}:${b.durationSeconds}`;
    })
    .join("|");
}

export function useBlockVideoDurationAlerts(blocks: StoryBlock[]) {
  const [alerts, setAlerts] = React.useState<Map<string, BlockVideoDurationAlert>>(new Map());
  const probeKey = React.useMemo(() => blocksProbeKey(blocks), [blocks]);

  React.useEffect(() => {
    let cancelled = false;
    const sorted = [...blocks];

    async function run() {
      const next = new Map<string, BlockVideoDurationAlert>();
      const seenVideoUrl = new Map<string, number>();

      await Promise.all(
        sorted.map(async (block) => {
          const visual = isStoryBlockPause(block)
            ? resolveNeighborVisualBlock(sorted, block)
            : block;
          const videoUrl = visual?.videoUrl?.trim();
          if (!videoUrl) return;

          const stableUrl = stableFullVideoUrl(videoUrl);
          let sourceDurationSec = seenVideoUrl.get(stableUrl);
          if (sourceDurationSec === undefined) {
            const probed = await probeVideoDuration(stableUrl);
            if (probed === null) return;
            sourceDurationSec = probed;
            seenVideoUrl.set(stableUrl, probed);
          }

          const blockDurationSec = block.durationSeconds;
          if (videoNeedsLoopForBlock(sourceDurationSec, blockDurationSec)) {
            next.set(block.id, {
              blockId: block.id,
              sourceDurationSec,
              blockDurationSec,
            });
          }
        }),
      );

      if (!cancelled) setAlerts(next);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [probeKey, blocks]);

  return alerts;
}
