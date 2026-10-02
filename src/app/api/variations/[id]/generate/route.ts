import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getOwnedVariationSet, startVariations } from "@/lib/variations-server";
import {
  isVariationImageModel,
  MAX_VARIATIONS_PER_REQUEST,
  VARIATION_ASPECTS,
  VARIATION_TEXT_MODES,
} from "@/lib/variations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  count: z.number().int().min(1).max(MAX_VARIATIONS_PER_REQUEST).default(4),
  instructions: z.string().max(1000).nullable().optional(),
  aspectRatio: z.enum(VARIATION_ASPECTS).optional(),
  imageModel: z.string().refine(isVariationImageModel, "Unknown image model").optional(),
  textMode: z.enum(VARIATION_TEXT_MODES).optional(),
  customText: z.string().max(300).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const set = await getOwnedVariationSet(params.id, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const { count, instructions, aspectRatio, imageModel, textMode, customText } = parsed.data;
  if (textMode === "custom" && !customText?.trim()) {
    return NextResponse.json({ error: "Write the text you want on the image" }, { status: 400 });
  }

  await db
    .update(schema.variationSets)
    .set({
      ...(instructions !== undefined ? { instructions: instructions?.trim() || null } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(imageModel ? { imageModel } : {}),
      ...(textMode ? { textMode } : {}),
      ...(customText !== undefined ? { customText: customText?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.variationSets.id, set.id));

  const fresh = await getOwnedVariationSet(set.id, userId);
  if (!fresh) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await startVariations(fresh, count);
  return NextResponse.json({ ok: true, items });
}
