"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import { useAppTheme } from "@/components/ThemeProvider";
import { PreviewModePicker } from "@/components/PreviewModePicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { APP_THEME_OPTIONS } from "@/lib/app-theme";
import {
  loadPlatformPreviewDefaults,
  savePlatformPreviewDefaults,
  savePlatformPreviewWarmup,
} from "@/lib/app-preview-preferences";
import { previewModeLabel } from "@/lib/preview-settings";
import { clearBlockPreviewCache } from "@/lib/preview-video-cache";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export function AppSettingsDialog({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useAppTheme();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [previewPrefs, setPreviewPrefs] = React.useState(loadPlatformPreviewDefaults);
  const [cleaningPreviews, setCleaningPreviews] = React.useState(false);

  React.useEffect(() => {
    if (open) setPreviewPrefs(loadPlatformPreviewDefaults());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon-sm" : "sm"}
          title="Settings"
          className={
            collapsed
              ? "h-8 w-8 text-foreground/80"
              : "h-8 w-full justify-start gap-2 px-2 text-xs text-foreground/80"
          }
        >
          <Settings2 className="h-3.5 w-3.5" />
          {!collapsed && "Settings"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Appearance and editor defaults for new projects.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-2xs text-muted-foreground">Appearance</Label>
            <div className="grid gap-2">
              {APP_THEME_OPTIONS.map((option) => {
                const selected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-0.5 text-2xs text-muted-foreground">
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-2xs text-muted-foreground">Timeline preview default</Label>
            <p className="text-2xs text-muted-foreground">
              Used when a project is set to &quot;Platform default&quot;. Export is always full
              quality.
            </p>
            <PreviewModePicker
              value={previewPrefs.mode}
              onChange={(mode) => {
                if (mode === "auto") return;
                const next = { ...previewPrefs, mode };
                setPreviewPrefs(next);
                savePlatformPreviewDefaults(next);
              }}
            />
            {previewPrefs.mode === "proxy" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={previewPrefs.warmupEnabled}
                  onChange={(e) => {
                    const warmupEnabled = e.target.checked;
                    const next = { ...previewPrefs, warmupEnabled };
                    setPreviewPrefs(next);
                    savePlatformPreviewWarmup(warmupEnabled);
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Prepare previews in background</span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">
                    Generate low-res proxies while you edit — faster playback, more server work.
                  </span>
                </span>
              </label>
            )}
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-2xs text-muted-foreground">
                Remove all low-res preview proxies from every project. Original export videos
                are kept.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={cleaningPreviews}
                onClick={() => {
                  setCleaningPreviews(true);
                  void fetch("/api/previews/cleanup", { method: "POST" })
                    .then(async (res) => {
                      const data = (await res.json().catch(() => ({}))) as {
                        error?: string;
                        deletedCount?: number;
                        projectCount?: number;
                      };
                      if (!res.ok) throw new Error(data.error ?? "Cleanup failed");
                      clearBlockPreviewCache();
                      const deletedCount = data.deletedCount ?? 0;
                      toast({
                        variant: deletedCount > 0 ? "success" : "default",
                        title:
                          deletedCount > 0
                            ? `Deleted ${deletedCount} preview file${deletedCount === 1 ? "" : "s"}`
                            : "No preview files to delete",
                        description: "Export clips were not modified.",
                      });
                    })
                    .catch((err) => {
                      toast({
                        variant: "destructive",
                        title: "Could not delete preview files",
                        description: err instanceof Error ? err.message : String(err),
                      });
                    })
                    .finally(() => setCleaningPreviews(false));
                }}
              >
                {cleaningPreviews ? "Deleting…" : "Delete all preview files"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
