import { openRouterFetch } from "@/lib/openrouter/client";
import {
  catalogFallback,
  isVideoEditModel,
  PERSON_SWAP_MODELS,
  type CatalogModel,
  type CatalogModelKind,
} from "@/lib/model-catalog";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type RawImageModel = {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  supported_parameters?: {
    resolution?: { values?: string[] };
    aspect_ratio?: { values?: string[] };
    input_references?: { max?: number };
  };
};

type RawVideoModel = {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  supported_resolutions?: string[] | null;
  supported_aspect_ratios?: string[] | null;
  supported_durations?: number[] | null;
  supported_frame_images?: string[] | null;
  pricing_skus?: Record<string, string> | null;
};

const cache = new Map<CatalogModelKind, { at: number; models: CatalogModel[] }>();

function splitName(id: string, name?: string): { label: string; provider: string } {
  const raw = name?.trim() || id;
  const idx = raw.indexOf(": ");
  if (idx > 0) return { provider: raw.slice(0, idx), label: raw.slice(idx + 2) };
  return { provider: id.split("/")[0] ?? "", label: raw };
}

function videoPriceHint(skus?: Record<string, string> | null): string | null {
  if (!skus) return null;
  const dollars = (key: string) => (skus[key] !== undefined ? Number(skus[key]) : NaN);
  const candidates = [
    dollars("duration_seconds_720p"),
    dollars("duration_seconds_without_audio_720p"),
    dollars("duration_seconds_without_audio"),
    dollars("duration_seconds"),
    dollars("image_to_video_duration_seconds_720p"),
    dollars("duration_seconds_768p"),
    dollars("cents_per_second_output_720p") / 100,
    dollars("cents_per_second_output") / 100,
    dollars("cents_per_video_output_second_720p") / 100,
  ];
  const perSecond = candidates.find((n) => Number.isFinite(n) && n > 0);
  return perSecond ? `~$${perSecond.toFixed(2)}/s` : null;
}

function mapImage(m: RawImageModel): CatalogModel {
  const p = m.supported_parameters ?? {};
  return {
    value: m.id,
    ...splitName(m.id, m.name),
    created: m.created ?? 0,
    description: m.description?.slice(0, 240),
    maxReferences: p.input_references?.max ?? 0,
    resolutions: p.resolution?.values ?? null,
    aspectRatios: p.aspect_ratio?.values?.filter((a) => a !== "auto") ?? null,
  };
}

function mapVideo(m: RawVideoModel): CatalogModel {
  return {
    value: m.id,
    ...splitName(m.id, m.name),
    created: m.created ?? 0,
    description: m.description?.slice(0, 240),
    priceHint: videoPriceHint(m.pricing_skus),
    resolutions: m.supported_resolutions ?? null,
    aspectRatios: m.supported_aspect_ratios ?? null,
    durations: m.supported_durations ?? null,
    frameImages: m.supported_frame_images ?? null,
    videoInput: isVideoEditModel(m.id, m.pricing_skus),
  };
}

async function fetchCatalog(kind: CatalogModelKind): Promise<CatalogModel[]> {
  const res = await openRouterFetch(kind === "image" ? "/images/models" : "/videos/models", {
    method: "GET",
  });
  if (!res.ok) throw new Error(`OpenRouter ${kind} catalog ${res.status}`);
  const json = (await res.json()) as { data?: unknown[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  const models =
    kind === "image"
      ? (rows as RawImageModel[]).map(mapImage)
      : (rows as RawVideoModel[]).map(mapVideo);
  return models.sort((a, b) => b.created - a.created);
}

/** All OpenRouter image or video models (cached). Falls back to the built-in list offline. */
export async function getModelCatalog(kind: CatalogModelKind): Promise<CatalogModel[]> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.models;
  try {
    const models = await fetchCatalog(kind);
    if (models.length > 0) {
      cache.set(kind, { at: Date.now(), models });
      return models;
    }
  } catch (err) {
    console.warn(`[models] could not load ${kind} catalog`, err);
  }
  return hit?.models ?? catalogFallback(kind);
}

export async function getCatalogModel(
  kind: CatalogModelKind,
  id: string,
): Promise<CatalogModel | null> {
  return (await getModelCatalog(kind)).find((m) => m.value === id) ?? null;
}

/** Models usable for "variations" (need a reference image) and image-to-video (need a first frame). */
export function filterVariationCapable(kind: CatalogModelKind, models: CatalogModel[]): CatalogModel[] {
  if (kind === "image") {
    return models.filter((m) => m.maxReferences === undefined || m.maxReferences === null || m.maxReferences >= 1);
  }
  return models.filter((m) => m.created === 0 || m.frameImages?.includes("first_frame"));
}

/** Video editors for Person swap: curated descriptions first, then any other video-input model. */
export function filterSwapCapable(models: CatalogModel[]): CatalogModel[] {
  const live = new Map(models.filter((m) => m.videoInput).map((m) => [m.value, m]));
  if (live.size === 0) return PERSON_SWAP_MODELS;
  const curated = PERSON_SWAP_MODELS.filter((m) => live.has(m.value)).map((m) => ({
    ...live.get(m.value)!,
    description: m.description,
    priceHint: live.get(m.value)!.priceHint ?? m.priceHint,
  }));
  const rest = [...live.values()].filter((m) => !PERSON_SWAP_MODELS.some((c) => c.value === m.value));
  return [...curated, ...rest];
}
