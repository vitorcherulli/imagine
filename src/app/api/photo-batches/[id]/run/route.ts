import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { getOwnedPhotoBatch, queuePhotoEdits } from "@/lib/photo-batch-server";
import { MAX_PHOTOS_PER_BATCH, PHOTO_BATCH_ASPECTS } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  itemIds: z.array(z.string()).min(1).max(MAX_PHOTOS_PER_BATCH),
  instructions: z.string().trim().min(1).max(2000),
  imageModel: z.string().refine(isModelId, "Unknown image model").optional(),
  aspectRatio: z.enum(PHOTO_BATCH_ASPECTS).optional(),
});

/** The "Done" button: edit the chosen photos with one instruction. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick at least one photo and write what to change" }, { status: 400 });
  }
  const { itemIds, instructions, imageModel, aspectRatio } = parsed.data;

  await db
    .update(schema.photoBatches)
    .set({
      instructions,
      ...(imageModel ? { imageModel } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.photoBatches.id, batch.id));

  const fresh = await getOwnedPhotoBatch(batch.id, userId);
  if (!fresh) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const queued = await queuePhotoEdits(fresh, itemIds, instructions);
  return NextResponse.json({ ok: true, queued });
}
