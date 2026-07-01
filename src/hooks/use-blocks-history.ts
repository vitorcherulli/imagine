"use client";

import * as React from "react";
import type { StoryBlock } from "@/lib/db/schema";
import {
  TIMELINE_HISTORY_LIMIT,
  cloneBlocksSnapshot,
  serializeBlocksForSync,
} from "@/lib/blocks-history";

async function syncBlocksToServer(
  projectId: string,
  blocks: StoryBlock[],
): Promise<StoryBlock[]> {
  const res = await fetch(`/api/projects/${projectId}/blocks/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks: serializeBlocksForSync(blocks) }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    blocks?: StoryBlock[];
  };
  if (!res.ok) throw new Error(data.error ?? "Could not sync timeline history");
  return Array.isArray(data.blocks) ? data.blocks : blocks;
}

export function useBlocksHistory(projectId: string, initialBlocks: StoryBlock[]) {
  const [blocks, setBlocks] = React.useState(initialBlocks);
  const [past, setPast] = React.useState<StoryBlock[][]>([]);
  const [future, setFuture] = React.useState<StoryBlock[][]>([]);
  const [historySyncing, setHistorySyncing] = React.useState(false);
  const blocksRef = React.useRef(blocks);
  blocksRef.current = blocks;

  const rememberCurrent = React.useCallback(() => {
    const snapshot = cloneBlocksSnapshot(blocksRef.current);
    setPast((prev) => [...prev, snapshot].slice(-TIMELINE_HISTORY_LIMIT));
    setFuture([]);
  }, []);

  const setBlocksSilent = React.useCallback(
    (next: StoryBlock[] | ((prev: StoryBlock[]) => StoryBlock[])) => {
      setBlocks((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        blocksRef.current = resolved;
        return resolved;
      });
    },
    [],
  );

  const setBlocksWithHistory = React.useCallback(
    (next: StoryBlock[] | ((prev: StoryBlock[]) => StoryBlock[])) => {
      rememberCurrent();
      setBlocksSilent(next);
    },
    [rememberCurrent, setBlocksSilent],
  );

  const resetHistory = React.useCallback((nextBlocks: StoryBlock[]) => {
    setPast([]);
    setFuture([]);
    setBlocksSilent(nextBlocks);
  }, [setBlocksSilent]);

  const applyHistoryStep = React.useCallback(
    async (target: StoryBlock[], direction: "undo" | "redo"): Promise<StoryBlock[]> => {
      setHistorySyncing(true);
      try {
        const synced = await syncBlocksToServer(projectId, target);
        setBlocksSilent(synced);
        return synced;
      } catch (error) {
        if (direction === "undo") {
          setPast((prev) => [...prev, target].slice(-TIMELINE_HISTORY_LIMIT));
          setFuture((prev) => prev.slice(1));
        } else {
          setFuture((prev) => [target, ...prev].slice(0, TIMELINE_HISTORY_LIMIT));
          setPast((prev) => prev.slice(0, -1));
        }
        throw error;
      } finally {
        setHistorySyncing(false);
      }
    },
    [projectId, setBlocksSilent],
  );

  const undo = React.useCallback(async (): Promise<StoryBlock[] | null> => {
    if (historySyncing || past.length === 0) return null;
    const previous = past[past.length - 1]!;
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [cloneBlocksSnapshot(blocksRef.current), ...prev].slice(0, TIMELINE_HISTORY_LIMIT));
    return applyHistoryStep(previous, "undo");
  }, [applyHistoryStep, historySyncing, past]);

  const redo = React.useCallback(async (): Promise<StoryBlock[] | null> => {
    if (historySyncing || future.length === 0) return null;
    const next = future[0]!;
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, cloneBlocksSnapshot(blocksRef.current)].slice(-TIMELINE_HISTORY_LIMIT));
    return applyHistoryStep(next, "redo");
  }, [applyHistoryStep, future, historySyncing]);

  return {
    blocks,
    setBlocksWithHistory,
    setBlocksSilent,
    resetHistory,
    rememberCurrent,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historySyncing,
    undoCount: past.length,
    redoCount: future.length,
  };
}
