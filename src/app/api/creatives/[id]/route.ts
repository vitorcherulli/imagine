import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  CREATIVE_LANGUAGES,
  isCreativeFormat,
  isCreativeRatio,
  isCreativeStatus,
  toNameSlug,
  toProductCode,
} from "@/lib/creatives";
import { deleteCreative, getOwnedCreative } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creative = await getOwnedCreative(params.id, userId);
  if (!creative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
  const patch: Partial<typeof schema.creatives.$inferInsert> = {};

  const product = str("product");
  if (product !== undefined && toProductCode(product)) patch.product = toProductCode(product);
  const angle = str("angle");
  if (angle !== undefined && toNameSlug(angle)) patch.angle = toNameSlug(angle);
  const hook = str("hook");
  if (hook !== undefined) patch.hook = hook.slice(0, 300);
  const notes = str("notes");
  if (notes !== undefined) patch.notes = notes.slice(0, 2000);
  if (isCreativeFormat(body.format)) patch.format = body.format;
  const creator = str("creator");
  if (creator !== undefined) patch.creator = toNameSlug(creator, 16);
  if (isCreativeRatio(body.aspectRatio)) patch.aspectRatio = body.aspectRatio;
  if ((CREATIVE_LANGUAGES as readonly unknown[]).includes(body.language)) patch.language = body.language as string;
  if (body.status === null || isCreativeStatus(body.status)) patch.status = body.status as string | null;
  if (Number.isInteger(body.version) && (body.version as number) > 0) patch.version = body.version as number;

  if ((patch.format ?? creative.format) !== "UGC") patch.creator = "";
  patch.updatedAt = new Date();

  await db.update(schema.creatives).set(patch).where(eq(schema.creatives.id, creative.id));
  return NextResponse.json({ creative: await getOwnedCreative(creative.id, userId) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creative = await getOwnedCreative(params.id, userId);
  if (!creative) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteCreative(creative);
  return NextResponse.json({ ok: true });
}
