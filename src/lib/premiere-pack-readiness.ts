import type { StoryBlock } from "./db/schema";

export function premierePackReadiness(blocks: StoryBlock[], musicUrl?: string | null): {
  ok: boolean;
  reason?: string;
  assetCount: number;
} {
  if (blocks.length === 0) {
    return { ok: false, reason: "Add blocks to the timeline first.", assetCount: 0 };
  }
  let assetCount = 0;
  for (const block of blocks) {
    if (block.videoUrl?.trim()) assetCount += 1;
    if (block.keyframeUrl?.trim()) assetCount += 1;
    if (block.audioUrl?.trim()) assetCount += 1;
    if (block.sceneAudioUrl?.trim()) assetCount += 1;
  }
  if (musicUrl?.trim()) assetCount += 1;
  if (assetCount === 0) {
    return {
      ok: false,
      reason: "Generate or import at least one video, image, or audio clip before exporting.",
      assetCount: 0,
    };
  }
  return { ok: true, assetCount };
}
