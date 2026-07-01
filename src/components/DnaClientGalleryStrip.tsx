"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";
import type { MediaLibraryAsset } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function DnaClientGalleryStrip({
  dnaId,
  compact,
}: {
  dnaId: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [assets, setAssets] = React.useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project-dna/${dnaId}/gallery`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAssets((data.assets ?? []).slice(0, compact ? 4 : 12));
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [dnaId, compact]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await fetch(`/api/project-dna/${dnaId}/gallery`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAssets((prev) => [data.asset, ...prev].slice(0, compact ? 4 : 12));
      toast({ title: "Photo added" });
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

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          Client photos
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {loading ? (
        <p className="text-[10px] text-muted-foreground">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Real brand photos for publications — product, team, locations.
        </p>
      ) : (
        <div className="flex gap-1 overflow-x-auto">
          {assets.map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={a.id}
              src={a.url}
              alt={a.name}
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
