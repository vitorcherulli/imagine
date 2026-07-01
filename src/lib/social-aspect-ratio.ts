export type SocialAspectRatio = "4:5" | "1:1";

export interface SocialAspectRatioSpec {
  id: SocialAspectRatio;
  label: string;
  shortLabel: string;
  description: string;
  /** OpenRouter / image API aspect ratio */
  imageAspectRatio: string;
  previewAspectClass: string;
  cardAspectClass: string;
  width: number;
  height: number;
}

export const SOCIAL_ASPECT_RATIOS: Record<SocialAspectRatio, SocialAspectRatioSpec> = {
  "4:5": {
    id: "4:5",
    label: "Feed portrait (4:5)",
    shortLabel: "4:5",
    description: "Instagram and Facebook feed — recommended for carousels.",
    imageAspectRatio: "4:5",
    previewAspectClass: "aspect-[4/5]",
    cardAspectClass: "aspect-[4/5]",
    width: 1080,
    height: 1350,
  },
  "1:1": {
    id: "1:1",
    label: "Square (1:1)",
    shortLabel: "1:1",
    description: "Classic square post for any platform.",
    imageAspectRatio: "1:1",
    previewAspectClass: "aspect-square",
    cardAspectClass: "aspect-square",
    width: 1080,
    height: 1080,
  },
};

export function isSocialAspectRatio(value: unknown): value is SocialAspectRatio {
  return value === "4:5" || value === "1:1";
}

export function normalizeSocialAspectRatio(value: unknown): SocialAspectRatio {
  return isSocialAspectRatio(value) ? value : "4:5";
}

export function getSocialAspectRatioSpec(value: unknown): SocialAspectRatioSpec {
  return SOCIAL_ASPECT_RATIOS[normalizeSocialAspectRatio(value)];
}

export function getSocialImageAspectRatio(value: unknown): string {
  return getSocialAspectRatioSpec(value).imageAspectRatio;
}

export function getSocialFramingHint(value: unknown): string {
  const spec = getSocialAspectRatioSpec(value);
  if (spec.id === "1:1") {
    return "Square 1:1 composition — centered subject, balanced margins, feed-friendly framing.";
  }
  return "Portrait 4:5 mobile feed framing — strong vertical composition, safe margins for UI overlays.";
}
