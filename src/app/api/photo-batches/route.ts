import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { getOwnedPhotoBatch } from "@/lib/photo-batch-server";
import { DEFAULT_PHOTO_BATCH_NAME } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().max(80).optional(),
  imageModel: z.string().refine(isModelId, "Unknown image model").optional(),
});

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batches = await db
    .select()
    .from(schema.photoBatches)
    .where(eq(schema.photoBatches.userId, userId))
    .orderBy(desc(schema.photoBatches.updatedAt));
  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const id = createId();
  const now = new Date();
  await db.insert(schema.photoBatches).values({
    id,
    userId,
    name: parsed.data.name || DEFAULT_PHOTO_BATCH_NAME,
    imageModel: parsed.data.imageModel ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ batch: await getOwnedPhotoBatch(id, userId) });
}
