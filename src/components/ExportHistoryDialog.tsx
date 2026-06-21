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
import type { ProjectExportItem } from "@/lib/export-history";

interface Props {
  exports: ProjectExportItem[];
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
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

export function ExportHistoryDialog({
  exports,
  onRefresh,
  refreshing = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const downloadable = exports.filter((item) => item.status === "done" && item.finalVideoUrl);

  React.useEffect(() => {
    if (open) void onRefresh();
  }, [open, onRefresh]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Past exports — download again anytime"
        >
          <Film className="h-3.5 w-3.5" />
          Exports
          {downloadable.length > 0 && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              {downloadable.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export history</DialogTitle>
          <DialogDescription>
            Each export is saved permanently. Download any version again later.
          </DialogDescription>
        </DialogHeader>

        {refreshing && exports.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading exports…
          </div>
        ) : downloadable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No exports yet. Use Export to create v1.
          </p>
        ) : (
          <ul className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1">
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
                    {formatExportDate(item.createdAt)}
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
          <p className="text-xs text-muted-foreground">
            Some exports failed and are not listed. Try exporting again.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
