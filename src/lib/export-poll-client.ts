"use client";

import type { ExportProgressUiState } from "@/components/ExportProgressPanel";

const POLL_MS = 1000;
const MAX_POLL_MS = 15 * 60 * 1000;

export interface ExportPollResult {
  exportId: string;
  status: string;
  progressPercent: number;
  progressStage: string | null;
  progressMessage: string | null;
  errorMessage: string | null;
  finalVideoUrl: string | null;
  resolutionLabel?: string;
  qualityLabel?: string;
  version?: number;
  downloadFilename?: string | null;
  warnings?: string[];
}

export async function pollProjectExport(
  projectId: string,
  exportId: string,
  onProgress: (progress: ExportProgressUiState) => void,
  startedAtMs: number,
): Promise<ExportPollResult> {
  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    const res = await fetch(`/api/projects/${projectId}/exports/${exportId}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as ExportPollResult & {
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error ?? `Export status failed (${res.status})`);
    }

    onProgress({
      exportId,
      percent: data.progressPercent ?? 0,
      stage: data.progressStage ?? null,
      message: data.progressMessage ?? null,
      startedAtMs,
    });

    if (data.status === "done") return data;
    if (data.status === "error") {
      throw new Error(data.errorMessage ?? "Export failed");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  throw new Error("Export timed out — check Exports history in a moment.");
}
