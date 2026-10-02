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
}

export const NEW_MODEL_WINDOW_DAYS = 60;

export function isNewCatalogModel(model: Pick<CatalogModel, "created">, now = Date.now()): boolean {
  return model.created > 0 && now / 1000 - model.created < NEW_MODEL_WINDOW_DAYS * 86400;
}

export function catalogFallback(kind: CatalogModelKind): CatalogModel[] {
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
