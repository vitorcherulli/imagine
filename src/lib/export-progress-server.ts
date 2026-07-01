import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ExportProgressStage } from "@/lib/export-progress";

export interface ExportProgressSnapshot {
  exportId: string;
  status: string;
  progressPercent: number;
  progressStage: ExportProgressStage | string | null;
  progressMessage: string | null;
  errorMessage: string | null;
  finalVideoUrl: string | null;
  resolution: string | null;
  quality: string | null;
}

export async function updateExportProgress(
  exportId: string,
  input: {
    progressPercent: number;
    progressStage: ExportProgressStage | string;
    progressMessage: string;
  },
): Promise<void> {
  const progressPercent = Math.min(100, Math.max(0, Math.round(input.progressPercent)));
  await db
    .update(schema.exports)
    .set({
      progressPercent,
      progressStage: input.progressStage,
      progressMessage: input.progressMessage,
    })
    .where(eq(schema.exports.id, exportId))
    .catch(() => {});
}

export async function getExportProgressSnapshot(
  exportId: string,
  projectId: string,
): Promise<ExportProgressSnapshot | null> {
  const [row] = await db
    .select()
    .from(schema.exports)
    .where(eq(schema.exports.id, exportId))
    .limit(1);
  if (!row || row.projectId !== projectId) return null;
  return {
    exportId: row.id,
    status: row.status,
    progressPercent: row.progressPercent ?? 0,
    progressStage: row.progressStage ?? null,
    progressMessage: row.progressMessage ?? null,
    errorMessage: row.errorMessage ?? null,
    finalVideoUrl: row.finalVideoUrl ?? null,
    resolution: row.resolution ?? null,
    quality: row.quality ?? null,
  };
}
