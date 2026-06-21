import { normalizeVideoFormat, type VideoFormat } from "./video-format";

export type ExportResolutionId = "720p" | "1080p" | "1440p" | "2160p";

export interface ExportResolution {
  id: ExportResolutionId;
  width: number;
  height: number;
  label: string;
  /** Constant Rate Factor — lower = better quality, larger files. */
  crf: number;
  preset: string;
}

export const EXPORT_RESOLUTIONS: Record<ExportResolutionId, ExportResolution> = {
  "720p": { id: "720p", width: 1280, height: 720, label: "HD 720p", crf: 22, preset: "veryfast" },
  "1080p": { id: "1080p", width: 1920, height: 1080, label: "Full HD 1080p", crf: 20, preset: "veryfast" },
  "1440p": { id: "1440p", width: 2560, height: 1440, label: "QHD 1440p", crf: 19, preset: "medium" },
  "2160p": { id: "2160p", width: 3840, height: 2160, label: "4K 2160p", crf: 18, preset: "medium" },
};

export const DEFAULT_EXPORT_RESOLUTION: ExportResolutionId = "1080p";

export function isExportResolutionId(id: string | null | undefined): id is ExportResolutionId {
  return !!id && id in EXPORT_RESOLUTIONS;
}

/** Maps 720p/1080p/etc. to pixel dimensions for horizontal or vertical output. */
export function resolveExportResolution(
  id: ExportResolutionId,
  videoFormat: VideoFormat | unknown = "horizontal",
): ExportResolution {
  const base = EXPORT_RESOLUTIONS[id];
  if (normalizeVideoFormat(videoFormat) === "vertical") {
    return {
      ...base,
      width: base.height,
      height: base.width,
      label: `${base.label} vertical`,
    };
  }
  return base;
}
