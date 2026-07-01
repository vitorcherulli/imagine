"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  estimateExportEtaSeconds,
  exportStageLabel,
  formatExportEta,
} from "@/lib/export-progress";

export interface ExportProgressUiState {
  exportId: string;
  percent: number;
  stage: string | null;
  message: string | null;
  startedAtMs: number;
}

interface Props {
  progress: ExportProgressUiState;
  className?: string;
}

export function ExportProgressPanel({ progress, className }: Props) {
  const etaSeconds = estimateExportEtaSeconds(progress.percent, progress.startedAtMs);
  const stageLabel = exportStageLabel(progress.stage);

  return (
    <div
      className={cn(
        "rounded-lg border border-accent/30 bg-accent/5 px-4 py-3",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{stageLabel}</p>
            <p className="truncate text-2xs text-muted-foreground">
              {progress.message ?? "Processando…"}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {progress.percent}%
          </p>
          <p className="text-2xs text-muted-foreground">{formatExportEta(etaSeconds)}</p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, progress.percent)}%` }}
        />
      </div>
    </div>
  );
}
