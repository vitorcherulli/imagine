import type { StoryBlock } from "@/lib/db/schema";
import { isVisualCutOnly } from "@/lib/cut-pace";
import { isStoryBlockPause } from "@/lib/script-pause";
import { speechIndexFromNarrationGroupId } from "@/lib/script-narration-utils";
import { sortBlocksByPosition } from "@/lib/timeline-free-edit";

export interface NarrationGroupRepairResult {
  blocks: StoryBlock[];
  /** Visual cuts detached because the move split a narration group. */
  detachedCount: number;
}

export interface RejoinNarrationResult {
  blocks: StoryBlock[];
  joinedCount: number;
}

export type NarrationJoinPlacement = "before" | "after";

export interface JoinableNarrationTarget {
  groupId: string;
  placement: NarrationJoinPlacement;
  label: string;
  /** Block already touches this group — join without moving. */
  adjacent: boolean;
}

function isSpeechNarrationGroupId(groupId: string | null | undefined): boolean {
  const id = groupId?.trim();
  return Boolean(id && /^n\d+$/.test(id));
}

/** Remove a visual cut from its narration group — keeps media, drops shared narration. */
export function detachVisualCutFromNarrationGroup(block: StoryBlock): StoryBlock {
  return {
    ...block,
    narrationGroupId: null,
    narrativeText: "",
    audioUrl: null,
    audioVolume: block.audioVolume ?? 100,
  };
}

function attachFieldsToNarrationGroup(block: StoryBlock, groupId: string): StoryBlock {
  return {
    ...block,
    narrationGroupId: groupId,
    narrativeText: "",
    audioUrl: null,
  };
}

export function canJoinAsVisualCut(block: StoryBlock): boolean {
  if (isStoryBlockPause(block)) return false;
  if (block.narrativeText.trim()) return false;
  if (isSpeechNarrationGroupId(block.narrationGroupId)) return false;
  return true;
}

function contiguousRuns(indices: number[]): number[][] {
  if (indices.length === 0) return [];
  const runs: number[][] = [];
  let run = [indices[0]!];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1]! + 1) {
      run.push(indices[i]!);
    } else {
      runs.push(run);
      run = [indices[i]!];
    }
  }
  runs.push(run);
  return runs;
}

function findContiguousRunsForGroupId(
  sorted: StoryBlock[],
  groupId: string,
): number[][] {
  const indices = sorted
    .map((block, index) => (block.narrationGroupId?.trim() === groupId ? index : -1))
    .filter((index) => index >= 0);
  return contiguousRuns(indices);
}

function narrationRunEndingAt(
  sorted: StoryBlock[],
  index: number,
): { groupId: string } | null {
  const block = sorted[index];
  if (!block || !isSpeechNarrationGroupId(block.narrationGroupId)) return null;
  const groupId = block.narrationGroupId!.trim();
  const next = sorted[index + 1];
  if (next?.narrationGroupId?.trim() === groupId) return null;
  return { groupId };
}

function narrationRunStartingAt(
  sorted: StoryBlock[],
  index: number,
): { groupId: string } | null {
  const block = sorted[index];
  if (!block || !isSpeechNarrationGroupId(block.narrationGroupId)) return null;
  const groupId = block.narrationGroupId!.trim();
  const prev = sorted[index - 1];
  if (prev?.narrationGroupId?.trim() === groupId) return null;
  return { groupId };
}

export function describeSpeechNarrationGroup(
  blocks: StoryBlock[],
  groupId: string,
  runIndices?: number[],
): string {
  const sorted = sortBlocksByPosition(blocks);
  const indices =
    runIndices ?? findContiguousRunsForGroupId(sorted, groupId)[0] ?? [];
  if (indices.length === 0) return groupId;

  const groupBlocks = indices.map((index) => sorted[index]!);
  const lead = groupBlocks.find((block) => block.narrativeText.trim()) ?? groupBlocks[0];
  const speechIndex = speechIndexFromNarrationGroupId(groupId);
  const paragraph =
    speechIndex != null ? `Paragraph ${speechIndex + 1}` : "Narration";
  const duration = groupBlocks.reduce((sum, block) => sum + block.durationSeconds, 0);
  const cuts = groupBlocks.length;
  const preview = lead?.narrativeText.trim().slice(0, 36);
  const previewSuffix = preview ? ` — “${preview}${lead!.narrativeText.length > 36 ? "…" : ""}”` : "";
  return `${paragraph} · ${duration.toFixed(1)}s · ${cuts} cut${cuts === 1 ? "" : "s"}${previewSuffix}`;
}

