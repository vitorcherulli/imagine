export type ThumbnailMode = "with_title" | "image_only";

export const THUMBNAIL_MODE_OPTIONS: Array<{
  value: ThumbnailMode;
  label: string;
  description: string;
}> = [
  {
    value: "with_title",
    label: "With title",
    description: "Cover art with large readable text (ideal for YouTube and Reels).",
  },
  {
    value: "image_only",
    label: "Image only",
    description: "Pure visual art — no words or typography in the image.",
  },
];

export function isThumbnailMode(value: unknown): value is ThumbnailMode {
  return value === "with_title" || value === "image_only";
}

export function normalizeThumbnailMode(value: unknown): ThumbnailMode {
  return isThumbnailMode(value) ? value : "with_title";
}

/** Adjust the LLM thumbnail prompt before sending to the image model. */
export function finalizeThumbnailImagePrompt(
  basePrompt: string,
  mode: ThumbnailMode,
  selectedTitle?: string | null,
): string {
  if (mode === "image_only") {
    return `${basePrompt} CRITICAL: absolutely no text, typography, words, letters, logos or captions anywhere in the image — pure cinematic cover art only.`;
  }
  const headline = selectedTitle?.trim();
  if (headline) {
    return `${basePrompt} Prominent large bold readable headline typography: "${headline.slice(0, 80)}".`;
  }
  return `${basePrompt} Include large bold readable headline typography for a short catchy title.`;
}
