import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { deletePhotoBatchMedia } from "@/lib/storage";
import { getOwnedPhotoBatch, listPhotoBatchItems } from "@/lib/photo-batch-server";
import { PHOTO_BATCH_ASPECTS } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  instructions: z.string().max(2000).nullable().optional(),
  imageModel: z.string().refine(isModelId, "Unknown image model").optional(),
  aspectRatio: z.enum(PHOTO_BATCH_ASPECTS).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ batch, items: await listPhotoBatchItems(batch.id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const { name, instructions, imageModel, aspectRatio } = parsed.data;

  await db
    .update(schema.photoBatches)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions: instructions?.trim() || null } : {}),
      ...(imageModel !== undefined ? { imageModel } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.photoBatches.id, batch.id));

  return NextResponse.json({ batch: await getOwnedPhotoBatch(batch.id, userId) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(schema.photoBatchItems).where(eq(schema.photoBatchItems.batchId, batch.id));
  await db.delete(schema.photoBatches).where(eq(schema.photoBatches.id, batch.id));
  await deletePhotoBatchMedia(userId, batch.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
