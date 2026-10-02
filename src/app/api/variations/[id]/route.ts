import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { deleteVariationSetMedia } from "@/lib/storage";
import { getOwnedVariationSet, listVariationItems } from "@/lib/variations-server";
import {
  isVariationImageModel,
  isVariationVideoModel,
  VARIATION_ASPECTS,
} from "@/lib/variations";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  instructions: z.string().max(1000).nullable().optional(),
  aspectRatio: z.enum(VARIATION_ASPECTS).optional(),
  imageModel: z.string().refine(isVariationImageModel, "Unknown image model").optional(),
  videoModel: z.string().refine(isVariationVideoModel, "Unknown video model").optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const set = await getOwnedVariationSet(params.id, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ set, items: await listVariationItems(set.id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const set = await getOwnedVariationSet(params.id, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const { name, instructions, aspectRatio, imageModel, videoModel } = parsed.data;

  await db
    .update(schema.variationSets)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions: instructions?.trim() || null } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      ...(imageModel !== undefined ? { imageModel } : {}),
      ...(videoModel !== undefined ? { videoModel } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.variationSets.id, set.id));

  return NextResponse.json({ set: await getOwnedVariationSet(set.id, userId) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const set = await getOwnedVariationSet(params.id, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(schema.variationItems).where(eq(schema.variationItems.setId, set.id));
  await db.delete(schema.variationSets).where(eq(schema.variationSets.id, set.id));
  await deleteVariationSetMedia(userId, set.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
