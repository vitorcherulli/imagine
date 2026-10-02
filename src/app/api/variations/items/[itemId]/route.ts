import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  deleteVariationItemMedia,
  getOwnedVariationItem,
  getOwnedVariationSet,
  retryVariation,
} from "@/lib/variations-server";
import { ORIGINAL_DIRECTION } from "@/lib/variations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Retry a failed variation. */
export async function POST(_req: NextRequest, { params }: { params: { itemId: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await getOwnedVariationItem(params.itemId, userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.direction === ORIGINAL_DIRECTION) {
    return NextResponse.json({ error: "The original can't be regenerated" }, { status: 400 });
  }
  const set = await getOwnedVariationSet(item.setId, userId);
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await retryVariation(set, item);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { itemId: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = await getOwnedVariationItem(params.itemId, userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.direction === ORIGINAL_DIRECTION) {
    return NextResponse.json({ error: "The original can't be deleted" }, { status: 400 });
  }
  await db.delete(schema.variationItems).where(eq(schema.variationItems.id, item.id));
  await deleteVariationItemMedia(item).catch(() => {});
  return NextResponse.json({ ok: true });
}
