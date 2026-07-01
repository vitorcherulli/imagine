import type { StoryBlock } from "@/lib/db/schema";
import { buildNarrationTrackSpans, type NarrationTrackSpan } from "@/components/timeline/types";
import { isStoryBlockPause } from "@/lib/script-pause";

export function sortBlocksByPosition(blocks: StoryBlock[]): StoryBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position);
}

export function getLinkedBlockStartSeconds(blocks: StoryBlock[], blockId: string): number {
  let elapsed = 0;
  for (const block of sortBlocksByPosition(blocks)) {
    if (block.id === blockId) return elapsed;
    elapsed += block.durationSeconds;
  }
  return elapsed;
}

/** Video track start — always sequential by block order. */
export function resolveVideoStartSeconds(block: StoryBlock, blocks: StoryBlock[]): number {
  return getLinkedBlockStartSeconds(blocks, block.id);
}

/** Scene audio start — always sequential by block order. */
export function resolveSceneStartSeconds(block: StoryBlock, blocks: StoryBlock[]): number {
  return getLinkedBlockStartSeconds(blocks, block.id);
}

/** Narration span start — first visual block in the group (continuous mode). */
export function resolveNarrationSpanStartSeconds(
  leadBlock: StoryBlock,
  spanBlocks: StoryBlock[],
  blocks: StoryBlock[],
): number {
  void leadBlock;
  return getLinkedBlockStartSeconds(blocks, spanBlocks[0]!.id);
}

export function computeTimelineDurationSeconds(blocks: StoryBlock[]): number {
  const sorted = sortBlocksByPosition(blocks);
  if (sorted.length === 0) return 30;

  let maxEnd = 0;
  for (const block of sorted) {
    const videoEnd = resolveVideoStartSeconds(block, sorted) + block.durationSeconds;
    const sceneEnd = resolveSceneStartSeconds(block, sorted) + block.durationSeconds;
    maxEnd = Math.max(maxEnd, videoEnd, sceneEnd);
  }

  for (const span of buildNarrationTrackSpans(sorted)) {
    const start = resolveNarrationSpanStartSeconds(span.leadBlock, span.blocks, sorted);
    maxEnd = Math.max(maxEnd, start + span.durationSeconds);
  }

  return Math.max(1, Math.ceil(maxEnd * 10) / 10);
}

export interface ActiveTimelineBlock {
  block: StoryBlock;
  blockStart: number;
  localOffset: number;
}

export function findActiveVideoBlockAtTime(
  blocks: StoryBlock[],
  currentTime: number,
): ActiveTimelineBlock | null {
  return findActiveClipBlockAtTime(blocks, currentTime, resolveVideoStartSeconds);
}

export function findActiveSceneBlockAtTime(
  blocks: StoryBlock[],
  currentTime: number,
): ActiveTimelineBlock | null {
  return findActiveClipBlockAtTime(blocks, currentTime, resolveSceneStartSeconds);
}

function findActiveClipBlockAtTime(
  blocks: StoryBlock[],
  currentTime: number,
  resolveStart: (block: StoryBlock, blocks: StoryBlock[]) => number,
): ActiveTimelineBlock | null {
  const sorted = sortBlocksByPosition(blocks);
  if (sorted.length === 0) return null;

  for (const block of sorted) {
    const start = resolveStart(block, sorted);
    const end = start + block.durationSeconds;
    if (currentTime >= start && currentTime < end) {
      return { block, blockStart: start, localOffset: currentTime - start };
    }
  }

  return null;
}

export interface MediaSeekAtTime {
  globalTime: number;
  video: ActiveTimelineBlock | null;
  scene: ActiveTimelineBlock | null;
  narration: TimelineNarrationPlayback | null;
}

export function resolveMediaSeekAtTime(
  blocks: StoryBlock[],
  currentTime: number,
): MediaSeekAtTime {
  const globalTime = Math.max(0, currentTime);
  return {
    globalTime,
    video: findActiveVideoBlockAtTime(blocks, globalTime),
    scene: findActiveSceneBlockAtTime(blocks, globalTime),
    narration: resolveNarrationPlaybackAtTime(blocks, globalTime),
  };
}

