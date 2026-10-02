"use client";

import * as React from "react";
import { Download, ImagePlus, Images, Loader2, Trash2, Upload } from "lucide-react";
import type { MediaLibraryAsset } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { cn } from "@/lib/utils";

export function DnaClientGallery({ dnaId, dnaName }: { dnaId: string; dnaName: string }) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [assets, setAssets] = React.useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [upload, setUpload] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project-dna/${dnaId}/gallery`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load photos");
      setAssets(data.assets ?? []);
    } catch (err) {
      setAssets([]);
      toast({
        variant: "destructive",
        title: "Could not load client photos",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [dnaId, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function uploadFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setUpload({ done: 0, total: files.length });
    let failed = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.set("image", await shrinkImageFile(file, 2400, 0.9));
        const res = await fetch(`/api/project-dna/${dnaId}/gallery`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setAssets((prev) => [data.asset, ...prev]);
      } catch {
        failed += 1;
      }
      setUpload((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUpload(null);
    if (failed) {
      toast({
        variant: "destructive",
        title: `${failed} photo${failed === 1 ? "" : "s"} failed to upload`,
      });
    } else {
      toast({ variant: "success", title: `${files.length} photo${files.length === 1 ? "" : "s"} added` });
    }
  }

  async function remove(asset: MediaLibraryAsset) {
    if (!confirm(`Remove "${asset.name}" from ${dnaName}'s client photos?`)) return;
    setDeletingId(asset.id);
    try {
      const res = await fetch(`/api/media-library/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove photo",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeletingId(null);
    }
  }

  const uploading = upload !== null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-panel p-4 transition-colors",
        dragging && "border-accent bg-accent/5",
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadFiles(e.dataTransfer.files);
      }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Images className="h-4 w-4 text-accent" />
            Client photos
            {!loading ? (
              <span className="text-2xs font-normal text-muted-foreground">({assets.length})</span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Real photos of this client — products, team, places. Every publication of {dnaName} can
            use them. Drag photos here or upload several at once.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? `Uploading ${upload.done}/${upload.total}…` : "Upload photos"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-2xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : assets.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background text-2xs text-muted-foreground hover:border-accent/40 hover:bg-muted/40"
        >
          <ImagePlus className="h-7 w-7 opacity-50" />
          No client photos yet — drop product shots, team photos, places…
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            >
              <a href={asset.url} target="_blank" rel="noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={asset.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <a
                  href={asset.url}
                  download={asset.name}
                  className="rounded bg-black/55 p-1 text-white hover:bg-black/75"
                  title="Download"
                >
                  <Download className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  disabled={deletingId === asset.id}
                  onClick={() => void remove(asset)}
                  className="rounded bg-black/55 p-1 text-white hover:bg-black/75"
                  title="Remove"
                >
                  {deletingId === asset.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
              <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {asset.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