/** Targets for attaching a detached visual cut to an existing narration group. */
export function listJoinableNarrationTargets(
  blocks: StoryBlock[],
  blockId: string,
): JoinableNarrationTarget[] {
  const sorted = sortBlocksByPosition(blocks);
  const index = sorted.findIndex((block) => block.id === blockId);
  if (index < 0 || !canJoinAsVisualCut(sorted[index]!)) return [];

  const targets: JoinableNarrationTarget[] = [];
  const seen = new Set<string>();

  const left = index > 0 ? narrationRunEndingAt(sorted, index - 1) : null;
  if (left) {
    const key = `${left.groupId}:after`;
    seen.add(key);
    targets.push({
      groupId: left.groupId,
      placement: "after",
      adjacent: true,
      label: describeSpeechNarrationGroup(blocks, left.groupId),
    });
  }

  const right =
    index < sorted.length - 1 ? narrationRunStartingAt(sorted, index + 1) : null;
  if (right) {
    const key = `${right.groupId}:before`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({
        groupId: right.groupId,
        placement: "before",
        adjacent: true,
        label: describeSpeechNarrationGroup(blocks, right.groupId),
      });
    }
  }

  for (const run of listContiguousSpeechNarrationRuns(sorted)) {
    for (const placement of ["after", "before"] as const) {
      const key = `${run.groupId}:${placement}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        groupId: run.groupId,
        placement,
        adjacent: false,
        label: describeSpeechNarrationGroup(blocks, run.groupId, run.indices),
      });
    }
  }

  return targets;
}

function listContiguousSpeechNarrationRuns(
  sorted: StoryBlock[],
): Array<{ groupId: string; indices: number[] }> {
  const runs: Array<{ groupId: string; indices: number[] }> = [];
  let index = 0;
  while (index < sorted.length) {
    const groupId = sorted[index]!.narrationGroupId?.trim();
    if (!isSpeechNarrationGroupId(groupId)) {
      index += 1;
      continue;
    }
    const indices: number[] = [];
    while (
      index < sorted.length &&
      sorted[index]!.narrationGroupId?.trim() === groupId
    ) {
      indices.push(index);
      index += 1;
    }
    runs.push({ groupId: groupId!, indices });
  }
  return runs;
}

/**
 * Attach a detached visual cut to a narration group (moves the block next to the group if needed).
 */
export function attachVisualCutToNarrationGroup(
  blocks: StoryBlock[],
  blockId: string,
  targetGroupId: string,
  placement: NarrationJoinPlacement,
): StoryBlock[] | null {
  const sorted = sortBlocksByPosition(blocks);
  const block = sorted.find((item) => item.id === blockId);
  if (!block || !canJoinAsVisualCut(block)) return null;

  const without = sorted.filter((item) => item.id !== blockId);
  const run = findContiguousRunsForGroupId(without, targetGroupId)[0];
  if (!run) return null;

  const insertIndex =
    placement === "after" ? run[run.length - 1]! + 1 : run[0]!;
  const attached = attachFieldsToNarrationGroup(block, targetGroupId);
  without.splice(insertIndex, 0, attached);
  return without.map((item, position) => ({ ...item, position }));
}

/**
 * When a detached visual cut is dragged back beside a narration group, re-join automatically.
 */
export function rejoinAdjacentVisualCuts(blocks: StoryBlock[]): RejoinNarrationResult {
  const sorted = sortBlocksByPosition(blocks);
  const result = sorted.map((block) => ({ ...block }));
  let joinedCount = 0;

  for (let index = 0; index < result.length; index++) {
    const block = result[index]!;
    if (!canJoinAsVisualCut(block)) continue;

    const left = index > 0 ? narrationRunEndingAt(result, index - 1) : null;
    const right =
      index < result.length - 1 ? narrationRunStartingAt(result, index + 1) : null;

    const target = left ?? right;
    if (!target) continue;

    result[index] = attachFieldsToNarrationGroup(block, target.groupId);
    joinedCount += 1;
  }

  return { blocks: result, joinedCount };
}

export function canLeaveNarrationGroup(block: StoryBlock): boolean {
  return isVisualCutOnly(block) && isSpeechNarrationGroupId(block.narrationGroupId);
}

/** Rejoin adjacent cuts, then detach orphans after a reorder. */
export function applyNarrationOrderWithGroups(blocks: StoryBlock[]): {
  blocks: StoryBlock[];
  joinedCount: number;
  detachedCount: number;
} {
  const positioned = blocks.map((block, index) => ({ ...block, position: index }));
  const { blocks: rejoined, joinedCount } = rejoinAdjacentVisualCuts(positioned);
  const { blocks: repaired, detachedCount } = repairNarrationGroupsAfterReorder(rejoined);
  return { blocks: repaired, joinedCount, detachedCount };
}

function pickRunToKeep(blocks: StoryBlock[], runs: number[][]): number[] {
  const withLead = runs.find((run) =>
    run.some((index) => blocks[index]!.narrativeText.trim().length > 0),
  );
  if (withLead) return withLead;
  return runs.reduce((longest, run) => (run.length >= longest.length ? run : longest));
}

/**
 * Narration groups only work when their blocks stay consecutive on the timeline.
 * After a drag-reorder, orphan segments are detached so narration is not "cut" incorrectly.
 */
export function repairNarrationGroupsAfterReorder(
  blocks: StoryBlock[],
): NarrationGroupRepairResult {
  const sorted = sortBlocksByPosition(blocks);
  const result = sorted.map((block) => ({ ...block }));
  let detachedCount = 0;

  const groupIds = new Set<string>();
  for (const block of result) {
    const id = block.narrationGroupId?.trim();
    if (isSpeechNarrationGroupId(id)) groupIds.add(id!);
  }

  for (const groupId of groupIds) {
    const indices = result
      .map((block, index) => (block.narrationGroupId?.trim() === groupId ? index : -1))
      .filter((index) => index >= 0);

    if (indices.length <= 1) continue;

    const runs = contiguousRuns(indices);
    if (runs.length <= 1) continue;

    const keepRun = pickRunToKeep(result, runs);
    const keepSet = new Set(keepRun);

    for (const run of runs) {
      if (keepSet.has(run[0]!)) continue;
      for (const index of run) {
        const block = result[index]!;
        if (isStoryBlockPause(block)) continue;
        if (isVisualCutOnly(block) || !block.narrativeText.trim()) {
          result[index] = detachVisualCutFromNarrationGroup(block);
          detachedCount += 1;
        } else {
          // Lead block in a split-off segment — keep text but start a solo narration block.
          result[index] = {
            ...block,
            narrationGroupId: null,
          };
        }
      }
    }
  }

  return { blocks: result, detachedCount };
}

/** Move an entire contiguous narration group one step earlier/later (for toolbar/context nudges). */
export function contiguousNarrationGroupIndices(
  blocks: StoryBlock[],
  blockId: string,
): number[] | null {
  const sorted = sortBlocksByPosition(blocks);
  const index = sorted.findIndex((block) => block.id === blockId);
  if (index < 0) return null;

  const groupId = sorted[index]!.narrationGroupId?.trim();
  if (!isSpeechNarrationGroupId(groupId)) return [index];

  const indices = sorted
    .map((block, i) => (block.narrationGroupId?.trim() === groupId ? i : -1))
    .filter((i) => i >= 0);

  const runs = contiguousRuns(indices);
  const run = runs.find((candidate) => candidate.includes(index));
  return run && run.length > 1 ? run : [index];
}
