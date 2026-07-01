"use client";

import * as React from "react";
import { Download, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExportOptionsPanel } from "@/components/ExportOptionsPanel";
import {
  ExportProgressPanel,
  type ExportProgressUiState,
} from "@/components/ExportProgressPanel";
import { useClientMounted } from "@/hooks/use-client-mounted";
import type { ProjectExportItem } from "@/lib/export-history";
import type { ExportQualityId } from "@/lib/export-quality";
import type { ExportResolutionId } from "@/lib/export-resolutions";

interface Props {
  exports: ProjectExportItem[];
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
  canExport: boolean;
  canExportPremiere?: boolean;
  exportBlockerReason?: string | null;
  exportPremiereBlockerReason?: string | null;
  exportVisualNote?: string | null;
  exporting: boolean;
  exportingPremiere?: boolean;
  exportProgress?: ExportProgressUiState | null;
  onExport: (resolution: ExportResolutionId, quality: ExportQualityId) => Promise<void>;
  onExportPremiere?: () => Promise<void>;
}

function formatExportDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ExportDateLabel({ iso }: { iso: string }) {
  const mounted = useClientMounted();
  return <>{mounted ? formatExportDate(iso) : iso}</>;
}

export function ExportHistoryDialog({
  exports,
  onRefresh,
  refreshing = false,
  canExport,
  canExportPremiere = false,
  exportBlockerReason,
  exportPremiereBlockerReason,
  exportVisualNote,
  exporting,
  exportingPremiere = false,
  exportProgress = null,
  onExport,
  onExportPremiere,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const downloadable = exports.filter((item) => item.status === "done" && item.finalVideoUrl);
  const busy = exporting || exportingPremiere;

  React.useEffect(() => {
    if (open) void onRefresh();
  }, [open, onRefresh]);

  React.useEffect(() => {
    if (exporting) setOpen(true);
  }, [exporting]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="primary"
          size="sm"
          title={
            busy
              ? "Export em andamento — clique para ver o progresso"
              : canExport
                ? exportVisualNote
                  ? `Exportar vídeo (${exportVisualNote})`
                  : "Exportar vídeo e ver histórico"
                : exportBlockerReason ?? "Adicione pelo menos um bloco para exportar"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Film className="h-3.5 w-3.5" />
          )}
          Exports
          {exporting && exportProgress ? (
            <span className="ml-1 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              {exportProgress.percent}%
            </span>
          ) : downloadable.length > 0 ? (
            <span className="ml-1 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              {downloadable.length}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exports</DialogTitle>
          <DialogDescription>
            Configure e exporte um novo MP4. Versões anteriores ficam salvas para baixar de novo.
          </DialogDescription>
        </DialogHeader>

        {exporting && exportProgress ? (
          <ExportProgressPanel progress={exportProgress} className="mb-4" />
        ) : null}

        <ExportOptionsPanel
          canExport={canExport}
          canExportPremiere={canExportPremiere}
          exportBlockerReason={exportBlockerReason}
          exportPremiereBlockerReason={exportPremiereBlockerReason}
          exporting={exporting}
          exportingPremiere={exportingPremiere}
          onExport={onExport}
          onExportPremiere={onExportPremiere}
        />

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium text-foreground">Histórico</p>

          {refreshing && exports.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : downloadable.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum export ainda. Use Exportar MP4 acima para criar o v1.
            </p>
          ) : (
            <ul className="max-h-[min(280px,40vh)] space-y-2 overflow-y-auto pr-1">
              {downloadable.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      v{item.version}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {item.resolutionLabel}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <ExportDateLabel iso={item.createdAt} />
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={item.finalVideoUrl!}
                      download={item.downloadFilename}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {exports.some((item) => item.status === "error") && (
            <p className="mt-3 text-xs text-muted-foreground">
              Alguns exports falharam e não aparecem na lista. Tente exportar de novo.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
