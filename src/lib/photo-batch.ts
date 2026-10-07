import { closestVariationAspect, isVariationAspect, type VariationAspect } from "@/lib/variations";

export const PHOTO_BATCH_ASPECTS = ["original", "1:1", "4:5", "9:16", "16:9"] as const;
export type PhotoBatchAspect = (typeof PHOTO_BATCH_ASPECTS)[number];

export const PHOTO_BATCH_ASPECT_LABELS: Record<PhotoBatchAspect, string> = {
  original: "Keep",
  "1:1": "1:1",
  "4:5": "4:5",
  "9:16": "9:16",
  "16:9": "16:9",
};

export const MAX_PHOTOS_PER_BATCH = 50;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const PHOTO_BATCH_GALLERY_FOLDER = "Batch edit";
export const DEFAULT_PHOTO_BATCH_NAME = "New batch";

export type PhotoBatchItemStatus = "idle" | "queued" | "editing" | "ready" | "error";

export function isPhotoBatchBusy(status: string): boolean {
  return status === "queued" || status === "editing";
}

/** One-click instructions; the user can still edit the text afterwards. */
export const PHOTO_BATCH_PRESETS = [
  {
    label: "White studio background",
    prompt: "Replace the background with a clean, seamless white studio background with soft natural shadows.",
  },
  {
    label: "Better light & color",
    prompt: "Improve the lighting, exposure, white balance and colors so it looks like a professional photo. Keep it natural.",
  },
  {
    label: "Remove text & watermarks",
    prompt: "Remove all text, logos overlays, stickers and watermarks that were added on top of the photo. Rebuild what was behind them.",
  },
  {
    label: "Lifestyle scene",
    prompt: "Place the main subject in a bright, realistic lifestyle setting that suits it, with natural light.",
  },
  {
    label: "Blur background",
    prompt: "Keep the main subject sharp and softly blur the background like a portrait lens (shallow depth of field).",
  },
  {
    label: "Clean up",
    prompt: "Remove distractions, dust, stains and clutter from the scene. Keep the main subject untouched.",
  },
] as const;

export function isPhotoBatchAspect(value: unknown): value is PhotoBatchAspect {
  return typeof value === "string" && (PHOTO_BATCH_ASPECTS as readonly string[]).includes(value);
}

/** Output ratio for one photo: the batch format, or the closest supported one to the photo itself. */
export function photoEditAspect(
  batchAspect: string,
  width: number | null,
  height: number | null,
): VariationAspect {
  if (isVariationAspect(batchAspect)) return batchAspect;
  return closestVariationAspect(width ?? 0, height ?? 0);
}

export function editedFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "").trim() || "photo";
  return `${base}-edited.png`;
}
