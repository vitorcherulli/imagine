import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  extractFirstFrameFromVideoBuffer,
  isVideoMp4Buffer,
} from "@/lib/ffmpeg";
import {
  deleteMediaByPublicUrl,
  mediaFileExists,
  readMediaBuffer,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";

function mediaPathOnly(url: string): string {
  return url.split("?")[0]?.split("#")[0] ?? url;
}

function keyframeUrlWithVideoBuster(stableKeyframeUrl: string, videoUrl: string): string {
  const params = new URLSearchParams(videoUrl.split("?", 2)[1] ?? "");
  const buster = params.get("v");
  if (!buster) return withCacheBuster(stableKeyframeUrl);
  const base = stableKeyframeUrl.split("?")[0] ?? stableKeyframeUrl;
  return `${base}?v=${encodeURIComponent(buster)}`;
}

/**
 * When video exists but keyframe is missing or 404, extract the first frame as keyframe.jpg.
 */
export async function repairMissingKeyframeFromVideo(
  project: Pick<Project, "id">,
  block: StoryBlock,
): Promise<{ block: StoryBlock; repaired: boolean }> {
  const invalid = await repairInvalidKeyframeIfNeeded(project as Project, block);
  if (invalid.repaired) return invalid;

  const current = invalid.block;
  if (current.keyframeUrl && (await mediaFileExists(current.keyframeUrl))) {
    return { block: current, repaired: false };
  }

  const videoUrl = current.videoUrl?.trim();
  if (!videoUrl || !(await mediaFileExists(videoUrl))) {
    return {
      block: current.keyframeUrl ? { ...current, keyframeUrl: null } : current,
      repaired: Boolean(current.keyframeUrl),
    };
  }

  try {
    const videoBuf = await readMediaBuffer(videoUrl);
    const jpeg = await extractFirstFrameFromVideoBuffer(videoBuf);
    const saved = await saveBuffer(project.id, block.id, "keyframe.jpg", jpeg);
    const keyframeUrl = keyframeUrlWithVideoBuster(saved, videoUrl);

    return {
      block: {
        ...current,
        keyframeUrl,
        status: current.videoUrl ? current.status : "image_ready",
        errorMessage: null,
      },
      repaired: true,
    };
  } catch {
    return { block: { ...current, keyframeUrl: null }, repaired: Boolean(current.keyframeUrl) };
  }
}

/**
 * Some blocks end up with a video file referenced as keyframe (bad import/sync).
 * Extract a JPEG still so image-to-video generation can proceed.
 */
export async function repairInvalidKeyframeIfNeeded(
  project: Project,
  block: StoryBlock,
): Promise<{ block: StoryBlock; repaired: boolean }> {
  if (!block.keyframeUrl) return { block, repaired: false };

  let keyframeBuf: Buffer;
  try {
    keyframeBuf = await readMediaBuffer(block.keyframeUrl);
  } catch {
    return { block, repaired: false };
  }

  if (!isVideoMp4Buffer(keyframeBuf)) return { block, repaired: false };

  let sourceBuf = keyframeBuf;
  const keyPath = mediaPathOnly(block.keyframeUrl);
  const videoPath = block.videoUrl ? mediaPathOnly(block.videoUrl) : null;

  if (videoPath && videoPath !== keyPath) {
    try {
      sourceBuf = await readMediaBuffer(block.videoUrl!);
    } catch {
      sourceBuf = keyframeBuf;
    }
  }

  const jpeg = await extractFirstFrameFromVideoBuffer(sourceBuf);

  if (videoPath && videoPath !== keyPath) {
    await deleteMediaByPublicUrl(block.keyframeUrl);
  }

  const keyframeUrl = withCacheBuster(
    await saveBuffer(project.id, block.id, "keyframe.jpg", jpeg),
  );

  return {
    block: {
      ...block,
      keyframeUrl,
      status: block.videoUrl ? block.status : "image_ready",
      errorMessage: null,
    },
    repaired: true,
  };
}
