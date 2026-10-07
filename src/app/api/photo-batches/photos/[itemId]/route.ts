import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  deletePhotoBatchItemMedia,
  getOwnedPhotoBatch,
  getOwnedPhotoBatchItem,
  queuePhotoEdits,
  setPhotosApproved,
  touchBatch,
} from "@/lib/photo-batch-server";
import { isPhotoBatchBusy } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  instructions: z.string().trim().max(2000).nullable().optional(),
});

const patchSchema = z.object({ approved: z.boolean() });

async function load(itemId: string) {
  const userId = await tryUser();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const item = await getOwnedPhotoBatchItem(itemId, userId);
  const batch = item ? await getOwnedPhotoBatch(item.batchId, userId) : null;
  if (!item || !batch) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { item, batch } as const;
}

/** Edit this photo again from the original — with a new instruction or the last one. */
export async function POST(req: NextRequest, { params }: { params: { itemId: string } }) {
  const ctx = await load(params.itemId);
  if ("error" in ctx) return ctx.error;
  const parsed = retrySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const instructions =
    parsed.data.instructions?.trim() || ctx.item.instructions?.trim() || ctx.batch.instructions?.trim();
  if (!instructions) return NextResponse.json({ error: "Write what to change" }, { status: 400 });
  if (isPhotoBatchBusy(ctx.item.status)) {
    return NextResponse.json({ error: "This photo is already being edited" }, { status: 409 });
  }
  await queuePhotoEdits(ctx.batch, [ctx.item.id], instructions);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { itemId: string } }) {
  const ctx = await load(params.itemId);
  if ("error" in ctx) return ctx.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  await setPhotosApproved(ctx.batch, [ctx.item.id], parsed.data.approved);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { itemId: string } }) {
  const ctx = await load(params.itemId);
  if ("error" in ctx) return ctx.error;
  await db.delete(schema.photoBatchItems).where(eq(schema.photoBatchItems.id, ctx.item.id));
  await deletePhotoBatchItemMedia(ctx.item).catch(() => {});
  await touchBatch(ctx.batch.id);
  return NextResponse.json({ ok: true });
}
