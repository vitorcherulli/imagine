import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { readMediaBuffer } from "@/lib/storage";
import { isCreativeFormat } from "@/lib/creatives";
import {
  createCreativeFromBuffer,
  getOwnedCreative,
  mimeFromName,
  type CreativePlacement,
} from "@/lib/creatives-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: schema.variationItems.id,
      imageUrl: schema.variationItems.imageUrl,
      videoUrl: schema.variationItems.videoUrl,
      videoStatus: schema.variationItems.videoStatus,
      direction: schema.variationItems.direction,
      setName: schema.variationSets.name,
      createdAt: schema.variationItems.createdAt,
    })
    .from(schema.variationItems)
    .innerJoin(schema.variationSets, eq(schema.variationItems.setId, schema.variationSets.id))
    .where(and(eq(schema.variationItems.userId, userId), eq(schema.variationItems.status, "ready")))
    .orderBy(desc(schema.variationItems.createdAt))
    .limit(120);

  return NextResponse.json({
    items: rows
      .filter((r) => r.imageUrl)
      .map((r) => ({ ...r, videoUrl: r.videoStatus === "ready" ? r.videoUrl : null })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const [item] = await db
    .select()
    .from(schema.variationItems)
    .where(and(eq(schema.variationItems.id, str("itemId")), eq(schema.variationItems.userId, userId)));
  if (!item) return NextResponse.json({ error: "Variation not found" }, { status: 404 });

  const useVideo = body.useVideo === true && item.videoStatus === "ready" && !!item.videoUrl;
  const url = useVideo ? item.videoUrl! : item.imageUrl;
  if (!url) return NextResponse.json({ error: "This variation has no image yet" }, { status: 400 });
  const mimeType = mimeFromName(new URL(url, "http://local").pathname);
  if (!mimeType) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });

  const mode = str("mode") || "new";
  let placement: CreativePlacement = { mode: "new" };
  let base: Awaited<ReturnType<typeof getOwnedCreative>> = null;
  if (mode === "version" || mode === "size") {
    base = await getOwnedCreative(str("fromId"), userId);
    if (!base) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    placement =
      mode === "version"
        ? { mode: "version", code: base.code }
        : { mode: "size", code: base.code, version: base.version };
  }

  const format = str("format") || base?.format || (useVideo ? "VID" : "IMG");
  if (!isCreativeFormat(format)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  try {
    const creative = await createCreativeFromBuffer({
      userId,
      buffer: await readMediaBuffer(url),
      mimeType,
      originalName: path.posix.basename(new URL(url, "http://local").pathname),
      placement,
      source: "variation",
      sourceRef: item.id,
      meta: {
        product: str("product") || base?.product || "",
        angle: str("angle") || base?.angle || "",
        hook: str("hook") || base?.hook || "",
        format,
        creator: str("creator") || base?.creator || "",
        language: str("language") || base?.language || "PT",
      },
    });
    return NextResponse.json({ creative });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
