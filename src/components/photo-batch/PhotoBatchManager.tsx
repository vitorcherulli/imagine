"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Layers, Loader2 } from "lucide-react";
import type { PhotoBatch } from "@/lib/db/schema";
import { useToast } from "@/components/ui/use-toast";
import { useRememberedVariationModel } from "@/components/VariationModelSelect";
import { cn } from "@/lib/utils";
import { MAX_PHOTOS_PER_BATCH } from "@/lib/photo-batch";
import { ACCEPTED_IMAGE_TYPES, isAcceptedImage, pendingUploads } from "@/components/photo-batch/upload";

export interface PhotoBatchSummary {
  batch: PhotoBatch;
  coverUrl: string | null;
  photos: number;
  edited: number;
  approved: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function PhotoBatchManager({
  initial,
  defaultImageModel,
}: {
  initial: PhotoBatchSummary[];
  defaultImageModel: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      <header className="mb-4">
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <Layers className="h-4 w-4 text-accent" /> Batch edit
        </h1>
        <p className="text-2xs text-muted-foreground">
          Drop many photos, pick the ones to change, write one instruction and press Done — the AI edits them
          all. Then compare before and after, approve the good ones and download.
        </p>
      </header>

      <NewBatchDropZone defaultImageModel={defaultImageModel} />

      {initial.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Batches ({initial.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {initial.map(({ batch, coverUrl, photos, edited, approved }) => (
              <Link
                key={batch.id}
                href={`/batch-edit/${batch.id}`}
                className="group overflow-hidden rounded-lg border border-border bg-panel transition-colors hover:border-accent/60"
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt={batch.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <Layers className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-medium">{batch.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {plural(photos, "photo")} · {edited} edited{approved ? ` · ${approved} approved` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NewBatchDropZone({ defaultImageModel }: { defaultImageModel: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [imageModel] = useRememberedVariationModel("image", defaultImageModel);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  async function start(list: FileList | null | undefined) {
    const files = Array.from(list ?? []).filter(isAcceptedImage);
    if (files.length === 0 || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/photo-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageModel }),
      });
      const data = (await res.json().catch(() => ({}))) as { batch?: PhotoBatch; error?: string };
      if (!res.ok || !data.batch) throw new Error(data.error || `HTTP ${res.status}`);
      pendingUploads.set(data.batch.id, files.slice(0, MAX_PHOTOS_PER_BATCH));
      router.push(`/batch-edit/${data.batch.id}`);
    } catch (err) {
      toast({
        title: "Could not start",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setCreating(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void start(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-lg border-2 border-dashed bg-panel transition-colors",
        dragging ? "border-accent bg-accent/10" : "border-border",
      )}
    >
      <button
        type="button"
        disabled={creating}
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted-foreground hover:text-foreground"
      >
        {creating ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : <ImagePlus className="h-6 w-6" />}
        <span className="text-xs font-medium">Drop your photos here to start a new batch</span>
        <span className="text-2xs">
          or click to choose · JPG, PNG, WebP · up to {MAX_PHOTOS_PER_BATCH} photos
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => {
          void start(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
