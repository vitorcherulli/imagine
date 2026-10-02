"use client";

import * as React from "react";
import { ImagePlus, Loader2, Upload, Wand2 } from "lucide-react";
import type { MediaLibraryAsset } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { cn } from "@/lib/utils";

export type ClientPhotoMode = "use" | "reference" | "enhance";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicationId: string;
  /** Name of the linked DNA; photos are shared across its publications. */
  dnaName?: string | null;
  onSelect: (assetId: string, mode: ClientPhotoMode) => void | Promise<void>;
  busy?: boolean;
}

export function ClientPhotosDialog({ open, onOpenChange, publicationId, dnaName, onSelect, busy = false }: Props) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [assets, setAssets] = React.useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [upload, setUpload] = React.useState<{ done: number; total: number } | null>(null);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const loadAssets = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/publications/${publicationId}/photos`);
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
  }, [publicationId, toast]);

  React.useEffect(() => {
    if (!open) return;
    setPickedId(null);
    void loadAssets();
  }, [open, loadAssets]);

  async function uploadFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setUpload({ done: 0, total: files.length });
    let failed = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.set("image", await shrinkImageFile(file, 2400, 0.9));
        const res = await fetch(`/api/publications/${publicationId}/photos`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setAssets((prev) => [data.asset, ...prev]);
        setPickedId(data.asset.id);
      } catch {
        failed += 1;
      }
      setUpload((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUpload(null);
    if (failed) {
      toast({ variant: "destructive", title: `${failed} photo${failed === 1 ? "" : "s"} failed to upload` });
    }
  }

  async function apply(mode: ClientPhotoMode) {
    if (!pickedId) return;
    await onSelect(pickedId, mode);
    onOpenChange(false);
  }

  const disabled = !pickedId || busy || upload !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Client photos{dnaName ? ` — ${dnaName}` : ""}</DialogTitle>
          <DialogDescription>
            {dnaName
              ? "Shared by every publication of this DNA. Upload several at once, then pick one for this slide."
              : "Saved with this publication. Upload several at once, then pick one for this slide."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload !== null}
            onClick={() => fileRef.current?.click()}
          >
            {upload ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {upload ? `Uploading ${Math.min(upload.done + 1, upload.total)} of ${upload.total}…` : "Upload photos"}
          </Button>
          <span className="text-2xs text-muted-foreground">or drop them below</span>
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

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void uploadFiles(e.dataTransfer.files);
          }}
          className={cn(
            "max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-2 transition-colors",
            dragging ? "border-accent bg-accent/5" : "border-border",
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12 text-2xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-2xs text-muted-foreground">
              <ImagePlus className="h-8 w-8 opacity-40" />
              No client photos yet — drop product shots, team photos, places, animals…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setPickedId(asset.id)}
                  title={asset.name}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-md border bg-background transition-colors",
                    pickedId === asset.id
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border hover:border-accent/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
                  {asset.name.endsWith("(AI)") ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">AI</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-2xs text-muted-foreground">
          <strong className="font-medium text-foreground">Enhance with AI</strong> fixes light, color and sharpness,
          fits the photo to the post format with room for the title, and saves the result here too. Takes about a
          minute.
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => void apply("reference")}
            title="The AI generates a new image inspired by this photo"
          >
            AI reference only
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void apply("enhance")}>
            <Wand2 className="h-3.5 w-3.5" />
            Enhance with AI
          </Button>
          <Button variant="primary" size="sm" disabled={disabled} onClick={() => void apply("use")}>
            Use as is
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
