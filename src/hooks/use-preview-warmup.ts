"use client";

import * as React from "react";
import type { Block } from "@/components/timeline/types";
import { findActiveVideoBlockAtTime } from "@/lib/timeline-free-edit";
import { requestBlockPreviewGeneration } from "@/lib/preview-video-cache";

const MAX_CONCURRENT = 1;
const LOOKAHEAD_BLOCKS = 2;

/** Stable key per block video — changes only when the source file is regenerated. */
function warmupKey(block: Block): string | null {
  const url = block.videoUrl?.trim();
  if (!url) return null;
  return `${block.id}:${url}`;
}

/** Signature of all video URLs — ignores status-only block polls during generation. */
function videoBlocksSignature(blocks: Block[]): string {
  return blocks
    .map((b) => warmupKey(b))
    .filter((key): key is string => Boolean(key))
    .join("|");
}

/**
 * @deprecated Preview proxies are no longer generated or played. This hook is a
 * no-op in practice because it is gated by `previewSettings.warmupEnabled`,
 * which `resolvePreviewSettings` now forces to `false`. Kept for API stability.
 *
 * Proactively generates low-res preview proxies in the background.
 * Only warms clips near the playhead — never the entire timeline at once.
 */
export function usePreviewWarmup(
  blocks: Block[],
  currentTime: number,
  enabled = true,
): void {
  const doneRef = React.useRef<Set<string>>(new Set());
  const inFlightRef = React.useRef<Set<string>>(new Set());
  const queueRef = React.useRef<string[]>([]);
  const runningCountRef = React.useRef(0);
  const blocksRef = React.useRef(blocks);
  const lastFocusBlockIdRef = React.useRef<string | null>(null);
  blocksRef.current = blocks;

  const videoSignature = React.useMemo(() => videoBlocksSignature(blocks), [blocks]);

  // Drop warmup keys for blocks whose video was removed or regenerated.
  React.useEffect(() => {
    const valid = new Set(
      blocks.map((b) => warmupKey(b)).filter((key): key is string => Boolean(key)),
    );
    for (const key of doneRef.current) {
      if (!valid.has(key)) doneRef.current.delete(key);
    }
    for (const key of inFlightRef.current) {
      if (!valid.has(key)) inFlightRef.current.delete(key);
    }
  }, [videoSignature, blocks]);

  const pump = React.useCallback(() => {
    while (runningCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const warmupId = queueRef.current.shift();
      if (!warmupId) break;
      if (doneRef.current.has(warmupId) || inFlightRef.current.has(warmupId)) continue;

      const blockId = warmupId.split(":")[0];
      const block = blocksRef.current.find((b) => b.id === blockId);
      if (!block?.videoUrl?.trim()) continue;

      inFlightRef.current.add(warmupId);
      runningCountRef.current += 1;

      void requestBlockPreviewGeneration(blockId)
        .then(() => {
          doneRef.current.add(warmupId);
        })
        .catch(() => {})
        .finally(() => {
          inFlightRef.current.delete(warmupId);
          runningCountRef.current -= 1;
          pump();
        });
    }
  }, []);

  const enqueue = React.useCallback(
    (warmupIds: string[], { front = false } = {}) => {
      const novel = warmupIds.filter(
        (key) =>
          !doneRef.current.has(key) &&
          !inFlightRef.current.has(key) &&
          !queueRef.current.includes(key),
      );
      if (novel.length === 0) return;
      queueRef.current = front
        ? [...novel, ...queueRef.current]
        : [...queueRef.current, ...novel];
      pump();
    },
    [pump],
  );

  const priorityAroundBlock = React.useCallback((blockId: string | null | undefined) => {
    if (!blockId) return [];
    const list = blocksRef.current;
    const startIdx = list.findIndex((b) => b.id === blockId);
    if (startIdx < 0) return [];
    const keys: string[] = [];
    for (let i = startIdx; i < Math.min(list.length, startIdx + LOOKAHEAD_BLOCKS); i++) {
      const key = warmupKey(list[i]!);
      if (key) keys.push(key);
    }
    return keys;
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    const hit = findActiveVideoBlockAtTime(blocks, currentTime);
    const priority = priorityAroundBlock(hit?.block.id);
    lastFocusBlockIdRef.current = hit?.block.id ?? null;
    queueRef.current = [];
    if (priority.length > 0) enqueue(priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSignature, enabled, enqueue, priorityAroundBlock]);

  React.useEffect(() => {
    if (!enabled) return;
    const hit = findActiveVideoBlockAtTime(blocks, currentTime);
    const focusId = hit?.block.id ?? null;
    if (!focusId || focusId === lastFocusBlockIdRef.current) return;
    lastFocusBlockIdRef.current = focusId;
    enqueue(priorityAroundBlock(focusId), { front: true });
  }, [blocks, currentTime, enabled, enqueue, priorityAroundBlock]);
}
