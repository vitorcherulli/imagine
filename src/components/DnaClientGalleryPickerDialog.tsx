"use client";

import * as React from "react";
import { ImagePlus, Loader2, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDnaId: string | null;
  dnaName?: string;
  onSelect: (assetId: string, mode: "use" | "reference") => void | Promise<void>;
  busy?: boolean;
}

export function DnaClientGalleryPickerDialog({
  open,
  onOpenChange,
  projectDnaId,
  dnaName,
  onSelect,
  busy = false,
}: Props) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [assets, setAssets] = React.useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [pickedId, setPickedId] = React.useState<string | null>(null);

  const loadAssets = React.useCallback(async () => {
    if (!projectDnaId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project-dna/${projectDnaId}/gallery`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load gallery");
      setAssets(data.assets ?? []);
    } catch (err) {
      setAssets([]);
      toast({
        variant: "destructive",
        title: "Could not load gallery",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectDnaId, toast]);

  React.useEffect(() => {
    if (!open) return;
    setPickedId(null);
    void loadAssets();
  }, [open, loadAssets]);

  async function uploadFile(file: File) {
    if (!projectDnaId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await fetch(`/api/project-dna/${projectDnaId}/gallery`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAssets((prev) => [data.asset, ...prev]);
      setPickedId(data.asset.id);
      toast({ title: "Photo added to brand gallery" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUploading(false);
    }
  }

  async function apply(mode: "use" | "reference") {
    if (!pickedId) return;
    await onSelect(pickedId, mode);
    onOpenChange(false);
  }

  if (!projectDnaId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Client gallery</DialogTitle>
            <DialogDescription>
              Link a Project DNA to this publication to use real client photos.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Client photos — {dnaName ?? "brand"}</DialogTitle>
          <DialogDescription>
            Upload real photos once per DNA, then pick a base for each slide.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
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
            Upload photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-2xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-2xs text-muted-foreground">
              <ImagePlus className="h-8 w-8 opacity-40" />
              No client photos yet — upload product shots, team photos, locations, etc.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setPickedId(asset.id)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-md border bg-background transition-colors",
                    pickedId === asset.id
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border hover:border-accent/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!pickedId || busy}
            onClick={() => void apply("reference")}
          >
            AI reference only
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!pickedId || busy}
            onClick={() => void apply("use")}
          >
            Use as slide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
