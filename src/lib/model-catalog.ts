import { IMAGE_MODEL_OPTIONS, VIDEO_MODEL_OPTIONS } from "@/lib/project-api-models";

export type CatalogModelKind = "image" | "video";

export interface CatalogModel {
  value: string;
  label: string;
  provider: string;
  /** Unix seconds; 0 when unknown (built-in fallback list). */
  created: number;
  description?: string;
  priceHint?: string | null;
  /** Image: max reference images accepted (0 = text-to-image only). */
  maxReferences?: number | null;
  resolutions?: string[] | null;
  aspectRatios?: string[] | null;
  /** Video: accepted clip lengths in seconds. */
  durations?: number[] | null;
  frameImages?: string[] | null;
  /** Video: accepts a source clip (video-to-video / edit). */
  videoInput?: boolean;
}

export type CatalogUsage = "variations" | "swap" | "all";

/** Video-to-video editors that re-cast a clip while keeping its motion and background. */
export const PERSON_SWAP_MODELS: CatalogModel[] = [
  {
    value: "runway/aleph-2",
    label: "Aleph 2.0",
    provider: "Runway",
    created: 0,
    priceHint: "~$0.28/s",
    videoInput: true,
    description: "Best quality: keeps the motion, camera and background, swaps only what you ask. Up to 30 s.",
  },
  {
    value: "bytedance/seedance-2.0",
    label: "Seedance 2.0",
    provider: "ByteDance",
    created: 0,
    videoInput: true,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    description: "Good likeness from the reference photos. 4–15 s.",
  },
  {
    value: "bytedance/seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    provider: "ByteDance",
    created: 0,
    videoInput: true,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    description: "Cheaper and faster Seedance. 4–15 s.",
  },
  {
    value: "black-forest-labs/flux-video-edit",
    label: "FLUX Video Edit",
    provider: "Black Forest Labs",
    created: 0,
    priceHint: "~$0.03/s",
    videoInput: true,
    description: "Cheapest, text-only edit (no reference photos). Up to 15 s, 720p.",
  },
];

export const DEFAULT_PERSON_SWAP_MODEL = "runway/aleph-2";

const KNOWN_VIDEO_EDIT_MODELS = new Set(PERSON_SWAP_MODELS.map((m) => m.value));

export function isVideoEditModel(id: string, pricingSkus?: Record<string, string> | null): boolean {
  if (KNOWN_VIDEO_EDIT_MODELS.has(id) || /video-edit|aleph/i.test(id)) return true;
  return Object.keys(pricingSkus ?? {}).some((k) => k.includes("with_video_input"));
}

/** Longest source clip a video editor takes in one pass. */
export function swapMaxSeconds(model: Pick<CatalogModel, "value" | "durations">): number {
  if (model.durations?.length) return Math.max(...model.durations);
  if (/flux-video-edit/i.test(model.value)) return 15;
  return 30;
}

/** Whether a video editor uses reference photos (otherwise only the text prompt guides it). */
export function swapAcceptsReferences(modelId: string): boolean {
  return !/flux-video-edit/i.test(modelId);
}

export const NEW_MODEL_WINDOW_DAYS = 60;

export function isNewCatalogModel(model: Pick<CatalogModel, "created">, now = Date.now()): boolean {
  return model.created > 0 && now / 1000 - model.created < NEW_MODEL_WINDOW_DAYS * 86400;
}

export function catalogFallback(kind: CatalogModelKind, usage?: CatalogUsage): CatalogModel[] {
  if (kind === "video" && usage === "swap") return PERSON_SWAP_MODELS;
  const options = kind === "image" ? IMAGE_MODEL_OPTIONS : VIDEO_MODEL_OPTIONS;
  return options.map((o) => ({
    value: o.value,
    label: o.label,
    provider: o.value.split("/")[0] ?? "",
    created: 0,
  }));
}

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function isModelId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && MODEL_ID_RE.test(value);
}

function ratioOf(value: string): number | null {
  const [w, h] = value.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

/** Closest aspect ratio a model accepts (falls back to the requested one when unknown). */
export function closestSupportedAspect(requested: string, supported?: string[] | null): string {
  const target = ratioOf(requested);
  const candidates = (supported ?? []).filter((a) => ratioOf(a) !== null);
  if (!target || candidates.length === 0 || candidates.includes(requested)) return requested;
  return candidates.reduce((best, a) =>
    Math.abs(Math.log(ratioOf(a)! / target)) < Math.abs(Math.log(ratioOf(best)! / target)) ? a : best,
  );
}

export function closestSupportedDuration(requested: number, supported?: number[] | null): number | null {
  if (!supported?.length) return null;
  return supported.reduce((best, d) => (Math.abs(d - requested) < Math.abs(best - requested) ? d : best));
}

/** Prefer 720p for clips (cost/speed), otherwise the closest offered resolution. */
export function preferredVideoResolution(supported?: string[] | null): string {
  if (!supported?.length) return "720p";
  if (supported.includes("720p")) return "720p";
  const px = (r: string) => (r.toUpperCase().endsWith("K") ? Number(r.slice(0, -1)) * 1000 : parseInt(r, 10));
  return supported.reduce((best, r) => (Math.abs(px(r) - 720) < Math.abs(px(best) - 720) ? r : best));
}

/** Prefer 2K stills; omit the parameter when the model doesn't expose resolutions. */
export function preferredImageResolution(supported?: string[] | null): string | null {
  if (!supported?.length) return null;
  for (const r of ["2K", "1.5K", "4K", "1K"]) if (supported.includes(r)) return r;
  return supported[supported.length - 1] ?? null;
}
