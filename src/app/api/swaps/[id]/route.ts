import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { deletePersonSwapMedia } from "@/lib/storage";
import { getOwnedSwap, listSwapItems } from "@/lib/person-swap-server";
import { isPersonSwapMode, isPersonSwapVoiceMode } from "@/lib/person-swap";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const swap = await getOwnedSwap(params.id, userId);
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ swap, items: await listSwapItems(swap.id) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const swap = await getOwnedSwap(params.id, userId);
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<typeof schema.personSwaps.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (isModelId(body.videoModel)) patch.videoModel = body.videoModel;
  if (isModelId(body.imageModel)) patch.imageModel = body.imageModel;
  if (typeof body.instructions === "string") patch.instructions = body.instructions.trim().slice(0, 1000) || null;
  if (isPersonSwapMode(body.mode)) {
    patch.mode = body.mode;
    if (body.mode === "person") patch.scenarioId = null;
  }
  if (body.scenarioId === null || typeof body.scenarioId === "string") {
    patch.scenarioId = (body.scenarioId as string | null) || null;
  }
  if (isPersonSwapVoiceMode(body.voiceMode)) patch.voiceMode = body.voiceMode;
  if (body.voiceId === null || typeof body.voiceId === "string") {
    patch.voiceId = ((body.voiceId as string | null) || "").slice(0, 64) || null;
  }

  await db
    .update(schema.personSwaps)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.personSwaps.id, swap.id));
  return NextResponse.json({ swap: await getOwnedSwap(swap.id, userId) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const swap = await getOwnedSwap(params.id, userId);
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.personSwapItems).where(eq(schema.personSwapItems.swapId, swap.id));
  await db.delete(schema.personSwaps).where(eq(schema.personSwaps.id, swap.id));
  await deletePersonSwapMedia(userId, swap.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
