import type { StoryBlock } from "@/lib/db/schema";

export type BlockMediaField = "keyframe" | "video" | "audio" | "sceneAudio";

export function blockStatusAfterClearingMedia(
  block: StoryBlock,
  field: BlockMediaField,
): StoryBlock["status"] {
  const keyframeUrl = field === "keyframe" ? null : block.keyframeUrl;
  const videoUrl = field === "video" ? null : block.videoUrl;
  const audioUrl = field === "audio" ? null : block.audioUrl;
  const sceneAudioUrl =
    field === "video" || field === "sceneAudio" ? null : block.sceneAudioUrl;

  if (videoUrl && audioUrl) return "ready";
  if (videoUrl) return "video_ready";
  if (audioUrl) return "audio_ready";
  if (keyframeUrl) return "image_ready";
  return "draft";
}

export function patchAfterClearingMedia(
  block: StoryBlock,
  field: BlockMediaField,
): Partial<StoryBlock> {
  const base: Partial<StoryBlock> = {
    errorMessage: null,
    status: blockStatusAfterClearingMedia(block, field),
  };

  switch (field) {
    case "keyframe":
      return { ...base, keyframeUrl: null };
    case "video":
      return {
        ...base,
        videoUrl: null,
        sceneAudioUrl: null,
        videoJobId: null,
        videoPollingUrl: null,
        stockVideoId: null,
      };
    case "audio":
      return { ...base, audioUrl: null };
    case "sceneAudio":
      return { ...base, sceneAudioUrl: null };
  }
}

export function mediaUrlForField(
  block: StoryBlock,
  field: BlockMediaField,
): string | null {
  switch (field) {
    case "keyframe":
      return block.keyframeUrl;
    case "video":
      return block.videoUrl;
    case "audio":
      return block.audioUrl;
    case "sceneAudio":
      return block.sceneAudioUrl;
  }
}