/** Recompute linked timeline starts from block order + narration groups (saved per block). */
export function realignTimelineStarts(blocks: StoryBlock[]): StoryBlock[] {
  const sorted = sortBlocksByPosition(blocks);
  let linkedCursor = 0;
  const linkedStartById = new Map<string, number>();
  for (const block of sorted) {
    linkedStartById.set(block.id, linkedCursor);
    linkedCursor += block.durationSeconds;
  }

  const narrationSpanStarts = new Map<string, number>();
  for (const span of buildNarrationTrackSpans(sorted)) {
    narrationSpanStarts.set(
      span.leadBlock.id,
      linkedStartById.get(span.blocks[0]!.id) ?? 0,
    );
  }

  return sorted.map((block) => ({
    ...block,
    videoTimelineStart: linkedStartById.get(block.id) ?? 0,
    sceneTimelineStart: linkedStartById.get(block.id) ?? 0,
    narrationTimelineStart: narrationSpanStarts.has(block.id)
      ? narrationSpanStarts.get(block.id)!
      : null,
  }));
}

export function seedTimelineStarts(blocks: StoryBlock[]): StoryBlock[] {
  return realignTimelineStarts(blocks);
}

export function blocksMissingTimelineStarts(blocks: StoryBlock[]): boolean {
  const sorted = sortBlocksByPosition(blocks);
  for (const block of sorted) {
    if (block.videoTimelineStart == null || block.sceneTimelineStart == null) return true;
  }
  for (const span of buildNarrationTrackSpans(sorted)) {
    if (span.leadBlock.narrationTimelineStart == null) return true;
  }
  return false;
}

export function snapTimelineStartSeconds(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

export interface TimelineNarrationPlayback {
  lead: StoryBlock;
  groupStartTime: number;
  /** Seek position in the narration file at `currentTime`. */
  audioOffset: number;
  /** Seek position at the start of this timeline span (for playback clock math). */
  audioBaseOffset: number;
  groupDuration: number;
}

export function resolveNarrationPlaybackAtTime(
  blocks: StoryBlock[],
  currentTime: number,
): TimelineNarrationPlayback | null {
  const sorted = sortBlocksByPosition(blocks);
  for (const span of buildNarrationTrackSpans(sorted)) {
    if (span.blocks.some((block) => isStoryBlockPause(block))) {
      continue;
    }

    const lead = span.leadBlock;
    if (!lead.audioUrl?.trim()) {
      continue;
    }

    const start = resolveNarrationSpanStartSeconds(lead, span.blocks, sorted);
    const end = start + span.durationSeconds;
    if (currentTime >= start && currentTime < end) {
      const local = currentTime - start;
      const audioBaseOffset = speechGroupAudioOffset(sorted, span, 0);
      return {
        lead,
        groupStartTime: start,
        audioOffset: speechGroupAudioOffset(sorted, span, local),
        audioBaseOffset,
        groupDuration: span.durationSeconds,
      };
    }
  }
  return null;
}

/** Offset into the shared narration file when speech groups are split (e.g. by a music pause). */
function speechGroupAudioOffset(
  sorted: StoryBlock[],
  span: NarrationTrackSpan,
  localSeconds: number,
): number {
  const groupId = span.leadBlock.narrationGroupId?.trim();
  if (!groupId || !/^n\d+$/.test(groupId)) {
    return Math.max(0, localSeconds);
  }

  const spanFirst = span.blocks[0]!;
  let priorInGroup = 0;
  for (const block of sorted) {
    if (block.id === spanFirst.id) break;
    if (block.narrationGroupId?.trim() === groupId) {
      priorInGroup += block.durationSeconds;
    }
  }
  return priorInGroup + Math.max(0, localSeconds);
}
