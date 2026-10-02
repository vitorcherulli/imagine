"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, FolderUp, Loader2, Play, Sparkles, Upload, XCircle } from "lucide-react";
import type { Creative } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  CREATIVE_CODE_PREFIX,
  CREATIVE_FORMATS,
  CREATIVE_LANGUAGES,
  buildCreativeName,
  creativeCode,
  parseCreativeName,
  ratioFromSize,
  toProductCode,
  type CreativeFormat,
  type CreativeRatio,
} from "@/lib/creatives";
import { assignConcepts, suggestImport, type ContentAnalysis } from "@/lib/creatives-import";
import { fmtDuration, nameOf, readLocalMediaSize } from "@/components/creatives/shared";

export type DroppedFile = { file: File; path: string };

const SUPPORTED_EXT = /\.(png|jpe?g|webp|mp4|mov)$/i;
const isSupported = (f: File) => SUPPORTED_EXT.test(f.name) && !f.name.startsWith(".");
const isVideoFile = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov)$/i.test(f.name);
const UPLOAD_CONCURRENCY = 2;
const PROBE_CONCURRENCY = 6;
const AI_BATCH = 10;
const AI_PREF_KEY = "creatives.import.ai";
const FRAME_MAX = 512;
/** Files up to this size are copied into memory when picked (see {@link snapshotFile}). */
const SNAPSHOT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Chrome aborts an upload with "Failed to fetch" (net::ERR_UPLOAD_FILE_CHANGED) when the file
 * changed on disk after it was picked — Google Drive streaming files change on first read.
 * An in-memory copy taken at pick time makes preview, AI analysis and upload independent of disk.
 */
