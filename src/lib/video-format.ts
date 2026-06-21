export type VideoFormat = "horizontal" | "vertical";

export interface VideoFormatSpec {
  id: VideoFormat;
  label: string;
  shortLabel: string;
  description: string;
  aspectRatio: "16:9" | "9:16";
  previewAspectClass: string;
  /** Keeps vertical preview phone-sized instead of stretching full column width. */
  previewContainerClass: string;
  cardAspectClass: string;
  thumbnailSizeLabel: string;
  platformHint: string;
  timelineVideoRowHeight: number;
  timelineThumbClass: string;
}

export const VIDEO_FORMATS: Record<VideoFormat, VideoFormatSpec> = {
  horizontal: {
    id: "horizontal",
    label: "YouTube (horizontal)",
    shortLabel: "16:9",
    description: "Traditional videos for YouTube, desktop and TV.",
    aspectRatio: "16:9",
    previewAspectClass: "aspect-video",
    previewContainerClass: "w-full max-w-full",
    cardAspectClass: "aspect-video",
    thumbnailSizeLabel: "1280×720",
    platformHint: "YouTube",
    timelineVideoRowHeight: 64,
    timelineThumbClass: "aspect-video h-full max-h-12 w-auto min-w-[48px]",
  },
  vertical: {
    id: "vertical",
    label: "Reels / Shorts (vertical)",
    shortLabel: "9:16",
    description: "Vertical content for Reels, Shorts, TikTok and Stories.",
    aspectRatio: "9:16",
    previewAspectClass: "aspect-[9/16]",
    previewContainerClass: "mx-auto w-full max-w-[240px]",
    cardAspectClass: "aspect-[9/16]",
    thumbnailSizeLabel: "1080×1920",
    platformHint: "Reels · Shorts · Instagram · TikTok",
    timelineVideoRowHeight: 120,
    timelineThumbClass: "aspect-[9/16] h-full max-h-[104px] w-auto min-w-[58px]",
  },
};

export function isVideoFormat(value: unknown): value is VideoFormat {
  return value === "horizontal" || value === "vertical";
}

export function normalizeVideoFormat(value: unknown): VideoFormat {
  return isVideoFormat(value) ? value : "horizontal";
}

export function getVideoFormatSpec(value: unknown): VideoFormatSpec {
  return VIDEO_FORMATS[normalizeVideoFormat(value)];
}

export function getAspectRatio(value: unknown): "16:9" | "9:16" {
  return getVideoFormatSpec(value).aspectRatio;
}

/** Framing hint injected into story/visual prompts. */
export function getVisualFramingHint(value: unknown): string {
  const spec = getVideoFormatSpec(value);
  if (spec.id === "vertical") {
    return "Vertical 9:16 mobile framing — portrait composition, subject centered, safe margins for phone UI overlays.";
  }
  return "Horizontal 16:9 cinematic widescreen framing.";
}
