import type { PhotoBatchItem } from "@/lib/db/schema";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const SHRINK_ABOVE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_CONCURRENCY = 3;

/** Files dropped on the batches list, picked up by the editor right after navigation. */
export const pendingUploads = new Map<string, File[]>();

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.split(",").includes(file.type);
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadPhoto(batchId: string, file: File): Promise<PhotoBatchItem> {
  const size = await readImageSize(file);
  const upload = file.size > SHRINK_ABOVE_BYTES ? await shrinkImageFile(file, 2400, 0.9) : file;
  const fd = new FormData();
  fd.set("image", upload);
  fd.set("name", file.name);
  if (size) {
    fd.set("width", String(size.width));
    fd.set("height", String(size.height));
  }
  const res = await fetch(`/api/photo-batches/${batchId}/photos`, { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { item?: PhotoBatchItem; error?: string };
  if (!res.ok || !data.item) throw new Error(data.error || `HTTP ${res.status}`);
  return data.item;
}

export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}
