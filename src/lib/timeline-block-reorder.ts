import type { StoryBlock } from "@/lib/db/schema";
import { sortBlocksByPosition } from "@/lib/timeline-free-edit";
import {
  applyNarrationOrderWithGroups,
  contiguousNarrationGroupIndices,
} from "@/lib/narration-group-reorder";

export function reorderBlocksArray(
  blocks: StoryBlock[],
  fromIndex: number,
  toIndex: number,
): StoryBlock[] {
  const sorted = sortBlocksByPosition(blocks);
  if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) {
    return sorted;
  }
  const next = [...sorted];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  const reordered = next.map((block, index) => ({ ...block, position: index }));
  return applyNarrationOrderWithGroups(reordered).blocks;
}

function moveContiguousGroup(
  blocks: StoryBlock[],
  groupIndices: number[],
  direction: -1 | 1,
): StoryBlock[] | null {
  const sorted = sortBlocksByPosition(blocks);
  const start = groupIndices[0]!;
  const len = groupIndices.length;

  if (direction < 0) {
    if (start <= 0) return null;
    const next = [...sorted];
    const slice = next.splice(start, len);
    next.splice(start - 1, 0, ...slice);
    const reordered = next.map((block, index) => ({ ...block, position: index }));
    return applyNarrationOrderWithGroups(reordered).blocks;
  }

  if (start + len >= sorted.length) return null;
  const next = [...sorted];
  const slice = next.splice(start, len);
  next.splice(start + 1, 0, ...slice);
  const reordered = next.map((block, index) => ({ ...block, position: index }));
  return applyNarrationOrderWithGroups(reordered).blocks;
}

export function moveBlockEarlier(
  blocks: StoryBlock[],
  blockId: string,
): StoryBlock[] | null {
  const sorted = sortBlocksByPosition(blocks);
  const groupIndices = contiguousNarrationGroupIndices(blocks, blockId);
  if (!groupIndices) return null;

  if (groupIndices.length > 1) {
    return moveContiguousGroup(blocks, groupIndices, -1);
  }

  const index = sorted.findIndex((block) => block.id === blockId);
  if (index <= 0) return null;
  return reorderBlocksArray(blocks, index, index - 1);
}

export function moveBlockLater(blocks: StoryBlock[], blockId: string): StoryBlock[] | null {
  const sorted = sortBlocksByPosition(blocks);
  const groupIndices = contiguousNarrationGroupIndices(blocks, blockId);
  if (!groupIndices) return null;

  if (groupIndices.length > 1) {
    return moveContiguousGroup(blocks, groupIndices, 1);
  }

  const index = sorted.findIndex((block) => block.id === blockId);
  if (index < 0 || index >= sorted.length - 1) return null;
  return reorderBlocksArray(blocks, index, index + 1);
}

export function canMoveBlockEarlier(blocks: StoryBlock[], blockId: string): boolean {
  const sorted = sortBlocksByPosition(blocks);
  const index = sorted.findIndex((block) => block.id === blockId);
  return index > 0;
}

export function canMoveBlockLater(blocks: StoryBlock[], blockId: string): boolean {
  const sorted = sortBlocksByPosition(blocks);
  const index = sorted.findIndex((block) => block.id === blockId);
  return index >= 0 && index < sorted.length - 1;
}
