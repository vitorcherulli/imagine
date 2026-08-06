import type { StoryBlock } from "@/lib/db/schema";

export const TIMELINE_HISTORY_LIMIT = 20;

export function cloneBlocksSnapshot(blocks: StoryBlock[]): StoryBlock[] {
  return blocks.map((block) => ({ ...block }));
}

/** Fields restored when syncing timeline undo/redo to the server. */
export const BLOCK_SYNC_FIELDS = [
  "position",
  "segmentType",
  "narrativeText",
  "visualPrompt",
  "locationTag",
  "durationSeconds",
  "narrationGroupId",
  "keyframeUrl",
  "keyframeAiModel",
  "videoUrl",
  "videoAiModel",
  "videoJobId",
  "videoPollingUrl",
  "audioUrl",
  "narrationAiModel",
  "audioVolume",
  "sceneAudioUrl",
  "sceneAudioAiModel",
  "sceneAudioVolume",
  "avatarId",
  "characterName",
  "status",
  "errorMessage",
  "videoTimelineStart",
  "narrationTimelineStart",
  "sceneTimelineStart",
  "videoShotCount",
  "videoCameraAngle",
  "keyframeFitMode",
] as const satisfies readonly (keyof StoryBlock)[];

export type BlockSyncField = (typeof BLOCK_SYNC_FIELDS)[number];

export function pickBlockSyncFields(block: StoryBlock): Pick<StoryBlock, BlockSyncField> {
  return {
    position: block.position,
    segmentType: block.segmentType,
    narrativeText: block.narrativeText,
    visualPrompt: block.visualPrompt,
    locationTag: block.locationTag ?? null,
    durationSeconds: block.durationSeconds,
    narrationGroupId: block.narrationGroupId ?? null,
    keyframeUrl: block.keyframeUrl ?? null,
    keyframeAiModel: block.keyframeAiModel ?? null,
    videoUrl: block.videoUrl ?? null,
    videoAiModel: block.videoAiModel ?? null,
    videoJobId: block.videoJobId ?? null,
    videoPollingUrl: block.videoPollingUrl ?? null,
    audioUrl: block.audioUrl ?? null,
    narrationAiModel: block.narrationAiModel ?? null,
    audioVolume: block.audioVolume,
    sceneAudioUrl: block.sceneAudioUrl ?? null,
    sceneAudioAiModel: block.sceneAudioAiModel ?? null,
    sceneAudioVolume: block.sceneAudioVolume,
    avatarId: block.avatarId ?? null,
    characterName: block.characterName ?? null,
    status: block.status,
    errorMessage: block.errorMessage ?? null,
    videoTimelineStart: block.videoTimelineStart ?? null,
    narrationTimelineStart: block.narrationTimelineStart ?? null,
    sceneTimelineStart: block.sceneTimelineStart ?? null,
    videoShotCount: block.videoShotCount ?? 1,
    videoCameraAngle: block.videoCameraAngle ?? "auto",
    keyframeFitMode: block.keyframeFitMode ?? "cover",
  };
}

export function serializeBlocksForSync(blocks: StoryBlock[]): StoryBlock[] {
  return cloneBlocksSnapshot(blocks).map((block, index) => ({
    ...block,
    position: index,
  }));
}
