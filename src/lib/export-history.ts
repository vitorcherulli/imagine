import {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  isExportResolutionId,
  resolveExportResolution,
  type ExportResolutionId,
} from "./export-resolutions";
import type { Export } from "./db/schema";
import { normalizeVideoFormat } from "./video-format";

export interface ProjectExportItem {
  id: string;
  version: number;
  status: Export["status"];
  finalVideoUrl: string | null;
  resolution: ExportResolutionId | null;
  resolutionLabel: string;
  downloadFilename: string;
  createdAt: string;
  errorMessage: string | null;
}

export function sanitizeExportFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "export";
}

export function exportStorageFilename(exportId: string): string {
  return `exports/${exportId}.mp4`;
}

export function buildExportDownloadFilename(
  projectTitle: string,
  version: number,
  resolution: ExportResolutionId | null,
): string {
  const base = sanitizeExportFilename(projectTitle);
  const res = resolution ?? DEFAULT_EXPORT_RESOLUTION;
  return `${base}-v${version}-${res}.mp4`;
}

export function resolutionLabelForExport(
  resolution: string | null | undefined,
  videoFormat: unknown,
): string {
  const id = isExportResolutionId(resolution) ? resolution : DEFAULT_EXPORT_RESOLUTION;
  return resolveExportResolution(id, normalizeVideoFormat(videoFormat)).label;
}

export function buildProjectExportItems(
  rows: Export[],
  projectTitle: string,
  videoFormat: unknown,
): ProjectExportItem[] {
  const chronological = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const versionById = new Map(chronological.map((row, index) => [row.id, index + 1]));

  return [...rows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((row) => {
      const version = versionById.get(row.id) ?? 1;
      const resolution = isExportResolutionId(row.resolution) ? row.resolution : null;
      return {
        id: row.id,
        version,
        status: row.status,
        finalVideoUrl: row.finalVideoUrl,
        resolution,
        resolutionLabel: resolutionLabelForExport(row.resolution, videoFormat),
        downloadFilename: buildExportDownloadFilename(projectTitle, version, resolution),
        createdAt: new Date(row.createdAt).toISOString(),
        errorMessage: row.errorMessage,
      };
    });
}

export function exportResolutionOptionLabel(id: ExportResolutionId): string {
  return EXPORT_RESOLUTIONS[id].label;
}

export async function fetchProjectExports(projectId: string): Promise<ProjectExportItem[]> {
  const res = await fetch(`/api/projects/${projectId}/exports`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { exports?: ProjectExportItem[] };
  return data.exports ?? [];
}
