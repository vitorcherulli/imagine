import {
  describeMediaUrlIssue,
  isValidImageMediaUrl,
  isValidVideoMediaUrl,
  mediaFileExists,
} from "@/lib/storage";
import type { StoryBlock } from "@/lib/db/schema";

function isLocalMediaUrl(url: string): boolean {
  const path = url.split("?")[0]?.split("#")[0] ?? "";
  return path.startsWith("/api/media/");
}

function isImageMediaUrl(url: string): boolean {
  const pathOnly = url.split("?")[0]?.split("#")[0] ?? "";
  return /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(pathOnly);
}

function isVideoMediaUrl(url: string): boolean {
  const pathOnly = url.split("?")[0]?.split("#")[0] ?? "";
  return /\.(mp4|mov|webm)$/i.test(pathOnly);
}

async function pruneMediaUrl(
  url: string | null | undefined,
  kind: "image" | "video" | "any" = "any",
): Promise<{ url: string | null | undefined; pruned: boolean }> {
  const trimmed = url?.trim();
  if (!trimmed || !isLocalMediaUrl(trimmed)) {
    return { url: trimmed || url, pruned: false };
  }
  if (!(await mediaFileExists(trimmed))) {
    return { url: null, pruned: true };
  }

  const shouldValidateImage = kind === "image" || (kind === "any" && isImageMediaUrl(trimmed));
  const shouldValidateVideo = kind === "video" || (kind === "any" && isVideoMediaUrl(trimmed));

  if (shouldValidateImage && !(await isValidImageMediaUrl(trimmed))) {
    return { url: null, pruned: true };
  }
  if (shouldValidateVideo && !(await isValidVideoMediaUrl(trimmed))) {
    return { url: null, pruned: true };
  }
  if (kind === "any" && (shouldValidateImage || shouldValidateVideo)) {
    return { url: trimmed, pruned: false };
  }
  if (kind === "any") {
    const issue = await describeMediaUrlIssue(trimmed);
    if (issue) return { url: null, pruned: true };
  }

  return { url: trimmed, pruned: false };
}

type BlockMediaFields = Pick<
  StoryBlock,
  "id" | "keyframeUrl" | "videoUrl" | "audioUrl" | "sceneAudioUrl"
>;

/** Drop block media URLs that no longer exist on disk/S3 (stale after deploy or manual cleanup). */
export async function pruneBrokenBlockMedia<T extends BlockMediaFields>(
  block: T,
): Promise<{ block: T; prunedCount: number }> {
  const [keyframe, video, audio, sceneAudio] = await Promise.all([
    pruneMediaUrl(block.keyframeUrl, "image"),
    pruneMediaUrl(block.videoUrl, "video"),
    pruneMediaUrl(block.audioUrl),
    pruneMediaUrl(block.sceneAudioUrl),
  ]);

  const prunedCount =
    Number(keyframe.pruned) +
    Number(video.pruned) +
    Number(audio.pruned) +
    Number(sceneAudio.pruned);

  if (prunedCount === 0) return { block, prunedCount: 0 };

  return {
    block: {
      ...block,
      keyframeUrl: keyframe.url ?? null,
      videoUrl: video.url ?? null,
      audioUrl: audio.url ?? null,
      sceneAudioUrl: sceneAudio.url ?? null,
    },
    prunedCount,
  };
}

export async function pruneBrokenBlocksMedia<T extends BlockMediaFields>(
  blocks: T[],
): Promise<{ blocks: T[]; prunedCount: number }> {
  let prunedCount = 0;
  const nextBlocks: T[] = [];

  for (const block of blocks) {
    const { block: pruned, prunedCount: blockPruned } = await pruneBrokenBlockMedia(block);
    prunedCount += blockPruned;
    nextBlocks.push(pruned);
  }

  return { blocks: nextBlocks, prunedCount };
}
