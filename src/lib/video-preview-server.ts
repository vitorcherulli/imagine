import fs from "node:fs/promises";
import path from "node:path";
import type { StoryBlock } from "@/lib/db/schema";
import { createPreviewVideoFromFile, hasFfmpeg } from "@/lib/ffmpeg";
import {
  assertReadableMediaFile,
  deleteMediaByKey,
  ensureVideoProcessingDir,
  mediaFileExists,
  resolveMediaPath,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";
import {
  PREVIEW_VIDEO_CRF,
  PREVIEW_VIDEO_MAX_HEIGHT,
  VIDEO_PREVIEW_FILENAME,
  previewVideoStorageKey,
  previewVideoUrlFromFullVideoUrl,
} from "@/lib/video-preview";

function previewMediaUrl(projectId: string, blockId: string): string {
  const key = previewVideoStorageKey(projectId, blockId);
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Stamp the preview URL with the source video's `?v=` buster so cache invalidates on regen. */
function previewUrlWithBuster(
  stableUrl: string,
  sourceVideoUrl: string,
): string {
  const params = new URLSearchParams(sourceVideoUrl.split("?", 2)[1] ?? "");
  const buster = params.get("v");
  if (!buster) return stableUrl;
  const sep = stableUrl.includes("?") ? "&" : "?";
  return `${stableUrl}${sep}v=${encodeURIComponent(buster)}`;
}

export async function deleteBlockPreviewVideo(
  projectId: string,
  blockId: string,
): Promise<void> {
  await deleteMediaByKey(previewVideoStorageKey(projectId, blockId));
}

/** True when `video.mp4` was written after the stored preview proxy. */
async function isBlockPreviewStale(
  projectId: string,
  blockId: string,
  sourceVideoUrl: string,
): Promise<boolean> {
  const stableUrl = previewMediaUrl(projectId, blockId);
  if (!(await mediaFileExists(stableUrl))) return false;

  try {
    const sourcePath = await resolveMediaPath(sourceVideoUrl);
    const previewPath = await resolveMediaPath(stableUrl);
    const [sourceStat, previewStat] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(previewPath),
    ]);
    return sourceStat.mtimeMs > previewStat.mtimeMs + 500;
  } catch {
    return true;
  }
}

/**
 * In-flight dedupe keyed by blockId. Two concurrent requests for the same
 * block share one ffmpeg pass instead of stacking.
 */
const inflightPreview = new Map<string, Promise<string | null>>();

/** Encode and store a tiny proxy MP4 for in-app preview only. */
export async function savePreviewVideoFromFile(
  projectId: string,
  blockId: string,
  sourcePath: string,
): Promise<string | null> {
  if (!hasFfmpeg()) return null;

  const dir = await ensureVideoProcessingDir(projectId, blockId);
  const outPath = path.join(dir, VIDEO_PREVIEW_FILENAME);

  try {
    await createPreviewVideoFromFile(sourcePath, outPath, {
      maxHeight: PREVIEW_VIDEO_MAX_HEIGHT,
      crf: PREVIEW_VIDEO_CRF,
    });
    await assertReadableMediaFile(outPath, "Preview video");
    const buf = await fs.readFile(outPath);
    return withCacheBuster(
      await saveBuffer(projectId, blockId, VIDEO_PREVIEW_FILENAME, buf),
    );
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Return preview URL, generating `video_preview.mp4` from full `video.mp4` when missing. */
export async function ensureBlockPreviewVideo(
  projectId: string,
  block: Pick<StoryBlock, "id" | "videoUrl">,
): Promise<string | null> {
  if (!block.videoUrl?.trim()) return null;

  const fullFallback = block.videoUrl.split("?")[0] ?? block.videoUrl;
  const stableUrl = previewMediaUrl(projectId, block.id);

  // Fast path — preview already exists unless the source video is newer.
  if (await mediaFileExists(stableUrl)) {
    const sourceVideoUrl = block.videoUrl ?? fullFallback;
    if (await isBlockPreviewStale(projectId, block.id, sourceVideoUrl)) {
      await deleteBlockPreviewVideo(projectId, block.id);
    } else {
      return previewUrlWithBuster(stableUrl, block.videoUrl);
    }
  }

  if (!(await mediaFileExists(fullFallback))) {
    return null;
  }

  if (!hasFfmpeg()) {
    return fullFallback;
  }

  // Dedupe concurrent generation for the same block.
  const existing = inflightPreview.get(block.id);
  if (existing) return existing;

  const task = (async () => {
    try {
      const sourceVideoUrl = block.videoUrl ?? fullFallback;
      const sourcePath = await resolveMediaPath(sourceVideoUrl);
      const generated = await savePreviewVideoFromFile(projectId, block.id, sourcePath);
      if (generated) {
        // `savePreviewVideoFromFile` stamps its own fresh buster; replace it
        // with the source video's buster so client cache invalidation keys
        // match across the video and its preview.
        return previewUrlWithBuster(stableUrl, sourceVideoUrl);
      }
      return fullFallback;
    } catch {
      return fullFallback;
    }
  })();

  inflightPreview.set(block.id, task);
  try {
    return await task;
  } finally {
    inflightPreview.delete(block.id);
  }
}
