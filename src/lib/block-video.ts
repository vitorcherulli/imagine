import fs from "node:fs/promises";
import path from "node:path";
import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  avatarHintForPrompt,
  avatarReferenceImages,
  resolveBlockAvatar,
} from "@/lib/avatar-block";
import {
  extractAudioFromVideo,
  fitVideoToDuration,
  getMediaDurationSeconds,
  hasFfmpeg,
  pickSeedanceRequestDuration,
  SEEDANCE_MAX_DURATION,
} from "@/lib/ffmpeg";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { submitVideo, waitForVideo } from "@/lib/openrouter/videos";
import { buildSceneVisualPrompt, parseStyleBible } from "@/lib/style-bible";
import {
  absoluteFromPublicUrl,
  downloadToFile,
  ensureProjectDir,
  publicUrlFor,
  readImageAsDataUrl,
  withCacheBuster,
} from "@/lib/storage";

export async function probeAudioDurationSeconds(audioUrl: string | null): Promise<number | null> {
  if (!audioUrl) return null;
  try {
    const seconds = await getMediaDurationSeconds(absoluteFromPublicUrl(audioUrl));
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
    return { firstFrameUrl: await readImageAsDataUrl(block.keyframeUrl), avatarHint: "" };
  }
  const avatar = await resolveBlockAvatar(block, project);
  if (!avatar?.primaryImageUrl) return { avatarHint: avatarHintForPrompt(avatar) };
  return {
    firstFrameUrl: await readImageAsDataUrl(avatar.primaryImageUrl),
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
}> {
  const { project, block } = opts;
  const models = resolveProjectApiModels(project);
  const targetDuration = await getBlockNarrationDurationSeconds(block);
  const clipDuration = pickSeedanceRequestDuration(targetDuration);

  const styleHint = project.visualStyle ? `${project.visualStyle}, ` : "";
  const { firstFrameUrl, avatarHint } = await resolveFirstFrameUrl(project, block);
  const bible = parseStyleBible(project.styleBible);
  const prompt =
    bible || block.locationTag
      ? buildSceneVisualPrompt({
          project,
          block,
          bible,
          avatarHint,
          hasEditorialReference: false,
        })
      : `${styleHint}${block.visualPrompt}${avatarHint}`;

  const submit = await submitVideo({
    prompt,
    model: models.videoModel,
    duration: clipDuration,
    aspect_ratio: "16:9",
    resolution: "720p",
    frame_images: firstFrameUrl
      ? [{ url: firstFrameUrl, frame: "first_frame" }]
      : undefined,
  });

  const result = await waitForVideo(submit.id, { pollingUrl: submit.polling_url });
  const fileUrl = result.unsigned_urls?.[0] ?? result.signed_urls?.[0];
  if (!fileUrl) throw new Error("Video response had no URL");

  const dir = await ensureProjectDir(project.id, block.id);
  const rawPath = path.join(dir, "video_raw.mp4");
  const finalPath = path.join(dir, "video.mp4");
  const scenePath = path.join(dir, "scene_audio.m4a");

  await downloadToFile(fileUrl, project.id, block.id, "video_raw.mp4", { withAuth: true });

  let sceneAudioReady = false;

  if (hasFfmpeg()) {
    // Extract scene audio (ambient/character voice from the AI clip) before fitting,
    // so we keep the original audio untouched even if the video gets trimmed/looped.
    sceneAudioReady = await extractAudioFromVideo(rawPath, scenePath).catch(() => false);
    await fitVideoToDuration(rawPath, finalPath, targetDuration);
    await fs.unlink(rawPath).catch(() => {});
  } else {
    await fs.rename(rawPath, finalPath);
    let actualDuration = 0;
    try {
      actualDuration = await getMediaDurationSeconds(finalPath);
    } catch {
      actualDuration = clipDuration;
    }
    const expected = Math.min(targetDuration, SEEDANCE_MAX_DURATION);
    if (Math.abs(actualDuration - expected) > 0.75) {
      throw new Error(
        `Video is ${actualDuration.toFixed(1)}s but narration needs ~${targetDuration.toFixed(1)}s ` +
          `(clip target: ${expected.toFixed(1)}s). Install ffmpeg, then regenerate.`,
      );
    }
  }

  return {
    videoUrl: withCacheBuster(publicUrlFor(finalPath)),
    durationSeconds: ceilBlockDurationSeconds(targetDuration),
    sceneAudioUrl: sceneAudioReady ? withCacheBuster(publicUrlFor(scenePath)) : null,
  };
}
