import type { StoryBlock } from "@/lib/db/schema";
import { pruneBrokenBlockMedia } from "@/lib/block-media-prune";
import { repairMissingKeyframeFromVideo } from "@/lib/keyframe-repair";

/** Prune stale URLs, then rebuild missing keyframes from video when possible. */
export async function reconcileBlockMedia<T extends StoryBlock>(
  projectId: string,
  block: T,
): Promise<{ block: T; changed: boolean }> {
  const { block: pruned, prunedCount } = await pruneBrokenBlockMedia(block);
  const { block: repaired, repaired: didRepair } = await repairMissingKeyframeFromVideo(
    { id: projectId },
    pruned,
  );

  return {
    block: repaired as T,
    changed: prunedCount > 0 || didRepair,
  };
}
