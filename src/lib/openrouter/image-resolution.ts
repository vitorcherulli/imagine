import type { ExportResolutionId } from "@/lib/export-resolutions";

/** OpenRouter / Kling minimum first-frame area (2560×1440, 1440×2560, 1920×1920, …). */
export const MIN_VIDEO_PROVIDER_FRAME_PIXELS = 3_686_400;

export type OpenRouterImageSize = "1K" | "2K" | "4K";

/** Default for AI image generation — 1K is below provider minimums for video pipelines. */
export const DEFAULT_IMAGE_GENERATION_SIZE: OpenRouterImageSize = "2K";

/** Keyframe stills are stored at 1440p so image-to-video inputs meet provider minimums. */
export const KEYFRAME_CANVAS_RESOLUTION: ExportResolutionId = "1440p";

const SIZE_RANK: Record<OpenRouterImageSize, number> = { "1K": 1, "2K": 2, "4K": 3 };

/** Seedream rejects 1K/2K — provider minimum is 3686400 px (~2560×1440), only 4K satisfies it. */
export function imageModelMinimumGenerationSize(model: string): OpenRouterImageSize {
  if (model.startsWith("bytedance-seed/seedream")) return "4K";
  return DEFAULT_IMAGE_GENERATION_SIZE;
}

/** Models that do not accept 4K on OpenRouter Images API. */
export function imageModelMaximumGenerationSize(model: string): OpenRouterImageSize | null {
  if (model.startsWith("x-ai/grok-imagine-image")) return "2K";
  return null;
}

/** Pick a resolution slug the model accepts (respects per-model min/max). */
export function resolveImageGenerationSize(
  model: string,
  requested?: OpenRouterImageSize | null,
): OpenRouterImageSize {
  const minSize = imageModelMinimumGenerationSize(model);
  const maxSize = imageModelMaximumGenerationSize(model);
  let size = requested ?? minSize;
  if (SIZE_RANK[size] < SIZE_RANK[minSize]) size = minSize;
  if (maxSize && SIZE_RANK[size] > SIZE_RANK[maxSize]) size = maxSize;
  return size;
}

/** Smallest width×height with the given aspect ratio and at least `minPixels`. Dimensions are even. */
export function minDimensionsForAspectRatio(
  aspectRatio: string,
  minPixels: number = MIN_VIDEO_PROVIDER_FRAME_PIXELS,
): { width: number; height: number } {
  const [rawW, rawH] = aspectRatio.split(":").map((n) => Number(n.trim()));
  const rw = rawW > 0 ? rawW : 16;
  const rh = rawH > 0 ? rawH : 9;

  let height = Math.ceil(Math.sqrt((minPixels * rh) / rw));
  let width = Math.ceil((height * rw) / rh);
  while (width * height < minPixels) {
    height += 1;
    width = Math.ceil((height * rw) / rh);
  }

  width += width % 2;
  height += height % 2;
  if (width * height < minPixels) {
    height += 2;
    width = Math.ceil((height * rw) / rh);
    width += width % 2;
  }

  return { width, height };
}

export function isImageSizeBelowProviderMinimum(
  width: number,
  height: number,
  minPixels: number = MIN_VIDEO_PROVIDER_FRAME_PIXELS,
): boolean {
  return width <= 0 || height <= 0 || width * height < minPixels;
}
