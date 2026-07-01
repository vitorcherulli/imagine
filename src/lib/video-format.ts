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
  /** Taller row for keyframe stills. */
  timelineKeyframeRowHeight: number;
  timelineKeyframeThumbClass: string;
  /** Compact video strip (default height; user can resize in timeline). */
  timelineVideoTrackHeight: number;
  timelineVideoThumbClass: string;
  /** @deprecated use timelineKeyframeRowHeight */
  timelineVideoRowHeight: number;
  /** @deprecated use timelineKeyframeThumbClass */
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
    timelineKeyframeRowHeight: 64,
    timelineKeyframeThumbClass: "aspect-video h-full max-h-12 w-auto min-w-[48px]",
    timelineVideoTrackHeight: 44,
    timelineVideoThumbClass: "aspect-video h-full w-full min-h-0",
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
    timelineKeyframeRowHeight: 120,
    timelineKeyframeThumbClass: "aspect-[9/16] h-full max-h-[104px] w-auto min-w-[58px]",
    timelineVideoTrackHeight: 52,
    timelineVideoThumbClass: "aspect-[9/16] h-full max-h-full w-auto min-w-[36px]",
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

/** Largest 16:9 or 9:16 rect that fits inside a container (for preview player). */
export function fitPreviewFrameSize(
  containerWidth: number,
  containerHeight: number,
  format: VideoFormat,
): { width: number; height: number } {
  const spec = VIDEO_FORMATS[normalizeVideoFormat(format)];
  const cw = Math.max(0, containerWidth);
  const ch = Math.max(0, containerHeight);
  if (cw === 0 || ch === 0) {
    return spec.id === "vertical" ? { width: 240, height: 427 } : { width: 640, height: 360 };
  }

  const aspect = spec.id === "vertical" ? 9 / 16 : 16 / 9;
  let width = Math.min(cw, ch * aspect);
  let height = width / aspect;

  if (spec.id === "vertical") {
    const maxWidth = Math.min(320, cw);
    width = Math.min(width, maxWidth);
    height = width / aspect;
    if (height > ch) {
      height = ch;
      width = height * aspect;
    }
  }

  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };
}
