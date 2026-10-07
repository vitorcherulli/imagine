"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  ImagePlus,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { PhotoBatch, PhotoBatchItem } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { rememberVariationModel, VariationModelSelect } from "@/components/VariationModelSelect";
import { cn } from "@/lib/utils";
import {
  editedFileName,
  isPhotoBatchAspect,
  isPhotoBatchBusy,
  MAX_PHOTOS_PER_BATCH,
  PHOTO_BATCH_ASPECT_LABELS,
  PHOTO_BATCH_ASPECTS,
  PHOTO_BATCH_PRESETS,
  type PhotoBatchAspect,
} from "@/lib/photo-batch";
import {
  ACCEPTED_IMAGE_TYPES,
  isAcceptedImage,
  mapLimit,
  pendingUploads,
  UPLOAD_CONCURRENCY,
  uploadPhoto,
} from "@/components/photo-batch/upload";

const POLL_MS = 3000;

type Upload = { key: string; name: string; previewUrl: string; error: string | null };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function PhotoBatchEditor({
  initialBatch,
  initialItems,
  initialImageModel,
}: {
  initialBatch: PhotoBatch;
  initialItems: PhotoBatchItem[];
  initialImageModel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [batch, setBatch] = React.useState(initialBatch);
  const [items, setItems] = React.useState(initialItems);
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(initialItems.filter((i) => i.status === "idle" || i.status === "error").map((i) => i.id)),
  );
  const [instructions, setInstructions] = React.useState(initialBatch.instructions ?? "");
  const [imageModel, setImageModel] = React.useState(initialImageModel);
  const [aspect, setAspect] = React.useState<PhotoBatchAspect>(
    isPhotoBatchAspect(initialBatch.aspectRatio) ? initialBatch.aspectRatio : "original",
  );
  const [running, setRunning] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const lastClicked = React.useRef<number | null>(null);
  const uploadKey = React.useRef(0);
  const photoCount = React.useRef(0);
  photoCount.current = items.length + uploads.filter((u) => !u.error).length;

  const busy = items.some((i) => isPhotoBatchBusy(i.status));

  const fail = React.useCallback(
    (title: string, err: unknown) => {
      toast({ title, description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
    [toast],
  );

  async function call(url: string, init: RequestInit): Promise<void> {
    const res = await fetch(url, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  }

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/photo-batches/${batch.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { batch: PhotoBatch; items: PhotoBatchItem[] };
    setBatch(data.batch);
    setItems(data.items);
    const ids = new Set(data.items.map((i) => i.id));
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [batch.id]);

  React.useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(t);
  }, [busy, refresh]);

  const addFiles = React.useCallback(
    (list: File[]) => {
      const files = list.filter(isAcceptedImage);
      if (files.length === 0) return;
      const room = Math.max(0, MAX_PHOTOS_PER_BATCH - photoCount.current);
      const accepted = files.slice(0, room);
      if (accepted.length < files.length) {
        toast({
          title: `Up to ${MAX_PHOTOS_PER_BATCH} photos per batch`,
          description: `${plural(files.length - accepted.length, "photo")} left out.`,
        });
      }
      if (accepted.length === 0) return;
      const entries = accepted.map((file) => ({
        file,
        upload: {
          key: `upload-${uploadKey.current++}`,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          error: null,
        } satisfies Upload,
      }));
      photoCount.current += entries.length;
      setUploads((prev) => [...prev, ...entries.map((e) => e.upload)]);
      void mapLimit(entries, UPLOAD_CONCURRENCY, async ({ file, upload }) => {
        try {
          const item = await uploadPhoto(batch.id, file);
          setItems((prev) => [...prev, item].sort((a, b) => a.position - b.position));
          setSelected((prev) => new Set(prev).add(item.id));
          setUploads((prev) => prev.filter((u) => u.key !== upload.key));
          URL.revokeObjectURL(upload.previewUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setUploads((prev) => prev.map((u) => (u.key === upload.key ? { ...u, error: message } : u)));
        }
      });
    },
    [batch.id, toast],
  );

  React.useEffect(() => {
    const files = pendingUploads.get(batch.id);
    if (!files) return;
    pendingUploads.delete(batch.id);
    addFiles(files);
  }, [batch.id, addFiles]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const runnable = selectedItems.filter((i) => !isPhotoBatchBusy(i.status));
  const selectedReady = selectedItems.filter((i) => i.status === "ready");
  const readyCount = items.filter((i) => i.status === "ready").length;
  const approvedCount = items.filter((i) => i.status === "ready" && i.approved).length;
  const attempted = items.filter((i) => i.attempts > 0);
  const finishedAttempted = attempted.filter((i) => !isPhotoBatchBusy(i.status)).length;
  const busyCount = attempted.length - finishedAttempted;
  const uploading = uploads.some((u) => !u.error);

  function toggleSelect(index: number, shift: boolean) {
    const item = items[index];
    if (!item) return;
    const turnOn = !selected.has(item.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const from = lastClicked.current !== null && shift ? Math.min(lastClicked.current, items.length - 1) : index;
      const [a, b] = [Math.min(from, index), Math.max(from, index)];
      for (let i = a; i <= b; i++) {
        if (turnOn) next.add(items[i].id);
        else next.delete(items[i].id);
      }
      return next;
    });
    lastClicked.current = index;
  }

  function selectWhere(pred: (item: PhotoBatchItem) => boolean) {
    setSelected(new Set(items.filter(pred).map((i) => i.id)));
  }

  async function runEdits() {
    const text = instructions.trim();
    if (runnable.length === 0 || !text) return;
    const redo = runnable.filter((i) => i.status === "ready").length;
    if (
      redo > 0 &&
      !window.confirm(
        `${plural(redo, "selected photo")} ${redo === 1 ? "was" : "were"} already edited. Edit again from the original?`,
      )
    ) {
      return;
    }
    setRunning(true);
    try {
      await call(`/api/photo-batches/${batch.id}/run`, {
        method: "POST",
        body: JSON.stringify({
          itemIds: runnable.map((i) => i.id),
          instructions: text,
          imageModel,
          aspectRatio: aspect,
        }),
      });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      fail("Could not start editing", err);
    } finally {
      setRunning(false);
    }
  }

  async function setApproved(ids: string[], approved: boolean) {
    if (ids.length === 0) return;
    setItems((prev) => prev.map((i) => (ids.includes(i.id) && i.status === "ready" ? { ...i, approved } : i)));
    try {
      await call(`/api/photo-batches/${batch.id}/photos`, {
        method: "PATCH",
        body: JSON.stringify({ itemIds: ids, approved }),
      });
    } catch (err) {
      fail("Could not save", err);
      await refresh();
    }
  }

  async function retry(item: PhotoBatchItem, override?: string) {
    try {
      await call(`/api/photo-batches/photos/${item.id}`, {
        method: "POST",
        body: JSON.stringify({ instructions: override?.trim() || null }),
      });
      await refresh();
    } catch (err) {
      fail("Could not redo", err);
    }
  }

  async function removePhotos(ids: string[]) {
    if (ids.length === 0) return;
    const question = ids.length === 1 ? "Remove this photo from the batch?" : `Remove ${ids.length} photos from the batch?`;
    if (!window.confirm(question)) return;
    setBulkPending(true);
    try {
      for (const id of ids) await call(`/api/photo-batches/photos/${id}`, { method: "DELETE" });
    } catch (err) {
      fail("Could not remove", err);
    } finally {
      setBulkPending(false);
      if (previewId && ids.includes(previewId)) setPreviewId(null);
      await refresh();
    }
  }

  async function patchBatch(body: Record<string, unknown>, errorTitle: string) {
    try {
      await call(`/api/photo-batches/${batch.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (err) {
      fail(errorTitle, err);
    }
  }

  async function renameBatch(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === batch.name) return;
    await patchBatch({ name: trimmed }, "Could not rename");
    setBatch((b) => ({ ...b, name: trimmed }));
  }

  function changeImageModel(next: string) {
    setImageModel(next);
    rememberVariationModel("image", next);
    void patchBatch({ imageModel: next }, "Could not save the image AI");
  }

  async function deleteBatch() {
    if (!window.confirm(`Delete "${batch.name}" and all its photos?`)) return;
    try {
      await call(`/api/photo-batches/${batch.id}`, { method: "DELETE" });
      router.push("/batch-edit");
      router.refresh();
    } catch (err) {
      fail("Could not delete", err);
    }
  }

  const previewIndex = previewId ? items.findIndex((i) => i.id === previewId) : -1;
  const previewItem = previewIndex >= 0 ? items[previewIndex] : null;

  return (
    <div
      className="mx-auto max-w-6xl px-5 py-5"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild title="All batches">
            <Link href="/batch-edit">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Layers className="h-4 w-4 shrink-0 text-accent" />
          <Input
            defaultValue={batch.name}
            onBlur={(e) => void renameBatch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-8 w-72 max-w-full border-transparent bg-transparent px-1 text-base font-semibold hover:border-border focus:border-border"
            maxLength={80}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => void deleteBatch()}>
          <Trash2 className="h-3.5 w-3.5" /> Delete batch
        </Button>
      </header>

      <section className="mb-4 space-y-3 rounded-lg border border-border bg-panel p-3">
        <div className="space-y-1">
          <Label className="text-2xs text-muted-foreground">Quick instructions</Label>
          <div className="flex flex-wrap gap-1">
            {PHOTO_BATCH_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setInstructions(preset.prompt)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  instructions === preset.prompt
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="batch-instructions" className="text-2xs text-muted-foreground">
            What should change in the photos?
          </Label>
          <Textarea
            id="batch-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={() => {
              if (instructions.trim() !== (batch.instructions ?? "")) {
                void patchBatch({ instructions: instructions.trim() || null }, "Could not save the instruction");
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder="e.g. Replace the background with a clean white studio, keep the product and shadows natural…"
            className="text-xs"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
          <VariationModelSelect kind="image" label="AI for the edits" value={imageModel} onChange={changeImageModel} />
          <SegmentedControl<PhotoBatchAspect>
            label="Format"
            value={aspect}
            onChange={(next) => {
              setAspect(next);
              void patchBatch({ aspectRatio: next }, "Could not save the format");
            }}
            options={PHOTO_BATCH_ASPECTS.map((a) => ({ value: a, label: PHOTO_BATCH_ASPECT_LABELS[a] }))}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-2xs text-muted-foreground">
            {runnable.length > 0
              ? `${plural(runnable.length, "photo")} = ${plural(runnable.length, "image generation")} on your OpenRouter account`
              : items.length > 0
                ? "Select the photos you want to edit"
                : "Add photos to start"}
          </span>
          <Button
            variant="primary"
            size="md"
            disabled={running || runnable.length === 0 || !instructions.trim()}
            onClick={() => void runEdits()}
            title={!instructions.trim() ? "Write what should change first" : undefined}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Done — edit {plural(runnable.length, "photo")}
          </Button>
        </div>
      </section>

      {busyCount > 0 ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs">
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            Editing… {finishedAttempted}/{attempted.length} done · {plural(busyCount, "photo")} left
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${attempted.length ? (finishedAttempted / attempted.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-background/95 px-3 py-2 backdrop-blur">
          <span className="text-2xs font-medium">
            {selected.size} of {plural(items.length, "photo")} selected
          </span>
          <div className="flex flex-wrap items-center gap-1 text-2xs">
            <SelectLink onClick={() => selectWhere(() => true)}>All</SelectLink>
            <SelectLink onClick={() => setSelected(new Set())}>None</SelectLink>
            <SelectLink onClick={() => selectWhere((i) => i.status === "idle")}>Not edited</SelectLink>
            <SelectLink onClick={() => selectWhere((i) => i.status === "ready")}>Edited</SelectLink>
            <SelectLink onClick={() => selectWhere((i) => i.status === "error")}>Failed</SelectLink>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {selectedReady.length > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void setApproved(selectedReady.map((i) => i.id), true)}
                >
                  <Check className="h-3 w-3" /> Approve {selectedReady.length}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void setApproved(selectedReady.map((i) => i.id), false)}
                >
                  <X className="h-3 w-3" /> Unapprove
                </Button>
              </>
            ) : null}
            {selected.size > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-destructive"
                disabled={bulkPending}
                onClick={() => void removePhotos([...selected])}
              >
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            ) : null}
            {approvedCount > 0 ? (
              <Button variant="outline" size="xs" asChild>
                <a href={`/api/photo-batches/${batch.id}/zip?scope=approved`}>
                  <Download className="h-3 w-3" /> Download approved ({approvedCount})
                </a>
              </Button>
            ) : readyCount > 0 ? (
              <Button variant="outline" size="xs" asChild>
                <a href={`/api/photo-batches/${batch.id}/zip?scope=edited`}>
                  <Download className="h-3 w-3" /> Download edited ({readyCount})
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item, index) => (
          <PhotoCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={(shift) => toggleSelect(index, shift)}
            onOpen={() => setPreviewId(item.id)}
            onApprove={(approved) => void setApproved([item.id], approved)}
            onRetry={() => void retry(item)}
            onRemove={() => void removePhotos([item.id])}
          />
        ))}
        {uploads.map((upload) => (
          <div key={upload.key} className="overflow-hidden rounded-lg border border-border bg-panel">
            <div className="relative aspect-square bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upload.previewUrl} alt={upload.name} className="h-full w-full object-contain opacity-50" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                {upload.error ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span className="line-clamp-3 text-2xs text-muted-foreground">{upload.error}</span>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        URL.revokeObjectURL(upload.previewUrl);
                        setUploads((prev) => prev.filter((u) => u.key !== upload.key));
                      }}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    <span className="text-2xs text-muted-foreground">Uploading…</span>
                  </>
                )}
              </div>
            </div>
            <p className="truncate px-2 py-1.5 text-2xs text-muted-foreground">{upload.name}</p>
          </div>
        ))}
        {items.length + uploads.length < MAX_PHOTOS_PER_BATCH ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground",
              dragging ? "border-accent bg-accent/10" : "border-border",
            )}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-xs font-medium">Add photos</span>
            <span className="px-2 text-2xs">Drop them anywhere on the page</span>
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <PhotoPreviewDialog
        item={previewItem}
        position={previewIndex >= 0 ? `${previewIndex + 1} / ${items.length}` : ""}
        onClose={() => setPreviewId(null)}
        onPrev={previewIndex > 0 ? () => setPreviewId(items[previewIndex - 1].id) : undefined}
        onNext={previewIndex >= 0 && previewIndex < items.length - 1 ? () => setPreviewId(items[previewIndex + 1].id) : undefined}
        onApprove={(approved) => previewItem && void setApproved([previewItem.id], approved)}
        onRetry={(text) => previewItem && void retry(previewItem, text)}
      />
    </div>
  );
}

function SelectLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function StatusBadge({ item }: { item: PhotoBatchItem }) {
  if (item.status === "ready" && item.approved) {
    return <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-medium text-success-foreground">Approved</span>;
  }
  if (item.status === "ready") {
    return <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">Edited</span>;
  }
  if (item.status === "queued") {
    return <span className="rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium">In line</span>;
  }
  return null;
}

function PhotoCard({
  item,
  selected,
  onToggle,
  onOpen,
  onApprove,
  onRetry,
  onRemove,
}: {
  item: PhotoBatchItem;
  selected: boolean;
  onToggle: (shift: boolean) => void;
  onOpen: () => void;
  onApprove: (approved: boolean) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const [peek, setPeek] = React.useState(false);
  const ready = item.status === "ready" && !!item.resultUrl;
  const src = ready && !peek ? item.resultUrl! : item.sourceUrl;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-panel transition-colors",
        item.approved && ready ? "border-success ring-1 ring-success" : selected ? "border-accent" : "border-border",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <button type="button" onClick={onOpen} className="h-full w-full" title="Open">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={item.originalName}
            className={cn("h-full w-full object-contain", isPhotoBatchBusy(item.status) && "opacity-60")}
          />
        </button>

        <button
          type="button"
          onClick={(e) => onToggle(e.shiftKey)}
          title={selected ? "Unselect (Shift+click for a range)" : "Select (Shift+click for a range)"}
          className={cn(
            "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border shadow-sm transition-colors",
            selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background/90 text-transparent hover:text-muted-foreground",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </button>

        <div className="pointer-events-none absolute right-1.5 top-1.5">
          <StatusBadge item={item} />
        </div>

        {item.status === "editing" ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="rounded bg-background/85 px-1.5 py-0.5 text-2xs">Editing…</span>
          </div>
        ) : null}

        {item.status === "error" ? (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-background/90 p-2 text-center">
            <span className="flex items-center gap-1 text-2xs text-destructive">
              <AlertTriangle className="h-3 w-3" /> Failed
            </span>
            <span className="line-clamp-2 text-[10px] text-muted-foreground" title={item.error ?? ""}>
              {item.error || "Unknown error"}
            </span>
          </div>
        ) : null}

        {ready ? (
          <button
            type="button"
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
            className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
            title="Hold to see the original"
          >
            <Eye className="h-3 w-3" /> {peek ? "Original" : "Hold: before"}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5 border-t border-border px-1.5 py-1">
        <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground" title={item.originalName}>
          {item.originalName || "Photo"}
        </span>
        {ready ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(item.approved && "text-success")}
              onClick={() => onApprove(!item.approved)}
              title={item.approved ? "Unapprove" : "Approve"}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" asChild title="Download">
              <a href={item.resultUrl!} download={editedFileName(item.originalName)}>
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
          </>
        ) : null}
        {(ready || item.status === "error") && item.instructions ? (
          <Button variant="ghost" size="icon-sm" onClick={onRetry} title="Redo with the same instruction">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {!isPhotoBatchBusy(item.status) ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="Remove from batch"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = React.useState(50);
  return (
    <div className="relative h-full w-full select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`${alt} — edited`} className="absolute inset-0 h-full w-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt={`${alt} — original`}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" style={{ left: `${pos}%` }} />
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Before</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

function PhotoPreviewDialog({
  item,
  position,
  onClose,
  onPrev,
  onNext,
  onApprove,
  onRetry,
}: {
  item: PhotoBatchItem | null;
  position: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onApprove: (approved: boolean) => void;
  onRetry: (instructions: string) => void;
}) {
  const [adjust, setAdjust] = React.useState("");
  const itemId = item?.id;

  React.useEffect(() => {
    setAdjust("");
  }, [itemId]);

  React.useEffect(() => {
    if (!itemId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemId, onPrev, onNext]);

  const ready = item?.status === "ready" && !!item.resultUrl;
  const busy = item ? isPhotoBatchBusy(item.status) : false;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl gap-3 p-4">
        {item ? (
          <>
            <div className="flex items-center gap-2 pr-6">
              <DialogTitle className="min-w-0 truncate text-sm">{item.originalName || "Photo"}</DialogTitle>
              <span className="shrink-0 text-2xs text-muted-foreground">{position}</span>
              <StatusBadge item={item} />
            </div>
            <DialogDescription className="sr-only">Compare the original photo with the edited one.</DialogDescription>

            <div className="relative h-[62vh] overflow-hidden rounded-md bg-muted">
              {ready ? (
                <BeforeAfter key={item.resultUrl} before={item.sourceUrl} after={item.resultUrl!} alt={item.originalName} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.sourceUrl} alt={item.originalName} className="h-full w-full object-contain" />
              )}
              {busy ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  <span className="rounded bg-background/85 px-2 py-0.5 text-xs">
                    {item.status === "queued" ? "In line…" : "Editing…"}
                  </span>
                </div>
              ) : null}
              {onPrev ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
                  onClick={onPrev}
                  title="Previous (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              ) : null}
              {onNext ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                  onClick={onNext}
                  title="Next (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {item.status === "error" ? (
              <p className="text-2xs text-destructive">Failed: {item.error || "unknown error"}</p>
            ) : null}
            {item.instructions ? (
              <p className="line-clamp-2 text-2xs text-muted-foreground" title={item.instructions}>
                Instruction used: {item.instructions}
              </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <Textarea
                  value={adjust}
                  onChange={(e) => setAdjust(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={
                    item.instructions
                      ? "New instruction for this photo only (empty = redo with the same one)"
                      : "Instruction for this photo only"
                  }
                  className="text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || (!adjust.trim() && !item.instructions)}
                onClick={() => onRetry(adjust)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> {item.status === "idle" ? "Edit" : "Redo"}
              </Button>
              {ready ? (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={item.resultUrl!} download={editedFileName(item.originalName)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </Button>
                  <Button
                    variant={item.approved ? "success" : "primary"}
                    size="sm"
                    onClick={() => {
                      onApprove(!item.approved);
                      if (!item.approved) onNext?.();
                    }}
                    title={item.approved ? "Unapprove" : "Approve and go to the next photo"}
                  >
                    <Check className="h-3.5 w-3.5" /> {item.approved ? "Approved" : "Approve"}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
