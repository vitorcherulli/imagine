import { openRouterFetch } from "./client";
import {
  isVeoVideoModel,
  resolveVideoGenerateAudio,
  type VideoClipAudioMode,
} from "@/lib/project-api-models";
import { formatOpenRouterUsd } from "./usage";

export interface VideoModelPricing {
  id: string;
  name: string;
  pricingSkus: Record<string, string>;
}

export interface VideoCostEstimate {
  model: string;
  durationSeconds: number;
  estimateUsd: number | null;
  label: string;
  note: string;
}

const CACHE_MS = 10 * 60 * 1000;
let pricingCache: { at: number; models: Map<string, VideoModelPricing> } | null = null;

export async function getVideoModelPricingMap(): Promise<Map<string, VideoModelPricing>> {
  const now = Date.now();
  if (pricingCache && now - pricingCache.at < CACHE_MS) return pricingCache.models;

  const res = await openRouterFetch("/videos/models");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter video models error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ id: string; name?: string; pricing_skus?: Record<string, string> }>;
  };

  const models = new Map<string, VideoModelPricing>();
  for (const row of json.data ?? []) {
    if (!row.id) continue;
    models.set(row.id, {
      id: row.id,
      name: row.name ?? row.id,
      pricingSkus: row.pricing_skus ?? {},
    });
  }

  pricingCache = { at: now, models };
  return models;
}

function pickSkuRate(skus: Record<string, string>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = skus[key];
    if (raw == null) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function audioPreference(
  videoClipAudio: VideoClipAudioMode,
  model: string,
): "with" | "without" | "default" {
  const resolved = resolveVideoGenerateAudio(videoClipAudio);
  if (resolved === true) return "with";
  if (resolved === false) return "without";
  return isVeoVideoModel(model) ? "with" : "default";
}

export function estimateVideoClipCost(input: {
  model: string;
  pricingSkus: Record<string, string>;
  durationSeconds: number;
  videoClipAudio: VideoClipAudioMode;
  resolution?: string;
  hasFirstFrame?: boolean;
}): VideoCostEstimate {
  const duration = Math.max(1, Math.round(input.durationSeconds));
  const resolution = (input.resolution ?? "720p").toLowerCase();
  const audio = audioPreference(input.videoClipAudio, input.model);
  const skus = input.pricingSkus;
  const withAudio = audio === "with" || (audio === "default" && isVeoVideoModel(input.model));

  const perSecondKeys: string[] = [];
  if (input.hasFirstFrame) {
    perSecondKeys.push(`image_to_video_duration_seconds_${resolution}`);
  }
  perSecondKeys.push(`text_to_video_duration_seconds_${resolution}`);
  if (withAudio) {
    perSecondKeys.push(
      `duration_seconds_with_audio_${resolution}`,
      "duration_seconds_with_audio",
    );
  } else {
    perSecondKeys.push(
      `duration_seconds_without_audio_${resolution}`,
      "duration_seconds_without_audio",
    );
  }
  perSecondKeys.push(`duration_seconds_${resolution}`, "duration_seconds");

  const perSecond = pickSkuRate(skus, perSecondKeys);
  if (perSecond != null) {
    const estimateUsd = perSecond * duration;
    return {
      model: input.model,
      durationSeconds: duration,
      estimateUsd,
      label: `~${formatOpenRouterUsd(estimateUsd)} / clip de ${duration}s`,
      note: `${formatOpenRouterUsd(perSecond)}/s · estimativa OpenRouter`,
    };
  }

  const grokPerSecondCents = pickSkuRate(skus, [
    `cents_per_video_output_second_${resolution}`,
    "cents_per_video_output_second_720p",
    "cents_per_video_output_second_480p",
  ]);
  if (grokPerSecondCents != null) {
    const perSecUsd = grokPerSecondCents / 100;
    const estimateUsd = perSecUsd * duration;
    return {
      model: input.model,
      durationSeconds: duration,
      estimateUsd,
      label: `~${formatOpenRouterUsd(estimateUsd)} / clip de ${duration}s`,
      note: `${formatOpenRouterUsd(perSecUsd)}/s · estimativa OpenRouter`,
    };
  }

  const tokenRate = pickSkuRate(skus, [
    withAudio ? "video_tokens" : "video_tokens_without_audio",
    "video_tokens_without_audio",
    "video_tokens",
  ]);
  if (tokenRate != null) {
    return {
      model: input.model,
      durationSeconds: duration,
      estimateUsd: null,
      label: "custo real após gerar",
      note: `Seedance cobra por video token (${formatOpenRouterUsd(tokenRate)}/token) — o total depende da duração e resolução`,
    };
  }

  return {
    model: input.model,
    durationSeconds: duration,
    estimateUsd: null,
    label: "preço indisponível",
    note: "Sem tabela de preço para este modelo na OpenRouter",
  };
}

export async function estimateVideoClipCostForModel(input: {
  model: string;
  durationSeconds?: number;
  videoClipAudio: VideoClipAudioMode;
  resolution?: string;
  hasFirstFrame?: boolean;
}): Promise<VideoCostEstimate> {
  const map = await getVideoModelPricingMap();
  const row = map.get(input.model);
  if (!row) {
    return {
      model: input.model,
      durationSeconds: input.durationSeconds ?? 8,
      estimateUsd: null,
      label: "preço indisponível",
      note: "Modelo não encontrado na OpenRouter",
    };
  }
  return estimateVideoClipCost({
    model: input.model,
    pricingSkus: row.pricingSkus,
    durationSeconds: input.durationSeconds ?? 8,
    videoClipAudio: input.videoClipAudio,
    resolution: input.resolution,
    hasFirstFrame: input.hasFirstFrame,
  });
}
