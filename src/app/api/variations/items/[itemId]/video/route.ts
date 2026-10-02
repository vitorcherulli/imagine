import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  getOwnedVariationItem,
  getOwnedVariationSet,
  resolveVariationModels,
  startVariationVideo,
} from "@/lib/variations-server";
import { isVariationVideoModel } from "@/lib/variations";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const bodySchema = z.object({
  prompt: z.string().max(600).nullable().optional(),
  durationSeconds: z.number().int().min(3).max(15).default(5),
  videoModel: z.string().refine(isVariationVideoModel, "Unknown video model").optional(),
});

export async function POST(req: NextRequest, { params }: { params: { itemId: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await getOwnedVariationItem(params.itemId, userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "ready" || !item.imageUrl) {
    return NextResponse.json({ error: "Wait for the image to finish first" }, { status: 400 });
  }
  if (item.videoStatus === "generating") {
    return NextResponse.json({ error: "A video is already being generated" }, { status: 409 });
  }
  const set = await getOwnedVariationSet(item.setId, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const videoModel = parsed.data.videoModel ?? resolveVariationModels(set).videoModel;
  if (videoModel !== set.videoModel) {
    await db
      .update(schema.variationSets)
      .set({ videoModel, updatedAt: new Date() })
      .where(eq(schema.variationSets.id, set.id));
  }

  await startVariationVideo(set, item, {
    prompt: parsed.data.prompt ?? null,
    durationSeconds: parsed.data.durationSeconds,
    videoModel,
  });
  return NextResponse.json({ ok: true });
}
