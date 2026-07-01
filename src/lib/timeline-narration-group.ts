import type { StoryBlock } from "@/lib/db/schema";
import { speechIndexFromNarrationGroupId } from "@/lib/script-narration-utils";
import { distributeVisualCutDurations } from "@/lib/timeline-duration";

export function blocksInNarrationGroup(
  blocks: StoryBlock[],
  groupId: string,
): StoryBlock[] {
  return blocks
    .filter((block) => block.narrationGroupId?.trim() === groupId)
    .sort((a, b) => a.position - b.position);
}

export function narrationGroupForBlock(
  blocks: StoryBlock[],
  blockId: string,
): StoryBlock[] {
  const block = blocks.find((item) => item.id === blockId);
  const groupId = block?.narrationGroupId?.trim();
  if (!groupId || !/^n\d+$/.test(groupId)) return block ? [block] : [];
  return blocksInNarrationGroup(blocks, groupId);
}

export function leadBlockForNarrationGroup(group: StoryBlock[]): StoryBlock | null {
  return group.find((block) => block.narrativeText.trim()) ?? group[0] ?? null;
}

export function isContinuousSpeechGroup(group: StoryBlock[]): boolean {
  if (group.length === 0) return false;
  const groupId = group[0]?.narrationGroupId?.trim();
  return Boolean(groupId && /^n\d+$/.test(groupId));
}

/** Script paragraphs (n1, n2…) as contiguous visual-cut groups in timeline order. */
export function continuousSpeechNarrationGroups(blocks: StoryBlock[]): StoryBlock[][] {
  const groups: StoryBlock[][] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    const groupId = block.narrationGroupId?.trim();
    if (groupId && /^n\d+$/.test(groupId)) {
      const groupBlocks: StoryBlock[] = [];
      while (index < blocks.length && blocks[index]?.narrationGroupId?.trim() === groupId) {
        groupBlocks.push(blocks[index]!);
        index += 1;
      }
      groups.push(groupBlocks);
      continue;
    }
    index += 1;
  }
  return groups;
}

export function canFitVisualCutsGroupToAudio(group: StoryBlock[]): boolean {
  if (!isContinuousSpeechGroup(group)) return false;
  const lead = leadBlockForNarrationGroup(group);
  return Boolean(lead?.audioUrl?.trim());
}

export function planFitVisualCutsToAudio(
  group: StoryBlock[],
  audioDurationSeconds: number,
): Array<{ blockId: string; durationSeconds: number }> | null {
  if (!isContinuousSpeechGroup(group)) return null;
  const lead = leadBlockForNarrationGroup(group);
  if (!lead?.audioUrl) return null;

  const durations = distributeVisualCutDurations(audioDurationSeconds, group.length);
  return group.map((block, index) => ({
    blockId: block.id,
    durationSeconds: durations[index] ?? 1,
  }));
}

export function narrationGroupLabel(group: StoryBlock[]): string {
  const groupId = group[0]?.narrationGroupId?.trim();
  const speechIndex = groupId ? speechIndexFromNarrationGroupId(groupId) : null;
  if (speechIndex != null) return `Paragraph ${speechIndex + 1}`;
  return "Narration group";
}
