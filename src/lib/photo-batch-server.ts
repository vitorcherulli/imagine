import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, lt, max, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PhotoBatch, PhotoBatchItem } from "@/lib/db/schema";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";
import { generateImage } from "@/lib/openrouter/images";
import { catalogImageParams, imageResultToBuffer } from "@/lib/image-model-params";
import { isModelId } from "@/lib/model-catalog";
import { readImagePixelSize } from "@/lib/ffmpeg";
import { registerGeneratedMediaSafe } from "@/lib/media-library-server";
import {
  deleteMediaByPublicUrl,
  readImageAsDataUrl,
  savePhotoBatchBuffer,
  withCacheBuster,
} from "@/lib/storage";
import { PHOTO_BATCH_GALLERY_FOLDER, photoEditAspect } from "@/lib/photo-batch";

const STALE_MS = 15 * 60 * 1000;
const CONCURRENCY = Math.max(1, Number(process.env.PHOTO_BATCH_CONCURRENCY) || 3);

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export function resolvePhotoBatchModel(batch: Pick<PhotoBatch, "imageModel">): string {
  return isModelId(batch.imageModel) ? batch.imageModel : OPENROUTER_MODELS.image;
}

export async function getOwnedPhotoBatch(batchId: string, userId: string): Promise<PhotoBatch | null> {
  const [row] = await db
    .select()
    .from(schema.photoBatches)
    .where(and(eq(schema.photoBatches.id, batchId), eq(schema.photoBatches.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getOwnedPhotoBatchItem(itemId: string, userId: string): Promise<PhotoBatchItem | null> {
  const [row] = await db
    .select()
    .from(schema.photoBatchItems)
    .where(and(eq(schema.photoBatchItems.id, itemId), eq(schema.photoBatchItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPhotoBatchItems(batchId: string): Promise<PhotoBatchItem[]> {
  // Edits lost to a server restart stay "editing" forever; surface them as errors.
  await db
    .update(schema.photoBatchItems)
    .set({ status: "error", error: "Interrupted — try again.", updatedAt: new Date() })
    .where(
      and(
        eq(schema.photoBatchItems.batchId, batchId),
        eq(schema.photoBatchItems.status, "editing"),
        lt(schema.photoBatchItems.updatedAt, new Date(Date.now() - STALE_MS)),
      ),
    );
  const items = await db
    .select()
    .from(schema.photoBatchItems)
    .where(eq(schema.photoBatchItems.batchId, batchId))
    .orderBy(asc(schema.photoBatchItems.position), asc(schema.photoBatchItems.createdAt));
  // Queued photos left behind by a restart resume as soon as someone looks at the batch.
  if (items.some((i) => i.status === "queued")) pumpPhotoBatchQueue();
  return items;
}

export async function addPhotoToBatch(input: {
  batch: PhotoBatch;
  buffer: Buffer;
  ext: string;
  originalName: string;
  width: number | null;
  height: number | null;
}): Promise<PhotoBatchItem> {
  const id = createId();
  const sourceUrl = withCacheBuster(
    await savePhotoBatchBuffer(input.batch.userId, input.batch.id, `src-${id}.${input.ext}`, input.buffer),
  );
  const size = readImagePixelSize(input.buffer);
  const [{ last }] = await db
    .select({ last: max(schema.photoBatchItems.position) })
    .from(schema.photoBatchItems)
    .where(eq(schema.photoBatchItems.batchId, input.batch.id));
  const now = new Date();
  await db.insert(schema.photoBatchItems).values({
    id,
    batchId: input.batch.id,
    userId: input.batch.userId,
    position: (last ?? -1) + 1,
    originalName: input.originalName.slice(0, 200),
    sourceUrl,
    width: size?.width ?? input.width,
    height: size?.height ?? input.height,
    status: "idle",
    createdAt: now,
    updatedAt: now,
  });
  await touchBatch(input.batch.id);
  const item = await getOwnedPhotoBatchItem(id, input.batch.userId);
  if (!item) throw new Error("Could not save the photo.");
  return item;
}

export async function touchBatch(batchId: string): Promise<void> {
  await db
    .update(schema.photoBatches)
    .set({ updatedAt: new Date() })
    .where(eq(schema.photoBatches.id, batchId));
}

function buildEditPrompt(instructions: string): string {
  return [
    "Edit the attached photo. Apply ONLY this change:",
    instructions.trim(),
    "Keep everything else exactly as it is: the same people (faces, identity, body, pose), the same product (shape, colors, label, logo), the composition and framing, and any text already in the photo — unless the change above asks otherwise.",
    "Photorealistic, high quality, natural result. No watermarks, no added text, no borders.",
  ].join("\n");
}

/** Put photos in line for an edit; photos already in line or being edited are left alone. */
export async function queuePhotoEdits(
  batch: PhotoBatch,
  itemIds: string[],
  instructions: string,
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const model = resolvePhotoBatchModel(batch);
  const queued = await db
    .update(schema.photoBatchItems)
    .set({
      status: "queued",
      error: null,
      approved: false,
      instructions,
      imageModel: model,
      attempts: sql`${schema.photoBatchItems.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.photoBatchItems.batchId, batch.id),
        inArray(schema.photoBatchItems.id, itemIds),
        notInArray(schema.photoBatchItems.status, ["queued", "editing"]),
      ),
    )
    .returning({ id: schema.photoBatchItems.id });
  await touchBatch(batch.id);
  pumpPhotoBatchQueue();
  return queued.length;
}

async function runPhotoEdit(item: PhotoBatchItem): Promise<void> {
  try {
    const [batch] = await db
      .select()
      .from(schema.photoBatches)
      .where(eq(schema.photoBatches.id, item.batchId))
      .limit(1);
    if (!batch) return;
    if (!item.instructions?.trim()) throw new Error("No instruction for this edit.");
    const model = isModelId(item.imageModel) ? item.imageModel : resolvePhotoBatchModel(batch);
    const aspect = photoEditAspect(batch.aspectRatio, item.width, item.height);
    const reference = await readImageAsDataUrl(item.sourceUrl);
    const img = await generateImage({
      prompt: buildEditPrompt(item.instructions),
      model,
      ...(await catalogImageParams(model, aspect, { withReferences: true })),
      referenceImages: [reference],
      referenceImagesFirst: true,
    });
    const resultUrl = withCacheBuster(
      await savePhotoBatchBuffer(batch.userId, batch.id, `${item.id}.png`, await imageResultToBuffer(img)),
    );
    await db
      .update(schema.photoBatchItems)
      .set({ resultUrl, status: "ready", error: null, updatedAt: new Date() })
      .where(and(eq(schema.photoBatchItems.id, item.id), eq(schema.photoBatchItems.status, "editing")));
  } catch (err) {
    console.error(`[photo-batch] edit ${item.id} failed`, err);
    await db
      .update(schema.photoBatchItems)
      .set({ status: "error", error: errorMessage(err), updatedAt: new Date() })
      .where(and(eq(schema.photoBatchItems.id, item.id), eq(schema.photoBatchItems.status, "editing")));
  }
}

type QueueState = { active: Set<string>; pumping: boolean; again: boolean };

// On globalThis so every route bundle (and dev hot reloads) share one queue.
const queue: QueueState = ((globalThis as { __photoBatchQueue?: QueueState }).__photoBatchQueue ??= {
  active: new Set(),
  pumping: false,
  again: false,
});

/** Starts queued edits, oldest first, keeping at most CONCURRENCY running across all batches. */
export function pumpPhotoBatchQueue(): void {
  if (queue.pumping) {
    queue.again = true;
    return;
  }
  queue.pumping = true;
  void (async () => {
    try {
      do {
        queue.again = false;
        while (queue.active.size < CONCURRENCY) {
          const [next] = await db
            .select()
            .from(schema.photoBatchItems)
            .where(eq(schema.photoBatchItems.status, "queued"))
            .orderBy(asc(schema.photoBatchItems.updatedAt), asc(schema.photoBatchItems.position))
            .limit(1);
          if (!next) break;
          const claimed = await db
            .update(schema.photoBatchItems)
            .set({ status: "editing", updatedAt: new Date() })
            .where(and(eq(schema.photoBatchItems.id, next.id), eq(schema.photoBatchItems.status, "queued")))
            .returning({ id: schema.photoBatchItems.id });
          if (claimed.length === 0) continue;
          queue.active.add(next.id);
          void runPhotoEdit(next).finally(() => {
            queue.active.delete(next.id);
            pumpPhotoBatchQueue();
          });
        }
      } while (queue.again);
    } catch (err) {
      console.error("[photo-batch] queue failed", err);
    } finally {
      queue.pumping = false;
    }
  })();
}

export async function setPhotosApproved(
  batch: PhotoBatch,
  itemIds: string[],
  approved: boolean,
): Promise<void> {
  if (itemIds.length === 0) return;
  const where = and(
    eq(schema.photoBatchItems.batchId, batch.id),
    inArray(schema.photoBatchItems.id, itemIds),
    eq(schema.photoBatchItems.status, "ready"),
  );
  await db
    .update(schema.photoBatchItems)
    .set({ approved, updatedAt: new Date() })
    .where(where);
  if (!approved) return;
  const rows = await db.select().from(schema.photoBatchItems).where(where);
  for (const row of rows) {
    if (!row.resultUrl) continue;
    registerGeneratedMediaSafe({
      userId: batch.userId,
      url: row.resultUrl,
      name: `${batch.name} — ${row.originalName.replace(/\.[^.]+$/, "")}`,
      product: PHOTO_BATCH_GALLERY_FOLDER,
    });
  }
}

export async function deletePhotoBatchItemMedia(item: PhotoBatchItem): Promise<void> {
  await deleteMediaByPublicUrl(item.sourceUrl);
  await deleteMediaByPublicUrl(item.resultUrl);
}
