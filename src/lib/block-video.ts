import fs from "node:fs/promises";
import path from "node:path";
import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  avatarHintForPrompt,
  resolveBlockAvatar,
} from "@/lib/avatar-block";
import {
  extractAudioFromVideo,
  fitVideoToDuration,
  getMediaDurationSeconds,
  hasFfmpeg,
  pickVideoRequestDuration,
  SEEDANCE_MAX_DURATION,
  VEO_MAX_DURATION,
  stretchAudioToDuration,
} from "@/lib/ffmpeg";
import type { VideoRefitMode } from "@/lib/video-duration-mismatch";
import { canStretchVideoWithSlowMotion } from "@/lib/video-duration-mismatch";
import { resolveProjectApiModels, resolveVideoGenerateAudio } from "@/lib/project-api-models";
import { getAspectRatio } from "@/lib/video-format";
import { openRouterHeaders } from "@/lib/openrouter/client";
import { submitVideo, waitForVideo } from "@/lib/openrouter/videos";
import { buildSceneVisualPrompt, parseStyleBible } from "@/lib/style-bible";
import { appendVideoShotInstructions, normalizeVideoShotCount } from "@/lib/video-shot-prompt";
import {
  assertReadableMediaFile,
  deleteMediaByPublicUrl,
  ensureVideoProcessingDir,
  readImageAsVideoFrameUrl,
  resolveMediaPath,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";
import {
  deleteBlockPreviewVideo,
  savePreviewVideoFromFile,
} from "@/lib/video-preview-server";
import { shouldGeneratePreviewProxy } from "@/lib/preview-settings";

export async function probeAudioDurationSeconds(audioUrl: string | null): Promise<number | null> {
  if (!audioUrl) return null;
  try {
    const { resolveMediaPath } = await import("@/lib/storage");
    const seconds = await getMediaDurationSeconds(await resolveMediaPath(audioUrl));
    return seconds > 0.2 ? seconds : null;
  } catch {
    return null;
  }
}

export async function getBlockNarrationDurationSeconds(block: StoryBlock): Promise<number> {
  const fromAudio = await probeAudioDurationSeconds(block.audioUrl);
  if (fromAudio !== null) return fromAudio;
  return Math.max(4, block.durationSeconds);
}

export function ceilBlockDurationSeconds(seconds: number): number {
  return Math.max(2, Math.min(60, Math.ceil(seconds)));
}

async function resolveFirstFrameUrl(
  project: Project,
  block: StoryBlock,
): Promise<{ firstFrameUrl?: string; avatarHint: string }> {
  if (block.keyframeUrl) {
    return { firstFrameUrl: await readImageAsVideoFrameUrl(block.keyframeUrl), avatarHint: "" };
  }
  const avatar = await resolveBlockAvatar(block, project);
  if (!avatar?.primaryImageUrl) return { avatarHint: avatarHintForPrompt(avatar) };
  return {
    firstFrameUrl: await readImageAsVideoFrameUrl(avatar.primaryImageUrl),
    avatarHint: avatarHintForPrompt(avatar),
  };
}

export async function generateBlockVideo(opts: {
  project: Project;
  block: StoryBlock;
}): Promise<{
  videoUrl: string;
  durationSeconds: number;
  sceneAudioUrl: string | null;
  openRouterCostUsd: number | null;
}> {
  const { project, block } = opts;
  const models = resolveProjectApiModels(project);
  const targetDuration = await getBlockNarrationDurationSeconds(block);
  const clipDuration = pickVideoRequestDuration(targetDuration, models.videoModel);

  const styleHint = project.visualStyle ? `${project.visualStyle}, ` : "";
  const { firstFrameUrl, avatarHint } = await resolveFirstFrameUrl(project, block);
  const bible = parseStyleBible(project.styleBible);
  const basePrompt =
    bible || block.locationTag
      ? buildSceneVisualPrompt({
          project,
          block,
          bible,
          avatarHint,
          hasEditorialReference: false,
        })
      : `${styleHint}${block.visualPrompt}${avatarHint}`;

  const prompt = appendVideoShotInstructions(
    basePrompt,
    normalizeVideoShotCount(block.videoShotCount),
    clipDuration,
  );

  const submit = await submitVideo({
    prompt,
    model: models.videoModel,
    duration: clipDuration,
    aspect_ratio: getAspectRatio(project.videoFormat),
    resolution: "720p",
    generateAudio: resolveVideoGenerateAudio(models.videoClipAudio),
    frame_images: firstFrameUrl
      ? [{ url: firstFrameUrl, frame: "first_frame" }]
      : undefined,
  });

  const result = await waitForVideo(submit.id, { pollingUrl: submit.polling_url });
  const fileUrl = result.unsigned_urls?.[0] ?? result.signed_urls?.[0];
  if (!fileUrl) throw new Error("Video response had no URL");

  const dir = await ensureVideoProcessingDir(project.id, block.id);
  const rawPath = path.join(dir, "video_raw.mp4");
  const finalPath = path.join(dir, "video.mp4");
  const scenePath = path.join(dir, "scene_audio.m4a");

  try {
    const res = await fetch(fileUrl, { headers: openRouterHeaders() });
    if (!res.ok) throw new Error(`Download failed ${res.status} for ${fileUrl}`);
    const rawBuf = Buffer.from(await res.arrayBuffer());
    if (rawBuf.length < 1024) {
      throw new Error("Downloaded video is empty or too small");
    }
    await fs.writeFile(rawPath, rawBuf);
    await assertReadableMediaFile(rawPath, "Downloaded video");

    let sceneAudioReady = false;

    if (hasFfmpeg()) {
      sceneAudioReady = await extractAudioFromVideo(rawPath, scenePath).catch(() => false);
      await fitVideoToDuration(rawPath, finalPath, targetDuration);
      await assertReadableMediaFile(finalPath, "Processed video");
    } else {
      await fs.rename(rawPath, finalPath);
      let actualDuration = 0;
      try {
        actualDuration = await getMediaDurationSeconds(finalPath);
      } catch {
        actualDuration = clipDuration;
      }
      const expected = Math.min(
        targetDuration,
        models.videoModel.includes("veo") ? VEO_MAX_DURATION : SEEDANCE_MAX_DURATION,
      );
      if (Math.abs(actualDuration - expected) > 0.75) {
        throw new Error(
          `Video is ${actualDuration.toFixed(1)}s but narration needs ~${targetDuration.toFixed(1)}s ` +
            `(clip target: ${expected.toFixed(1)}s). Install ffmpeg, then regenerate.`,
        );
      }
    }

    const videoUrl = withCacheBuster(
      await saveBuffer(project.id, block.id, "video.mp4", await fs.readFile(finalPath)),
    );

    if (shouldGeneratePreviewProxy(project.previewMode)) {
      await deleteBlockPreviewVideo(project.id, block.id);
      await savePreviewVideoFromFile(project.id, block.id, finalPath).catch(() => null);
    }

    let sceneAudioUrl: string | null = null;
    if (sceneAudioReady) {
      await assertReadableMediaFile(scenePath, "Scene audio");
      sceneAudioUrl = withCacheBuster(
        await saveBuffer(
          project.id,
          block.id,
          "scene_audio.m4a",
          await fs.readFile(scenePath),
        ),
      );
    }

    return {
      videoUrl,
      durationSeconds: ceilBlockDurationSeconds(targetDuration),
      sceneAudioUrl,
      openRouterCostUsd:
        typeof result.usage?.cost === "number" && Number.isFinite(result.usage.cost)
          ? result.usage.cost
          : null,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Loop/trim or slow-mo existing block video to match current block duration (after timeline edits). */
export async function refitBlockVideoToDuration(opts: {
  project: Project;
  block: StoryBlock;
  mode?: VideoRefitMode;
}): Promise<{ videoUrl: string; sceneAudioUrl?: string | null }> {
  const { block, project } = opts;
  const mode: VideoRefitMode = opts.mode ?? "loop";
  if (!block.videoUrl?.trim()) {
    throw new Error("This block has no video to extend.");
  }
  if (!hasFfmpeg()) {
    throw new Error(
      "ffmpeg is required to extend the clip. Install ffmpeg on the server, or import a longer stock video.",
    );
  }

  const targetDuration = Math.max(0.5, block.durationSeconds);
  const sourcePath = await resolveMediaPath(block.videoUrl);
  await assertReadableMediaFile(sourcePath, "Block video");

  let sourceDuration = 0;
  try {
    sourceDuration = await getMediaDurationSeconds(sourcePath);
  } catch {
    sourceDuration = 0;
  }

  if (mode === "slow") {
    if (!canStretchVideoWithSlowMotion(sourceDuration, targetDuration)) {
      throw new Error(
        sourceDuration > 0
          ? `Clip too short for slow motion (${sourceDuration.toFixed(1)}s → ${targetDuration.toFixed(1)}s). Use loop or import a longer video.`
          : "Could not read clip duration for slow motion.",
      );
    }
  }

  const dir = await ensureVideoProcessingDir(project.id, block.id);
  const finalPath = path.join(dir, "video.mp4");
  const scenePath = path.join(dir, "scene_audio.m4a");

  try {
    await fitVideoToDuration(sourcePath, finalPath, targetDuration, mode);
    await assertReadableMediaFile(finalPath, "Extended block video");

    if (block.videoUrl) {
      await deleteMediaByPublicUrl(block.videoUrl);
      await deleteBlockPreviewVideo(project.id, block.id);
    }

    const videoUrl = withCacheBuster(
      await saveBuffer(project.id, block.id, "video.mp4", await fs.readFile(finalPath)),
    );

    if (shouldGeneratePreviewProxy(project.previewMode)) {
      await savePreviewVideoFromFile(project.id, block.id, finalPath).catch(() => null);
    }

    let sceneAudioUrl: string | null | undefined = undefined;
    if (mode === "slow" && block.sceneAudioUrl?.trim() && sourceDuration > 0) {
      try {
        const sceneSourcePath = await resolveMediaPath(block.sceneAudioUrl);
        await stretchAudioToDuration(sceneSourcePath, scenePath, sourceDuration, targetDuration);
        await assertReadableMediaFile(scenePath, "Slowed scene audio");
        await deleteMediaByPublicUrl(block.sceneAudioUrl).catch(() => {});
        sceneAudioUrl = withCacheBuster(
          await saveBuffer(
            project.id,
            block.id,
            "scene_audio.m4a",
            await fs.readFile(scenePath),
          ),
        );
      } catch {
        sceneAudioUrl = null;
      }
    }

    return { videoUrl, ...(sceneAudioUrl !== undefined ? { sceneAudioUrl } : {}) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