async function snapshotFile(file: File): Promise<File> {
  if (file.size > SNAPSHOT_MAX_BYTES) return file;
  try {
    return new File([await file.arrayBuffer()], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function uploadErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const unreadable =
    (err instanceof TypeError && /failed to fetch|network/i.test(message)) ||
    (err instanceof DOMException && err.name === "NotReadableError");
  return unreadable
    ? "Could not read the file — it changed after you picked it (common with Google Drive). Copy it to a local folder or remove and add it again."
    : message;
}

/** Files and folders from a drop event. Must be called synchronously inside the event handler. */
export function collectDropped(dt: DataTransfer): Promise<DroppedFile[]> {
  const entries = Array.from(dt.items)
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Promise.resolve(Array.from(dt.files).map((file) => ({ file, path: file.name })));

  const out: DroppedFile[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: entry.fullPath.replace(/^\//, "") });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  }
  return Promise.all(entries.map(walk)).then(() => out);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

function toJpeg(src: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, FRAME_MAX / Math.max(width, height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

function waitFor(target: HTMLMediaElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    target.addEventListener(event, () => (window.clearTimeout(timer), resolve()), { once: true });
    target.addEventListener("error", () => (window.clearTimeout(timer), reject(new Error("media error"))), { once: true });
  });
}

/** Small JPEGs for the vision model: the image itself, or a few video frames (first seconds carry the hook). */
async function previewFrames(url: string, isVideo: boolean, duration: number | null): Promise<string[]> {
  try {
    if (!isVideo) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return [toJpeg(img, img.naturalWidth, img.naturalHeight)];
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const loaded = waitFor(video, "loadeddata", 20_000);
    video.src = url;
    await loaded;
    const d = duration || (Number.isFinite(video.duration) ? video.duration : 0);
    const times = d > 0 ? [Math.min(0.8, d * 0.1), Math.min(2.5, d * 0.3), d * 0.6] : [0];
    const frames: string[] = [];
    for (const t of [...new Set(times.map((x) => Math.round(x * 10) / 10))]) {
      const seeked = waitFor(video, "seeked", 10_000);
      video.currentTime = t;
      await seeked;
      frames.push(toJpeg(video, video.videoWidth, video.videoHeight));
    }
    video.removeAttribute("src");
    video.load();
    return frames;
  } catch {
    return [];
  }
}

type RowStatus = "idle" | "uploading" | "done" | "error";

type Row = {
  key: string;
  file: File;
  path: string;
  previewUrl: string;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  duration: number | null;
  ratio: CreativeRatio | null;
  include: boolean;
  note: string | null;
  status: RowStatus;
  error: string | null;
  code: number;
  version: number;
  product: string;
  angle: string;
  format: CreativeFormat;
  creator: string;
  language: string;
  hook: string;
  /** Already named by the convention — keeps its code and version, skipped by the AI. */
  fixed: boolean;
  aiTried: boolean;
  aiGroup: string | null;
  aiVariant: string | null;
  aiNote: string | null;
};

let keySeq = 0;
let groupSeq = 0;

export function BulkImportDialog({
  open,
  incoming,
  onClose,
  creatives,
  folders,
  defaultFolder,
  onImported,
}: {
  open: boolean;
  incoming: DroppedFile[] | null;
  onClose: () => void;
  creatives: Creative[];
  folders: string[];
  defaultFolder: string | null;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [reading, setReading] = React.useState(false);
  const [skipped, setSkipped] = React.useState(0);
  const [importing, setImporting] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [bulkProduct, setBulkProduct] = React.useState("");
  const [autoAi, setAutoAi] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState<{ done: number; total: number } | null>(null);
  const analyzingRef = React.useRef(false);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  React.useEffect(() => {
    setAutoAi(localStorage.getItem(AI_PREF_KEY) !== "0");
  }, []);

  const products = React.useMemo(
    () => [...new Set([...folders, ...creatives.map((c) => c.product)])].sort(),
    [creatives, folders],
  );
  const creators = React.useMemo(
    () => [...new Set(creatives.filter((c) => c.creator).map((c) => c.creator))],
    [creatives],
  );
  const libraryNames = React.useMemo(() => new Set(creatives.map(nameOf)), [creatives]);
  const libraryCodes = React.useMemo(() => new Set(creatives.map((c) => c.code)), [creatives]);
  /** Latest file of each library concept: its version count and what the AI can match against. */
  const libraryConcepts = React.useMemo(() => {
    const latest = new Map<number, Creative>();
    for (const c of creatives) {
      const cur = latest.get(c.code);
      if (!cur || c.version > cur.version) latest.set(c.code, c);
    }
    return latest;
  }, [creatives]);

  const addFiles = React.useCallback(
    async (dropped: DroppedFile[]) => {
      const supported = dropped.filter((d) => isSupported(d.file));
      setSkipped((s) => s + dropped.length - supported.length);
      if (!supported.length) return;
      setReading(true);
      const probed = await mapLimit(supported, PROBE_CONCURRENCY, async (d) => {
        const file = await snapshotFile(d.file);
        const size = await readLocalMediaSize(file);
        return { ...d, file, size, key: `r${++keySeq}` };
      });

      const current = rowsRef.current;
      const nextCode =
        Math.max(0, ...creatives.map((c) => c.code), ...current.map((r) => r.code)) + 1;
      const suggestions = suggestImport(
        probed.map((p) => ({
          key: p.key,
          path: p.path,
          name: p.file.name,
          isVideo: isVideoFile(p.file),
          ratio: ratioFromSize(p.size?.width, p.size?.height),
        })),
        { products, creators, nextCode, defaultProduct: defaultFolder ?? undefined },
      );

      const seen = new Set(current.map((r) => `${r.file.name}|${r.file.size}`));
      const inLibrary = new Set(creatives.map((c) => `${c.originalName}|${c.sizeBytes}`));
      const newRows: Row[] = probed.map((p, i) => {
        const id = `${p.file.name}|${p.file.size}`;
        const note = inLibrary.has(id) ? "Already in the library" : seen.has(id) ? "Duplicate in this batch" : null;
        seen.add(id);
        const s = suggestions[i];
        return {
          key: p.key,
          file: p.file,
          path: p.path,
          previewUrl: URL.createObjectURL(p.file),
          isVideo: isVideoFile(p.file),
          width: p.size?.width ?? null,
          height: p.size?.height ?? null,
          duration: p.size?.duration ?? null,
          ratio: ratioFromSize(p.size?.width, p.size?.height),
          include: !note,
          note,
          status: "idle",
          error: null,
          code: s.code,
          version: s.version,
          product: s.product,
          angle: s.angle,
          format: s.format,
          creator: s.creator,
          language: s.language,
          hook: "",
          fixed: !!parseCreativeName(p.file.name.replace(/\.[^.]+$/, "")),
          aiTried: false,
          aiGroup: null,
          aiVariant: null,
          aiNote: null,
        };
      });
      setRows((prev) => [...prev, ...newRows].sort((a, b) => a.code - b.code || a.version - b.version));
      setReading(false);
    },
    [creatives, products, creators, defaultFolder],
  );

  React.useEffect(() => {
    if (open && incoming?.length) void addFiles(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incoming]);

  function reset() {
    for (const r of rowsRef.current) URL.revokeObjectURL(r.previewUrl);
    setRows([]);
    setSkipped(0);
    setBulkProduct("");
  }

  function close() {
    if (importing) return;
    reset();
    onClose();
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => {
      const target = prev.find((r) => r.key === key);
      if (!target) return prev;
      const conceptLevel: Partial<Row> = {};
      if (patch.product !== undefined) conceptLevel.product = patch.product;
      if (patch.angle !== undefined) conceptLevel.angle = patch.angle;
      return prev.map((r) =>
        r.key === key
          ? { ...r, ...patch }
          : r.code === target.code && Object.keys(conceptLevel).length
            ? { ...r, ...conceptLevel }
            : r,
      );
    });
  }

  /** AI fields on the analyzed rows, then codes and versions for every pending row from the groups. */
  function applyAnalysis(prev: Row[], results: Map<string, ContentAnalysis>): Row[] {
    const merged = prev.map((r) => {
      const a = results.get(r.key);
      if (!a) return r;
      const format = a.format ?? r.format;
      return {
        ...r,
        product: a.product || r.product,
        angle: a.angle || r.angle,
        hook: a.hook || r.hook,
        format,
        creator: format === "UGC" ? a.creator || r.creator : r.creator,
        language: a.language ?? r.language,
        aiGroup: a.group,
        aiVariant: a.variant,
        aiNote: a.note || null,
      };
    });

    const pending = merged.filter((r) => r.include && r.status !== "done" && !r.fixed);
    const libraryVersions = new Map([...libraryConcepts].map(([code, c]) => [code, c.version]));
    const reservedCodes = merged.filter((r) => r.fixed || r.status === "done").map((r) => r.code);
    const assigned = assignConcepts(
      pending.map((r) => ({
        key: r.key,
        ratio: r.ratio,
        group: r.aiGroup ?? (libraryCodes.has(r.code) ? creativeCode(r.code) : `name:${r.code}`),
        variant: r.aiVariant ?? `name:${r.code}:${r.version}`,
      })),
      {
        libraryVersions,
        nextCode: Math.max(0, ...libraryVersions.keys(), ...reservedCodes) + 1,
        reservedCodes,
      },
    );

    const lead = new Map<number, { product: string; angle: string; hook: string }>();
    for (const [code, c] of libraryConcepts) lead.set(code, { product: c.product, angle: c.angle, hook: c.hook ?? "" });
    for (const r of pending) {
      const code = assigned.get(r.key)!.code;
      if (!lead.has(code)) lead.set(code, { product: r.product, angle: r.angle, hook: r.hook });
    }
    return merged
      .map((r) => {
        const a = assigned.get(r.key);
        if (!a) return r;
        const l = lead.get(a.code)!;
        return {
          ...r,
          code: a.code,
          version: a.version,
          product: l.product || r.product,
          angle: l.angle || r.angle,
          hook: r.hook || l.hook,
        };
      })
      .sort((a, b) => a.code - b.code || a.version - b.version);
  }

  async function analyze(force = false) {
    if (analyzingRef.current) return;
    const pending = rowsRef.current.filter(
      (r) => r.include && r.status === "idle" && !r.fixed && (force || !r.aiTried),
    );
    if (!pending.length) return;
    analyzingRef.current = true;
    const pendingKeys = new Set(pending.map((r) => r.key));
    setRows((prev) => prev.map((r) => (pendingKeys.has(r.key) ? { ...r, aiTried: true } : r)));
    setAnalyzing({ done: 0, total: pending.length });

    const known = new Map<string, { group: string; product: string; angle: string; hook: string }>();
    for (const [code, c] of [...libraryConcepts].sort((a, b) => b[0] - a[0])) {
      known.set(creativeCode(code), { group: creativeCode(code), product: c.product, angle: c.angle, hook: c.hook ?? "" });
    }
    for (const r of rowsRef.current) {
      if (r.aiGroup && !pendingKeys.has(r.key) && !known.has(r.aiGroup)) {
        known.set(r.aiGroup, { group: r.aiGroup, product: r.product, angle: r.angle, hook: r.hook });
      }
    }

    const results = new Map<string, ContentAnalysis>();
    let failed = 0;
    let lastError = "";
    for (let b = 0; b < pending.length; b += AI_BATCH) {
      const batch = pending.slice(b, b + AI_BATCH);
      try {
        const items = await mapLimit(batch, 3, async (r) => ({
          key: r.key,
          name: r.file.name,
          path: r.path,
          isVideo: r.isVideo,
          ratio: r.ratio,
          frames: await previewFrames(r.previewUrl, r.isVideo, r.duration),
        }));
        const res = await fetch("/api/creatives/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, products, creators, knownGroups: [...known.values()] }),
        });
        const data = (await res.json().catch(() => ({}))) as { items?: ContentAnalysis[]; error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const local = new Map<string, string>();
        for (const it of data.items ?? []) {
          const raw = it.group ?? `solo-${it.key}`;
          let group = known.has(raw) ? raw : local.get(raw);
          if (!group) {
            group = `g${++groupSeq}`;
            local.set(raw, group);
            known.set(group, { group, product: it.product, angle: it.angle, hook: it.hook });
          }
          results.set(it.key, { ...it, group, variant: `${group}~${b}~${it.variant ?? it.key}` });
        }
        failed += batch.filter((r) => !results.has(r.key)).length;
      } catch (err) {
        failed += batch.length;
        lastError = err instanceof Error ? err.message : String(err);
      }
      setAnalyzing({ done: Math.min(b + AI_BATCH, pending.length), total: pending.length });
    }

    setRows((prev) => applyAnalysis(prev, results));
    setAnalyzing(null);
    analyzingRef.current = false;
    if (failed) {
      toast({
        title: `AI could not read ${failed} file${failed > 1 ? "s" : ""}`,
        description: lastError || "Those rows keep the suggestion from the file name.",
        variant: "destructive",
      });
    }
  }

  React.useEffect(() => {
    if (!open || !autoAi || reading || importing) return;
    if (rows.some((r) => r.include && r.status === "idle" && !r.fixed && !r.aiTried)) void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoAi, reading, importing, rows]);

  const included = rows.filter((r) => r.include && r.status !== "done");
  const finalName = (r: Row) =>
    buildCreativeName({
      code: r.code,
      product: r.product,
      angle: r.angle,
      format: r.format,
      creator: r.creator,
      aspectRatio: r.ratio ?? "1x1",
      version: r.version,
      language: r.language,
    });
  const nameCounts = new Map<string, number>();
  for (const r of included) nameCounts.set(finalName(r), (nameCounts.get(finalName(r)) ?? 0) + 1);
  const conflictOf = (r: Row): string | null => {
    if (!r.include || r.status === "done") return null;
    const n = finalName(r);
    if (libraryNames.has(n)) return "A file with this name is already in the library";
    if ((nameCounts.get(n) ?? 0) > 1) return "Two files would get the same name — change the version or code";
    return null;
  };
  const conflicts = included.filter((r) => conflictOf(r)).length;
  const conceptCount = new Set(included.map((r) => r.code)).size;
  const doneCount = rows.filter((r) => r.status === "done").length;

  async function runImport() {
    const queue = rowsRef.current.filter((r) => r.include && r.status !== "done");
    if (!queue.length) return;
    setImporting(true);
    let failed = 0;
    await mapLimit(queue, UPLOAD_CONCURRENCY, async (r) => {
      update(r.key, { status: "uploading", error: null });
      try {
        const fd = new FormData();
        fd.set("file", r.file);
        fd.set("mode", "explicit");
        fd.set("code", String(r.code));
        fd.set("version", String(r.version));
        fd.set("product", r.product);
        fd.set("angle", r.angle);
        fd.set("format", r.format);
        fd.set("creator", r.creator);
        fd.set("language", r.language);
        if (r.hook) fd.set("hook", r.hook);
        const res = await fetch("/api/creatives", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        update(r.key, { status: "done" });
      } catch (err) {
        failed += 1;
        update(r.key, { status: "error", error: uploadErrorMessage(err) });
      }
    });
    setImporting(false);
    onImported();
    if (failed) {
      toast({
        title: `${queue.length - failed} imported, ${failed} failed`,
        description: "The failed rows are marked — fix them and import again.",
        variant: "destructive",
      });
    } else {
      toast({ title: `${queue.length} creative${queue.length > 1 ? "s" : ""} imported` });
      reset();
      onClose();
    }
  }

  const allIncluded = rows.length > 0 && rows.every((r) => r.include || r.status === "done");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex max-h-[92vh] max-w-[min(1400px,96vw)] flex-col">
        <DialogHeader>
          <DialogTitle>Import creatives</DialogTitle>
          <DialogDescription>
            Drop your existing files or whole folders. The AI looks at each piece — reads the text, spots the product,
            angle and hook — and groups files with the same hook into one concept: same design in another size shares
            the version, a different execution becomes a new version. Review the table, adjust what&apos;s off, and
            import.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void collectDropped(e.dataTransfer).then(addFiles);
          }}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 transition-colors",
            dragging ? "border-accent bg-accent/10" : "border-border",
          )}
        >
          <FolderUp className="h-5 w-5 text-muted-foreground" />
          <div className="mr-auto text-xs">
            <p className="font-medium">Drop files or folders here</p>
            <p className="text-2xs text-muted-foreground">
              PNG, JPG, WebP, MP4, MOV · other files (project files, caches) are ignored
              {skipped ? ` · ${skipped} ignored so far` : ""}
            </p>
          </div>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-3.5 w-3.5" /> Choose files
          </Button>
          <Button size="sm" onClick={() => folderRef.current?.click()} disabled={importing}>
            <FolderOpen className="h-3.5 w-3.5" /> Choose folder
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.mov"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(files.map((file) => ({ file, path: file.name })));
            }}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
            }}
          />
        </div>

        {rows.length ? (
          <div className="flex flex-wrap items-center gap-2 text-2xs">
            <span className="text-muted-foreground">
              {included.length} file{included.length === 1 ? "" : "s"} → {conceptCount} concept
              {conceptCount === 1 ? "" : "s"}
              {doneCount ? ` · ${doneCount} imported` : ""}
            </span>
            {conflicts ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" /> {conflicts} name conflict{conflicts > 1 ? "s" : ""}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
              {analyzing ? (
                <span className="flex items-center gap-1 text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" /> AI is reading {analyzing.done}/{analyzing.total}…
                </span>
              ) : (
                <>
                  <label className="flex items-center gap-1 text-muted-foreground" title="Analyze new files as soon as they are added">
                    <input
                      type="checkbox"
                      checked={autoAi}
                      onChange={(e) => {
                        setAutoAi(e.target.checked);
                        localStorage.setItem(AI_PREF_KEY, e.target.checked ? "1" : "0");
                      }}
                    />
                    Auto
                  </label>
                  <Button
                    size="xs"
                    disabled={importing || reading || !included.some((r) => !r.fixed)}
                    onClick={() => void analyze(true)}
                    title="Look at the content of the checked files and regroup them"
                  >
                    <Sparkles className="h-3 w-3" /> Organize with AI
                  </Button>
                </>
              )}
              <span className="mx-1 h-4 w-px bg-border" />
              <Input
                value={bulkProduct}
                onChange={(e) => setBulkProduct(e.target.value)}
                list="bulk-products"
                placeholder="Product"
                className="h-7 w-32 text-xs"
              />
              <datalist id="bulk-products">
                {products.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <Button
                size="xs"
                disabled={!toProductCode(bulkProduct)}
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.include && r.status !== "done" ? { ...r, product: toProductCode(bulkProduct) } : r,
                    ),
                  )
                }
              >
                Set for checked rows
              </Button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {reading ? (
                <>
                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Reading files…
                </>
              ) : (
                "No files yet."
              )}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-2xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={allIncluded}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.status === "done" ? r : { ...r, include: e.target.checked })),
                        )
                      }
                      title="Select all"
                    />
                  </th>
                  <th className="px-1 py-1.5" />
                  <th className="px-2 py-1.5 text-left font-medium">Current file</th>
                  <th className="px-1 py-1.5 text-left font-medium">Code</th>
                  <th className="px-1 py-1.5 text-left font-medium">Ver.</th>
                  <th className="px-1 py-1.5 text-left font-medium">Product</th>
                  <th className="px-1 py-1.5 text-left font-medium">Angle</th>
                  <th className="px-1 py-1.5 text-left font-medium">Hook</th>
                  <th className="px-1 py-1.5 text-left font-medium">Format</th>
                  <th className="px-1 py-1.5 text-left font-medium">Creator</th>
                  <th className="px-1 py-1.5 text-left font-medium">Lang</th>
                  <th className="px-2 py-1.5 text-left font-medium">New name</th>
                  <th className="w-6 px-1 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const stripe = rows.findIndex((x) => x.code === r.code) % 2 === 0;
                  const firstOfGroup = i === 0 || rows[i - 1].code !== r.code;
                  const conflict = conflictOf(r);
                  const locked = r.status === "done" || r.status === "uploading" || importing;
                  return (
                    <tr
                      key={r.key}
                      className={cn(
                        "align-middle",
                        firstOfGroup && "border-t border-border",
                        !r.include && "opacity-50",
                        stripe ? "bg-background" : "bg-muted/30",
                      )}
                    >
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={locked}
                          onChange={(e) => update(r.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <div className="relative h-12 w-9 overflow-hidden rounded bg-muted">
                          {r.isVideo ? (
                            <>
                              <video
                                src={`${r.previewUrl}#t=0.5`}
                                muted
                                preload="metadata"
                                className="h-full w-full object-cover"
                              />
                              <Play className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow" />
                            </>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.previewUrl} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                      </td>
                      <td className="max-w-[220px] px-2 py-1">
                        <p className="truncate font-medium" title={r.path}>
                          {r.file.name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {r.path.includes("/") ? `${r.path.split("/").slice(0, -1).join("/")} · ` : ""}
                          {(r.file.size / 1024 / 1024).toFixed(1)} MB
                          {r.ratio ? ` · ${r.ratio.replace("x", ":")}` : ""}
                          {r.duration ? ` · ${fmtDuration(r.duration)}` : ""}
                        </p>
                        {r.aiNote ? (
                          <p className="line-clamp-2 text-2xs text-accent" title={r.aiNote}>
                            <Sparkles className="mr-0.5 inline h-2.5 w-2.5" />
                            {r.aiNote}
                          </p>
                        ) : analyzing && r.aiTried && !r.aiGroup && r.status === "idle" ? (
                          <p className="text-2xs text-muted-foreground">
                            <Loader2 className="mr-0.5 inline h-2.5 w-2.5 animate-spin" /> reading…
                          </p>
                        ) : null}
                        {r.note ? <p className="text-2xs text-warning">{r.note}</p> : null}
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-0.5">
                          <span className="font-mono text-2xs text-muted-foreground">{CREATIVE_CODE_PREFIX}</span>
                          <input
                            type="number"
                            min={1}
                            value={r.code}
                            disabled={locked}
                            onChange={(e) => update(r.key, { code: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                            className="h-7 w-14 rounded-md border border-input bg-background px-1 font-mono text-xs"
                            title={libraryCodes.has(r.code) ? "Joins an existing concept in the library" : "New concept"}
                          />
                        </div>
                        {libraryCodes.has(r.code) ? (
                          <p className="text-[10px] text-accent">existing</p>
                        ) : null}
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={1}
                          value={r.version}
                          disabled={locked}
                          onChange={(e) => update(r.key, { version: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                          className="h-7 w-11 rounded-md border border-input bg-background px-1 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.product}
                          disabled={locked}
                          list="bulk-products"
                          placeholder="Product"
                          onChange={(e) => update(r.key, { product: toProductCode(e.target.value) })}
                          className={cn(
                            "h-7 w-24 rounded-md border bg-background px-1.5 text-xs",
                            r.product ? "border-input" : "border-warning",
                          )}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.angle}
                          disabled={locked}
                          onChange={(e) => update(r.key, { angle: e.target.value })}
                          className="h-7 w-36 rounded-md border border-input bg-background px-1.5 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.hook}
                          disabled={locked}
                          placeholder="Headline / first line"
                          title={r.hook || undefined}
                          onChange={(e) => update(r.key, { hook: e.target.value })}
                          className="h-7 w-48 rounded-md border border-input bg-background px-1.5 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select
                          value={r.format}
                          disabled={locked}
                          onChange={(e) => update(r.key, { format: e.target.value as CreativeFormat })}
                          className="h-7 rounded-md border border-input bg-background px-1 text-xs"
                        >
                          {(Object.keys(CREATIVE_FORMATS) as CreativeFormat[]).map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={r.creator}
                          disabled={locked || r.format !== "UGC"}
                          placeholder={r.format === "UGC" ? "Who" : "—"}
                          onChange={(e) => update(r.key, { creator: e.target.value })}
                          className="h-7 w-20 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-40"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select
                          value={r.language}
                          disabled={locked}
                          onChange={(e) => update(r.key, { language: e.target.value })}
                          className="h-7 rounded-md border border-input bg-background px-1 text-xs"
                        >
                          {CREATIVE_LANGUAGES.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-[300px] px-2 py-1">
                        <p
                          className={cn("break-all font-mono text-[10px] leading-tight", conflict && "text-destructive")}
                          title={conflict ?? undefined}
                        >
                          {finalName(r)}
                        </p>
                        {r.error ? <p className="text-2xs text-destructive">{r.error}</p> : null}
                      </td>
                      <td className="px-1 py-1">
                        {r.status === "uploading" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : r.status === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : r.status === "error" ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : conflict ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-muted-foreground">
            Same code = same concept (edit product or angle once, the whole concept follows). Your original files are
            not changed.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={importing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!included.length || importing || conflicts > 0 || reading || !!analyzing}
              onClick={() => void runImport()}
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import {included.length || ""} file{included.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
