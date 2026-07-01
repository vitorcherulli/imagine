import fs from "node:fs/promises";
import path from "node:path";
import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  assertReadableMediaFile,
  deleteMediaByPublicUrl,
  ensureVideoProcessingDir,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";
import {
  extractAudioFromVideo,
  extractFirstFrameFromVideoBuffer,
  fitVideoToDuration,
  getMediaDurationSeconds,
  hasFfmpeg,
  isVideoMp4Buffer,
} from "@/lib/ffmpeg";
import { registerMediaLibraryAssetSafe } from "@/lib/media-library-server";
import {
  ceilBlockDurationSeconds,
  getBlockNarrationDurationSeconds,
} from "@/lib/block-video";
import type { VideoSearchResult } from "@/lib/video-search";
import {
  deleteBlockPreviewVideo,
  savePreviewVideoFromFile,
} from "@/lib/video-preview-server";
import { shouldGeneratePreviewProxy } from "@/lib/preview-settings";

const VIDEO_USER_AGENT =
  "ImagineStoryStudio/1.0 (documentary video tool; +https://imagine.papo.global)";

export async function downloadStockVideoBuffer(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl, {
    headers: {
      "User-Agent": VIDEO_USER_AGENT,
      Accept: "video/mp4,video/*,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Video download failed (${res.status})`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("Received HTML instead of a video file");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) {
    throw new Error("Downloaded video is too small");
  }
  if (!isVideoMp4Buffer(buf) && !contentType.includes("video/")) {
    throw new Error("Downloaded file is not a recognized MP4 video");
  }
  return buf;
}

export async function importVideoBufferToBlock(input: {
  project: Project;
  block: StoryBlock;
  rawBuf: Buffer;
  userId: string;
  registerGallery?: {
    name: string;
    source: "upload" | "pexels" | "script_ref";
  };
  stockVideoId?: string | null;
}): Promise<{
  videoUrl: string;
  keyframeUrl: string | null;
  sceneAudioUrl: string | null;
  durationSeconds: number;
  status: StoryBlock["status"];
  stockVideoId: string | null;
}> {
  const targetDuration = await getBlockNarrationDurationSeconds(input.block);
  const rawBuf = input.rawBuf;

  const dir = await ensureVideoProcessingDir(input.project.id, input.block.id);
  const rawPath = path.join(dir, "stock_video_raw.mp4");
  const finalPath = path.join(dir, "video.mp4");
  const scenePath = path.join(dir, "scene_audio.m4a");

  try {
    await fs.writeFile(rawPath, rawBuf);
    await assertReadableMediaFile(rawPath, "Uploaded video");

    let sceneAudioReady = false;

    if (hasFfmpeg()) {
      sceneAudioReady = await extractAudioFromVideo(rawPath, scenePath).catch(() => false);
      await fitVideoToDuration(rawPath, finalPath, targetDuration);
      await assertReadableMediaFile(finalPath, "Processed video");
    } else {
      await fs.copyFile(rawPath, finalPath);
      let actualDuration = 0;
      try {
        actualDuration = await getMediaDurationSeconds(finalPath);
      } catch {
        actualDuration = targetDuration;
      }
      if (actualDuration + 0.75 < targetDuration) {
        throw new Error(
          `Clip is ${actualDuration.toFixed(1)}s but this block needs ~${targetDuration.toFixed(1)}s. Install ffmpeg to loop/trim, or pick a longer clip.`,
        );
      }
    }

    if (input.block.videoUrl) {
      await deleteMediaByPublicUrl(input.block.videoUrl);
      await deleteBlockPreviewVideo(input.project.id, input.block.id);
    }
    if (input.block.sceneAudioUrl) {
      await deleteMediaByPublicUrl(input.block.sceneAudioUrl);
    }

    let keyframeUrl: string | null = input.block.keyframeUrl;
    try {
      const poster = await extractFirstFrameFromVideoBuffer(await fs.readFile(finalPath));
      if (input.block.keyframeUrl) {
        await deleteMediaByPublicUrl(input.block.keyframeUrl);
      }
      keyframeUrl = withCacheBuster(
        await saveBuffer(input.project.id, input.block.id, "keyframe.jpg", poster),
      );
    } catch {
      // Preview still works via video fallback when poster extraction fails.
    }

    const videoUrl = withCacheBuster(
      await saveBuffer(
        input.project.id,
        input.block.id,
        "video.mp4",
        await fs.readFile(finalPath),
      ),
    );

    if (shouldGeneratePreviewProxy(input.project.previewMode)) {
      await savePreviewVideoFromFile(input.project.id, input.block.id, finalPath).catch(
        () => null,
      );
    }

    let sceneAudioUrl: string | null = null;
    if (sceneAudioReady) {
      await assertReadableMediaFile(scenePath, "Scene audio");
      sceneAudioUrl = withCacheBuster(
        await saveBuffer(
          input.project.id,
          input.block.id,
          "scene_audio.m4a",
          await fs.readFile(scenePath),
        ),
      );
    }

    if (input.registerGallery) {
      registerMediaLibraryAssetSafe({
        userId: input.userId,
        url: videoUrl,
        name: input.registerGallery.name,
        mimeType: "video/mp4",
        kind: "video",
        source: input.registerGallery.source,
        projectId: input.project.id,
        blockId: input.block.id,
      });
    }

    const durationSeconds = ceilBlockDurationSeconds(targetDuration);
    const status: StoryBlock["status"] = input.block.audioUrl ? "ready" : "video_ready";
    const stockVideoId = input.stockVideoId?.trim() || null;

    return { videoUrl, keyframeUrl, sceneAudioUrl, durationSeconds, status, stockVideoId };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function importStockVideoToBlock(input: {
  project: Project;
  block: StoryBlock;
  result: Pick<
    VideoSearchResult,
    "id" | "downloadUrl" | "previewUrl" | "provider" | "sourceTitle" | "attribution"
  >;
  userId: string;
}): Promise<{
  videoUrl: string;
  keyframeUrl: string | null;
  sceneAudioUrl: string | null;
  durationSeconds: number;
  status: StoryBlock["status"];
  stockVideoId: string | null;
}> {
  const rawBuf = await downloadStockVideoBuffer(input.result.downloadUrl);
  return importVideoBufferToBlock({
    project: input.project,
    block: input.block,
    rawBuf,
    userId: input.userId,
    registerGallery: {
      name: input.result.sourceTitle?.trim() || "Imported stock video",
      source: input.result.provider,
    },
    stockVideoId: input.result.id?.trim() || null,
  });
}

/** Fit a script reference clip to a block duration when applying to the timeline. */
export async function promoteScriptReferenceVideoToBlock(input: {
  projectId: string;
  blockId: string;
  sourceVideoUrl: string;
  durationSeconds: number;
  previewMode?: string | null;
  userId?: string;
}): Promise<{ videoUrl: string; sceneAudioUrl: string | null }> {
  const { resolveMediaPath } = await import("@/lib/storage");
  const sourcePath = await resolveMediaPath(input.sourceVideoUrl);
  const targetDuration = Math.max(1, input.durationSeconds);

  const dir = await ensureVideoProcessingDir(input.projectId, input.blockId);
  const rawPath = path.join(dir, "script_ref_source.mp4");
  const finalPath = path.join(dir, "video.mp4");
  const scenePath = path.join(dir, "scene_audio.m4a");

  try {
    await fs.copyFile(sourcePath, rawPath);
    await assertReadableMediaFile(rawPath, "Script reference video");

    let sceneAudioReady = false;

    if (hasFfmpeg()) {
      sceneAudioReady = await extractAudioFromVideo(rawPath, scenePath).catch(() => false);
      await fitVideoToDuration(rawPath, finalPath, targetDuration);
      await assertReadableMediaFile(finalPath, "Processed script video");
    } else {
      await fs.copyFile(rawPath, finalPath);
      let actualDuration = 0;
      try {
        actualDuration = await getMediaDurationSeconds(finalPath);
      } catch {
        actualDuration = targetDuration;
      }
      if (actualDuration + 0.75 < targetDuration) {
        throw new Error(
          `Stock clip is ${actualDuration.toFixed(1)}s but this cut needs ~${targetDuration.toFixed(1)}s. Install ffmpeg to loop/trim.`,
        );
      }
    }

    const videoUrl = withCacheBuster(
      await saveBuffer(
        input.projectId,
        input.blockId,
        "video.mp4",
        await fs.readFile(finalPath),
      ),
    );

    await deleteBlockPreviewVideo(input.projectId, input.blockId);
    if (shouldGeneratePreviewProxy(input.previewMode)) {
      await savePreviewVideoFromFile(input.projectId, input.blockId, finalPath).catch(() => null);
    }

    let sceneAudioUrl: string | null = null;
    if (sceneAudioReady) {
      await assertReadableMediaFile(scenePath, "Scene audio");
      sceneAudioUrl = withCacheBuster(
        await saveBuffer(
          input.projectId,
          input.blockId,
          "scene_audio.m4a",
          await fs.readFile(scenePath),
        ),
      );
    }

    if (input.userId) {
      registerMediaLibraryAssetSafe({
        userId: input.userId,
        url: videoUrl,
        name: "Script stock video",
        mimeType: "video/mp4",
        kind: "video",
        source: "pexels",
        projectId: input.projectId,
        blockId: input.blockId,
      });
    }

    return { videoUrl, sceneAudioUrl };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
