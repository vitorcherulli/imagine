import { createId } from "@paralleldrive/cuid2";
import type { StoryBlock } from "@/lib/db/schema";
import { isVisualCutOnly } from "@/lib/cut-pace";
import { isStoryBlockPause } from "@/lib/script-pause";
import { readMediaBuffer, saveBuffer, withCacheBuster } from "@/lib/storage";

function filenameFromUrl(url: string, fallback: string): string {
  const base = url.split("?")[0]?.split("/").pop()?.trim();
  if (!base || base.length > 120) return fallback;
  return base;
}

async function copyBlockMediaUrl(
  projectId: string,
  newBlockId: string,
  url: string | null | undefined,
  fallbackFilename: string,
): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const buf = await readMediaBuffer(url);
    const filename = filenameFromUrl(url, fallbackFilename);
    return withCacheBuster(await saveBuffer(projectId, newBlockId, filename, buf));
  } catch {
    return null;
  }
}

function nextSpeechNarrationGroupId(blocks: StoryBlock[]): string {
  let max = 0;
  for (const block of blocks) {
    const match = /^n(\d+)$/i.exec(block.narrationGroupId?.trim() ?? "");
    if (match) max = Math.max(max, Number.parseInt(match[1]!, 10));
  }
  return `n${max + 1}`;
}

function nextPauseNarrationGroupId(blocks: StoryBlock[]): string {
  let max = 0;
  for (const block of blocks) {
    const match = /^pause(\d+)$/i.exec(block.narrationGroupId?.trim() ?? "");
    if (match) max = Math.max(max, Number.parseInt(match[1]!, 10));
  }
  return `pause${max + 1}`;
}

export function resolveDuplicateNarrationGroupId(
  source: StoryBlock,
  blocks: StoryBlock[],
): string | null {
  if (isStoryBlockPause(source)) {
    return nextPauseNarrationGroupId(blocks);
  }
  if (isVisualCutOnly(source)) {
    return source.narrationGroupId?.trim() || null;
  }
  if (source.narrationGroupId?.trim() || source.narrativeText.trim() || source.audioUrl) {
    return nextSpeechNarrationGroupId(blocks);
  }
  return source.narrationGroupId?.trim() || null;
}

export async function buildDuplicateStoryBlock(input: {
  projectId: string;
  source: StoryBlock;
  insertAt: number;
  allBlocks: StoryBlock[];
}): Promise<StoryBlock> {
  const { projectId, source, insertAt, allBlocks } = input;
  const newId = createId();
  const now = new Date();
  const copyAudio = Boolean(source.audioUrl?.trim()) && !isVisualCutOnly(source);

  const [keyframeUrl, videoUrl, audioUrl, sceneAudioUrl] = await Promise.all([
    copyBlockMediaUrl(projectId, newId, source.keyframeUrl, "keyframe.jpg"),
    copyBlockMediaUrl(projectId, newId, source.videoUrl, "video.mp4"),
    copyAudio
      ? copyBlockMediaUrl(projectId, newId, source.audioUrl, "narration.mp3")
      : Promise.resolve(null),
    copyBlockMediaUrl(projectId, newId, source.sceneAudioUrl, "scene_audio.m4a"),
  ]);

  return {
    id: newId,
    projectId,
    position: insertAt,
    segmentType: source.segmentType,
    narrativeText: isVisualCutOnly(source) ? "" : source.narrativeText,
    visualPrompt: source.visualPrompt,
    locationTag: source.locationTag ?? null,
    durationSeconds: source.durationSeconds,
    narrationGroupId: resolveDuplicateNarrationGroupId(source, allBlocks),
    keyframeUrl,
    videoUrl,
    videoJobId: null,
    videoPollingUrl: null,
    audioUrl,
    audioVolume: source.audioVolume,
    sceneAudioUrl,
    sceneAudioVolume: source.sceneAudioVolume,
    videoTimelineStart: null,
    narrationTimelineStart: null,
    sceneTimelineStart: null,
    videoShotCount: source.videoShotCount ?? 1,
    keyframeFitMode: source.keyframeFitMode ?? "cover",
    stockVideoId: source.stockVideoId ?? null,
    openRouterCostUsd: null,
    avatarId: source.avatarId ?? null,
    characterName: source.characterName ?? null,
    status: source.status,
    errorMessage: source.errorMessage ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
