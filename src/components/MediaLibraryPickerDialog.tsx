"use client";

import * as React from "react";
import { Film, FolderOpen, ImageIcon, Loader2, Search } from "lucide-react";
import type { MediaLibraryAsset } from "@/lib/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PickerScope = "project" | "all";

type PickerAsset = MediaLibraryAsset & { folderPath: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  kind?: "image" | "video";
  onSelect: (assetId: string) => void | Promise<void>;
  busy?: boolean;
}

export function MediaLibraryPickerDialog({
  open,
  onOpenChange,
  projectId,
  kind = "image",
  onSelect,
  busy = false,
}: Props) {
  const [scope, setScope] = React.useState<PickerScope>("project");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [assets, setAssets] = React.useState<PickerAsset[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setScope("project");
    setSearchQuery("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const query = new URLSearchParams({
          scope,
          kind,
          ...(scope === "project" ? { projectId } : {}),
        });
        const res = await fetch(`/api/media-library/picker?${query.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load gallery");
        if (!cancelled) setAssets(data.assets ?? []);
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scope, projectId, kind]);

  const filteredAssets = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) => {
      const haystack = `${asset.name} ${asset.folderPath} ${asset.source}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assets, searchQuery]);

  const isVideo = kind === "video";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose from gallery</DialogTitle>
          <DialogDescription>
            {isVideo
              ? "Pick a saved video from this project or from any project in your media library."
              : "Pick a saved image from this project or from any project in your media library."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          <Button
            type="button"
            variant={scope === "project" ? "outline" : "ghost"}
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => setScope("project")}
          >
            This project
          </Button>
          <Button
            type="button"
            variant={scope === "all" ? "outline" : "ghost"}
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => setScope("all")}
          >
            All projects
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={isVideo ? "Search videos by name or folder…" : "Search images by name or folder…"}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-auto rounded-md border border-border p-2 scrollbar-thin">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading gallery…
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              {isVideo ? (
                <Film className="h-8 w-8 opacity-40" />
              ) : (
                <ImageIcon className="h-8 w-8 opacity-40" />
              )}
              <p>{isVideo ? "No videos in this view yet." : "No images in this view yet."}</p>
              <p className="text-xs">
                {scope === "project"
                  ? isVideo
                    ? "Import or upload videos — they appear here automatically."
                    : "Generate or upload keyframes — they appear here automatically."
                  : isVideo
                    ? "Try “This project” or import videos in the Media gallery."
                    : "Try “This project” or upload images in the Media gallery."}
              </p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 opacity-40" />
              <p>No matches for &ldquo;{searchQuery.trim()}&rdquo;</p>
              <p className="text-xs">Try another name, folder, or source.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void onSelect(asset.id)}
                  className={cn(
                    "group overflow-hidden rounded-md border border-border bg-background text-left transition-colors hover:border-accent hover:ring-1 hover:ring-accent/40",
                    busy && "pointer-events-none opacity-60",
                  )}
                >
                  {isVideo ? (
                    <video
                      src={asset.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="space-y-0.5 p-1.5">
                    <p className="truncate text-[10px] font-medium">{asset.name}</p>
                    <p className="flex items-center gap-0.5 truncate text-[9px] text-muted-foreground">
                      <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                      {asset.folderPath}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
