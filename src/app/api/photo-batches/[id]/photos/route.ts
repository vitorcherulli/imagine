import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { addPhotoToBatch, getOwnedPhotoBatch, setPhotosApproved } from "@/lib/photo-batch-server";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_BATCH } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const bulkSchema = z.object({
  itemIds: z.array(z.string()).min(1).max(MAX_PHOTOS_PER_BATCH),
  approved: z.boolean(),
});

function dimension(value: FormDataEntryValue | null): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Upload one photo into the batch. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo received" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: `${file.name}: use JPG, PNG or WebP` }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: `${file.name} is larger than 20MB` }, { status: 400 });
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.photoBatchItems)
    .where(eq(schema.photoBatchItems.batchId, batch.id));
  if (Number(total) >= MAX_PHOTOS_PER_BATCH) {
    return NextResponse.json({ error: `Up to ${MAX_PHOTOS_PER_BATCH} photos per batch` }, { status: 400 });
  }

  const item = await addPhotoToBatch({
    batch,
    buffer: Buffer.from(await file.arrayBuffer()),
    ext,
    originalName: String(form.get("name") ?? "") || file.name,
    width: dimension(form.get("width")),
    height: dimension(form.get("height")),
  });
  return NextResponse.json({ item });
}

/** Approve or unapprove several edited photos at once. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bulkSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  await setPhotosApproved(batch, parsed.data.itemIds, parsed.data.approved);
  return NextResponse.json({ ok: true });
}
