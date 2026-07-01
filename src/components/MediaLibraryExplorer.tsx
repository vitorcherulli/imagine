"use client";

import * as React from "react";
import {
  ChevronRight,
  Download,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import type { MediaLibraryAsset, MediaLibraryFolder } from "@/lib/db/schema";
import { galleryAssetThumbnailFallback, galleryAssetThumbnailUrl, isVideoAsset } from "@/lib/gallery-asset-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FolderNode = MediaLibraryFolder & { children: FolderNode[] };

const ASSET_DRAG_MIME = "text/x-imagine-media-asset-id";

function downloadFilename(asset: MediaLibraryAsset): string {
  const base = asset.name.replace(/[<>:"/\\|?*]/g, "_").trim() || "media";
  const fromMime = asset.mimeType?.split("/")[1]?.replace("jpeg", "jpg");
  const fromUrl = asset.url.match(/\.(\w+)(?:\?|#|$)/)?.[1]?.toLowerCase();
  const ext =
    fromMime ??
    fromUrl ??
    (isVideoAsset(asset) ? "mp4" : "jpg");
  if (base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `${base}.${ext}`;
}

async function downloadAssetFile(asset: MediaLibraryAsset): Promise<void> {
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error("Could not download file");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadFilename(asset);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function folderDropHandlers(
  targetFolderId: string | null,
  draggingAssetId: string | null,
  setDragOverFolderId: React.Dispatch<React.SetStateAction<string | null>>,
  onDropAsset: (assetId: string, folderId: string | null) => void,
) {
  const dropKey = targetFolderId ?? "__root__";
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!draggingAssetId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverFolderId(dropKey);
    },
    onDragLeave: () => {
      setDragOverFolderId((current) => (current === dropKey ? null : current));
    },
    onDrop: (e: React.DragEvent) => {
      if (!draggingAssetId) return;
      e.preventDefault();
      const assetId =
        draggingAssetId || e.dataTransfer.getData(ASSET_DRAG_MIME);
      setDragOverFolderId(null);
      if (!assetId) return;
      void onDropAsset(assetId, targetFolderId);
    },
  };
}

function findFolderPath(
  nodes: FolderNode[],
  targetId: string | null,
  trail: MediaLibraryFolder[] = [],
): MediaLibraryFolder[] {
  if (targetId === null) return trail;
  for (const node of nodes) {
    if (node.id === targetId) return [...trail, node];
    const nested = findFolderPath(node.children, targetId, [...trail, node]);
    if (nested.some((f) => f.id === targetId)) return nested;
  }
  return trail;
}

function FolderTreeItem({
  node,
  depth,
  currentFolderId,
  onSelect,
  draggingAssetId,
  dragOverFolderId,
  setDragOverFolderId,
  onDropAsset,
}: {
  node: FolderNode;
  depth: number;
  currentFolderId: string | null;
  onSelect: (id: string) => void;
  draggingAssetId: string | null;
  dragOverFolderId: string | null;
  setDragOverFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  onDropAsset: (assetId: string, folderId: string | null) => void;
}) {
  const active = currentFolderId === node.id;
  const dropKey = node.id;
  const dragOver = draggingAssetId && dragOverFolderId === dropKey;
  const drop = folderDropHandlers(node.id, draggingAssetId, setDragOverFolderId, onDropAsset);
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs",
          active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          dragOver && "bg-accent/60 ring-1 ring-accent",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        {...drop}
      >
        {active ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.children.map((child) => (
        <FolderTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          onSelect={onSelect}
          draggingAssetId={draggingAssetId}
          dragOverFolderId={dragOverFolderId}
          setDragOverFolderId={setDragOverFolderId}
          onDropAsset={onDropAsset}
        />
      ))}
    </>
  );
}

function GalleryAssetThumb({ asset }: { asset: MediaLibraryAsset }) {
  const thumbUrl = React.useMemo(() => galleryAssetThumbnailUrl(asset), [asset]);
  const fallbackUrl = React.useMemo(
    () => galleryAssetThumbnailFallback(asset, thumbUrl),
    [asset, thumbUrl],
  );
  const [activeSrc, setActiveSrc] = React.useState<string | null>(thumbUrl);
  const [broken, setBroken] = React.useState(false);
  const video = isVideoAsset(asset);

  React.useEffect(() => {
    setActiveSrc(thumbUrl);
    setBroken(false);
  }, [thumbUrl]);

  function handleError() {
    if (activeSrc === thumbUrl && fallbackUrl) {
      setActiveSrc(fallbackUrl);
      setBroken(false);
      return;
    }
    setBroken(true);
  }

  return (
    <div className="relative aspect-[4/3] w-full bg-muted/40">
      {activeSrc && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeSrc}
          alt={asset.name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={handleError}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
          {video ? <Film className="h-7 w-7 opacity-50" /> : <ImageIcon className="h-7 w-7 opacity-50" />}
          <span className="px-2 text-center text-[9px] leading-tight opacity-70">
            {video ? "Video preview unavailable" : "Image unavailable"}
          </span>
        </div>
      )}
      {video ? (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
          video
        </span>
      ) : null}
    </div>
  );
}

export function MediaLibraryExplorer() {
  const { toast } = useToast();
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [tree, setTree] = React.useState<FolderNode[]>([]);
  const [folders, setFolders] = React.useState<MediaLibraryFolder[]>([]);
  const [assets, setAssets] = React.useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [draggingAssetId, setDraggingAssetId] = React.useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const rootDrop = folderDropHandlers(
    null,
    draggingAssetId,
    setDragOverFolderId,
    (assetId, targetFolderId) => void moveAssetToFolder(assetId, targetFolderId),
  );

  const load = React.useCallback(async (targetFolderId: string | null) => {
    setLoading(true);
    try {
      const query = targetFolderId ? `?folderId=${encodeURIComponent(targetFolderId)}` : "";
      const res = await fetch(`/api/media-library${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load gallery");
      setTree(data.tree ?? []);
      setFolders(data.folders ?? []);
      setAssets(data.assets ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Gallery error",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const prunedRef = React.useRef(false);
  React.useEffect(() => {
    if (prunedRef.current) return;
    prunedRef.current = true;
    void fetch("/api/media-library/prune", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ prunedCount?: number }>;
      })
      .then((data) => {
        if (data?.prunedCount) void load(folderId);
      })
      .catch(() => {});
  }, [folderId, load]);

  React.useEffect(() => {
    void load(folderId);
  }, [folderId, load]);

  const breadcrumbs = React.useMemo(
    () => findFolderPath(tree, folderId),
    [tree, folderId],
  );

  const childFolders = React.useMemo(
    () =>
      folders.filter((f) =>
        folderId === null ? f.parentId == null : f.parentId === folderId,
      ),
    [folders, folderId],
  );

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/media-library/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: folderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setNewFolderOpen(false);
      setNewFolderName("");
      await load(folderId);
      toast({ variant: "success", title: `Folder "${name}" created` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not create folder",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("image", file);
        if (folderId) form.append("folderId", folderId);
        const res = await fetch("/api/media-library/assets", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
      }
      await load(folderId);
      toast({ variant: "success", title: "Image(s) uploaded to gallery" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(assetId: string) {
    if (!confirm("Remove this image from the gallery? (Files used on timeline stay in place.)")) {
      return;
    }
    try {
      const res = await fetch(`/api/media-library/assets/${assetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  async function moveAssetToFolder(assetId: string, targetFolderId: string | null) {
    const asset = assets.find((a) => a.id === assetId);
    if ((asset?.folderId ?? null) === targetFolderId) return;

    try {
      const res = await fetch(`/api/media-library/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Move failed");

      const folderName =
        targetFolderId === null
          ? "Gallery root"
          : folders.find((f) => f.id === targetFolderId)?.name ?? "folder";
      await load(folderId);
      toast({ variant: "success", title: `Moved to ${folderName}` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not move image",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setDraggingAssetId(null);
      setDragOverFolderId(null);
    }
  }

  async function handleDownload(asset: MediaLibraryAsset) {
    try {
      await downloadAssetFile(asset);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
            onClick={() => setFolderId(null)}
          >
            <Home className="h-3.5 w-3.5" />
            Gallery
          </button>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <button
                type="button"
                className="truncate rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
                onClick={() => setFolderId(crumb.id)}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New folder
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-auto border-r border-border p-2 scrollbar-thin">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={cn(
              "mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs",
              folderId === null ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              draggingAssetId &&
                dragOverFolderId === "__root__" &&
                "bg-accent/60 ring-1 ring-accent",
            )}
            {...rootDrop}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            All at root
          </button>
          {tree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              depth={0}
              currentFolderId={folderId}
              onSelect={setFolderId}
              draggingAssetId={draggingAssetId}
              dragOverFolderId={dragOverFolderId}
              setDragOverFolderId={setDragOverFolderId}
              onDropAsset={(assetId, targetFolderId) =>
                void moveAssetToFolder(assetId, targetFolderId)
              }
            />
          ))}
        </aside>

        <div className="min-w-0 flex-1 overflow-auto p-3 scrollbar-thin">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : childFolders.length === 0 && assets.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p>No images in this folder yet.</p>
              <p className="text-xs">
                Generated keyframes and imported references appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {childFolders.map((sub) => {
                const subDrop = folderDropHandlers(
                  sub.id,
                  draggingAssetId,
                  setDragOverFolderId,
                  (assetId, targetFolderId) => void moveAssetToFolder(assetId, targetFolderId),
                );
                const dragOver = draggingAssetId && dragOverFolderId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setFolderId(sub.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-md border border-border bg-background p-4 text-left transition-colors hover:bg-muted",
                      dragOver && "ring-2 ring-accent",
                    )}
                    {...subDrop}
                  >
                    <Folder className="h-10 w-10 text-amber-500" />
                    <span className="w-full truncate text-center text-xs font-medium">{sub.name}</span>
                  </button>
                );
              })}
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingAssetId(asset.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
                  }}
                  onDragEnd={() => {
                    setDraggingAssetId(null);
                    setDragOverFolderId(null);
                  }}
                  className={cn(
                    "group relative cursor-grab overflow-hidden rounded-md border border-border bg-background active:cursor-grabbing",
                    draggingAssetId === asset.id && "opacity-50",
                  )}
                >
                  <GalleryAssetThumb asset={asset} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                    <p className="truncate text-[10px] font-medium text-white">{asset.name}</p>
                    <p className="truncate text-[9px] text-white/70">{asset.source}</p>
                  </div>
                  <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded bg-black/50 p-1 text-white hover:bg-black/70"
                      title="Download image"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownload(asset);
                      }}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded bg-black/50 p-1 text-white hover:bg-black/70"
                      title="Remove from gallery"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteAsset(asset.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="media-folder-name">Name</Label>
            <Input
              id="media-folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Capitólio references"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
              }}
            />
            {folderId ? (
              <p className="text-xs text-muted-foreground">
                Inside: {breadcrumbs[breadcrumbs.length - 1]?.name ?? "folder"}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!newFolderName.trim()} onClick={() => void createFolder()}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
