import { isModelId } from "@/lib/model-catalog";

export const VARIATION_ASPECTS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type VariationAspect = (typeof VARIATION_ASPECTS)[number];

export const VARIATION_ASPECT_LABELS: Record<VariationAspect, string> = {
  "1:1": "Square 1:1",
  "4:5": "Feed 4:5",
  "9:16": "Story 9:16",
  "16:9": "Wide 16:9",
};

export const VARIATION_COUNTS = [1, 2, 4, 6] as const;
export const MAX_VARIATIONS_PER_REQUEST = 6;

export const ORIGINAL_DIRECTION = "original";
export const VARIATIONS_GALLERY_FOLDER = "Variations";

export const VARIATION_TEXT_MODES = ["keep", "rewrite", "custom"] as const;
export type VariationTextMode = (typeof VARIATION_TEXT_MODES)[number];

export const VARIATION_TEXT_MODE_LABELS: Record<VariationTextMode, string> = {
  keep: "Keep text",
  rewrite: "New headline (AI)",
  custom: "My text",
};

export function normalizeVariationTextMode(value: unknown): VariationTextMode {
  return (VARIATION_TEXT_MODES as readonly unknown[]).includes(value) ? (value as VariationTextMode) : "keep";
}

export type VariationItemStatus = "generating" | "ready" | "error";
export type VariationVideoStatus = "generating" | "ready" | "error";

/** Creative directions cycled across variations so each one looks different. */
export const VARIATION_DIRECTIONS = [
  { label: "New setting", prompt: "a new background and setting that suits the product" },
  { label: "New angle", prompt: "a different camera angle and composition" },
  { label: "New colors", prompt: "a different color palette and lighting mood" },
  { label: "Lifestyle", prompt: "a lifestyle scene showing the product in use" },
  { label: "Minimal", prompt: "a minimal, clean studio layout with lots of negative space" },
  { label: "Bold", prompt: "a bold, high-contrast, scroll-stopping layout" },
  { label: "Close-up", prompt: "a close-up hero shot that highlights the product details" },
  { label: "Premium", prompt: "a premium, elegant look with refined materials and soft light" },
] as const;

export function variationDirectionLabel(direction: string | null): string {
  if (direction === ORIGINAL_DIRECTION) return "Original";
  return VARIATION_DIRECTIONS.find((d) => d.prompt === direction)?.label ?? "Variation";
}

export function closestVariationAspect(width: number, height: number): VariationAspect {
  if (!width || !height) return "1:1";
  const ratio = width / height;
  const targets: [VariationAspect, number][] = [
    ["1:1", 1],
    ["4:5", 0.8],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
  ];
  let best = targets[0];
  for (const t of targets) {
    if (Math.abs(Math.log(ratio / t[1])) < Math.abs(Math.log(ratio / best[1]))) best = t;
  }
  return best[0];
}

/** Any OpenRouter model id — the live catalog decides what's available. */
export function isVariationImageModel(value: unknown): value is string {
  return isModelId(value);
}

export function isVariationVideoModel(value: unknown): value is string {
  return isModelId(value);
}

export const VARIATION_MODEL_STORAGE_KEYS = {
  image: "imagine:variations:imageModel",
  video: "imagine:variations:videoModel",
} as const;

export function isVariationAspect(value: unknown): value is VariationAspect {
  return typeof value === "string" && (VARIATION_ASPECTS as readonly string[]).includes(value);
}
