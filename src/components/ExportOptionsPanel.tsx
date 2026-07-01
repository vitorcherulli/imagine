"use client";

import * as React from "react";
import { Clapperboard, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  type ExportQualityId,
} from "@/lib/export-quality";
import type { ExportResolutionId } from "@/lib/export-resolutions";

const EXPORT_RESOLUTION_OPTIONS = [
  { id: "720p", label: "HD 720p" },
  { id: "1080p", label: "Full HD 1080p" },
  { id: "1440p", label: "QHD 1440p" },
  { id: "2160p", label: "4K 2160p" },
] as const satisfies ReadonlyArray<{ id: ExportResolutionId; label: string }>;

const EXPORT_QUALITY_OPTIONS = (
  Object.values(EXPORT_QUALITY_PRESETS) as (typeof EXPORT_QUALITY_PRESETS)[ExportQualityId][]
).map((preset) => ({
  id: preset.id,
  label: preset.label,
  description: preset.description,
}));

interface Props {
  canExport: boolean;
  canExportPremiere?: boolean;
  exportBlockerReason?: string | null;
  exportPremiereBlockerReason?: string | null;
  exporting: boolean;
  exportingPremiere?: boolean;
  onExport: (resolution: ExportResolutionId, quality: ExportQualityId) => Promise<void>;
  onExportPremiere?: () => Promise<void>;
}

export function ExportOptionsPanel({
  canExport,
  canExportPremiere = false,
  exportBlockerReason,
  exportPremiereBlockerReason,
  exporting,
  exportingPremiere = false,
  onExport,
  onExportPremiere,
}: Props) {
  const [resolution, setResolution] = React.useState<ExportResolutionId>("1080p");
  const [quality, setQuality] = React.useState<ExportQualityId>(DEFAULT_EXPORT_QUALITY);
  const busy = exporting || exportingPremiere;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Qualidade</p>
        <div className="grid gap-2">
          {EXPORT_QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!canExport || busy}
              onClick={() => setQuality(option.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                quality === option.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-muted/20 hover:bg-muted/40",
                (!canExport || busy) && "cursor-not-allowed opacity-60",
              )}
            >
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-2xs text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Resolução</p>
        <Select
          value={resolution}
          onValueChange={(v) => setResolution(v as ExportResolutionId)}
          disabled={!canExport || busy}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPORT_RESOLUTION_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!canExport && exportBlockerReason ? (
        <p className="text-xs text-muted-foreground">{exportBlockerReason}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          className="w-full"
          disabled={!canExport || busy}
          onClick={() => void onExport(resolution, quality)}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar MP4
        </Button>
        {onExportPremiere ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={!canExportPremiere || busy}
            title={
              canExportPremiere
                ? "ZIP com clipes separados + Timeline.xml para Adobe Premiere Pro"
                : exportPremiereBlockerReason ?? "Adicione mídia na timeline primeiro"
            }
            onClick={() => void onExportPremiere()}
          >
            {exportingPremiere ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clapperboard className="h-4 w-4" />
            )}
            Exportar para Premiere
          </Button>
        ) : null}
      </div>
    </div>
  );
}
