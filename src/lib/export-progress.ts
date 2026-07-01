export type ExportProgressStage =
  | "preparing"
  | "segments"
  | "captions"
  | "encoding"
  | "upload"
  | "done";

export function estimateExportEtaSeconds(
  progressPercent: number,
  startedAtMs: number,
): number | null {
  if (progressPercent < 4) return null;
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  if (elapsedSec < 2) return null;
  const remaining = ((100 - progressPercent) / progressPercent) * elapsedSec;
  if (!Number.isFinite(remaining) || remaining < 0) return null;
  return Math.min(remaining, 60 * 60);
}

export function formatExportEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Calculando tempo…";
  if (seconds < 8) return "Quase lá…";
  if (seconds < 60) return `~${Math.ceil(seconds)}s restantes`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} min restante${minutes > 1 ? "s" : ""}`;
}

export function exportStageLabel(stage: string | null | undefined): string {
  switch (stage) {
    case "preparing":
      return "Preparando";
    case "segments":
      return "Montando blocos";
    case "captions":
      return "Legendas";
    case "encoding":
      return "Codificando vídeo";
    case "upload":
      return "Salvando";
    case "done":
      return "Concluído";
    default:
      return "Exportando";
  }
}
