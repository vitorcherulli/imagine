import {
  resolveExportResolution,
  type ExportResolution,
  type ExportResolutionId,
} from "./export-resolutions";
import type { VideoFormat } from "./video-format";

export type ExportQualityId = "youtube" | "high" | "light";

export interface ExportQualityPreset {
  id: ExportQualityId;
  label: string;
  shortLabel: string;
  description: string;
  /** Added to the resolution base CRF (lower = better quality). */
  crfDelta: number;
  presetOverride: string | null;
  audioBitrateKbps: number;
  /** Cap peak video bitrate — used for the YouTube preset. */
  useYoutubeBitrateCap: boolean;
}

export const EXPORT_QUALITY_PRESETS: Record<ExportQualityId, ExportQualityPreset> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YouTube",
    description: "Equilíbrio qualidade e tamanho — ideal para upload",
    crfDelta: 0,
    presetOverride: null,
    audioBitrateKbps: 192,
    useYoutubeBitrateCap: true,
  },
  high: {
    id: "high",
    label: "Alta qualidade",
    shortLabel: "Alta",
    description: "Melhor nitidez e áudio — arquivo maior, export mais lento",
    crfDelta: -3,
    presetOverride: "medium",
    audioBitrateKbps: 256,
    useYoutubeBitrateCap: false,
  },
  light: {
    id: "light",
    label: "Arquivo leve",
    shortLabel: "Leve",
    description: "Exporta mais rápido com arquivo menor",
    crfDelta: 6,
    presetOverride: "faster",
    audioBitrateKbps: 128,
    useYoutubeBitrateCap: false,
  },
};

export const DEFAULT_EXPORT_QUALITY: ExportQualityId = "youtube";

/** YouTube-suggested peak bitrates at 30fps (Mbps → kbps). */
const YOUTUBE_MAX_VIDEO_BITRATE_KBPS: Record<ExportResolutionId, number> = {
  "720p": 5_000,
  "1080p": 8_000,
  "1440p": 12_000,
  "2160p": 20_000,
};

export interface ExportEncodingSettings extends ExportResolution {
  qualityId: ExportQualityId;
  qualityLabel: string;
  preset: string;
  crf: number;
  audioBitrateKbps: number;
  maxVideoBitrateKbps: number | null;
}

export function isExportQualityId(id: string | null | undefined): id is ExportQualityId {
  return !!id && id in EXPORT_QUALITY_PRESETS;
}

function clampCrf(value: number): number {
  return Math.min(30, Math.max(15, Math.round(value)));
}

export function resolveExportEncoding(
  resolutionId: ExportResolutionId,
  qualityId: ExportQualityId = DEFAULT_EXPORT_QUALITY,
  videoFormat: VideoFormat | unknown = "horizontal",
): ExportEncodingSettings {
  const base = resolveExportResolution(resolutionId, videoFormat);
  const quality = EXPORT_QUALITY_PRESETS[qualityId];
  const crf = clampCrf(base.crf + quality.crfDelta);
  const preset = quality.presetOverride ?? base.preset;
  const maxVideoBitrateKbps = quality.useYoutubeBitrateCap
    ? YOUTUBE_MAX_VIDEO_BITRATE_KBPS[resolutionId]
    : null;

  return {
    ...base,
    qualityId,
    qualityLabel: quality.label,
    preset,
    crf,
    audioBitrateKbps: quality.audioBitrateKbps,
    maxVideoBitrateKbps,
  };
}

export function exportQualityOptionLabel(id: ExportQualityId): string {
  return EXPORT_QUALITY_PRESETS[id].shortLabel;
}
