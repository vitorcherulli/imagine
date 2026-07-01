import type { StoryBlock } from "@/lib/db/schema";
import { normalizeScriptText } from "@/lib/script-studio";

/** Build script draft paragraphs from timeline story blocks (one paragraph per speech beat). */
export function storyBlocksToScriptDraft(
  blocks: Array<Pick<StoryBlock, "narrativeText" | "narrationGroupId" | "position">>,
): string {
  const ordered = [...blocks].sort((a, b) => a.position - b.position);
  const seenSpeechGroups = new Set<string>();
  const paragraphs: string[] = [];

  for (const block of ordered) {
    const text = block.narrativeText.trim();
    if (!text) continue;

    const groupId = block.narrationGroupId?.trim();
    if (groupId && /^n\d+$/i.test(groupId)) {
      if (seenSpeechGroups.has(groupId)) continue;
      seenSpeechGroups.add(groupId);
    }

    paragraphs.push(text);
  }

  return normalizeScriptText(paragraphs.join("\n\n"));
}
