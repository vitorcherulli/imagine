import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { readMediaBuffer } from "@/lib/storage";
import { CREATIVE_LANGUAGES, isCreativeFormat } from "@/lib/creatives";
import {
  CREATIVE_MIME_EXT,
  createCreativeFromBuffer,
  getOwnedCreative,
  mimeFromName,
  type CreativePlacement,
} from "@/lib/creatives-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCE_TYPES = ["variation", "export", "asset", "dubbing"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

type ResolvedMedia = { url: string; name: string; language?: string; mimeType?: string };

/** Looks the output up by id and checks it belongs to the user — media URLs themselves are public. */
async function resolveMedia(
  userId: string,
  type: SourceType,
  id: string,
  useVideo: boolean,
): Promise<ResolvedMedia | null> {
  if (type === "variation") {
    const [row] = await db
      .select({ item: schema.variationItems, setName: schema.variationSets.name })
      .from(schema.variationItems)
      .innerJoin(schema.variationSets, eq(schema.variationItems.setId, schema.variationSets.id))
      .where(and(eq(schema.variationItems.id, id), eq(schema.variationItems.userId, userId)));
    if (!row) return null;
    const video = useVideo && row.item.videoStatus === "ready" ? row.item.videoUrl : null;
    const url = video ?? row.item.imageUrl;
    return url ? { url, name: row.setName } : null;
  }
  if (type === "export") {
    const [row] = await db
      .select({ url: schema.exports.finalVideoUrl, status: schema.exports.status, title: schema.projects.title })
      .from(schema.exports)
      .innerJoin(schema.projects, eq(schema.exports.projectId, schema.projects.id))
      .where(and(eq(schema.exports.id, id), eq(schema.projects.userId, userId)));
    return row?.url && row.status === "done" ? { url: row.url, name: row.title } : null;
  }
  if (type === "asset") {
    const [row] = await db
      .select()
      .from(schema.mediaLibraryAssets)
      .where(and(eq(schema.mediaLibraryAssets.id, id), eq(schema.mediaLibraryAssets.userId, userId)));
    return row ? { url: row.url, name: row.name, mimeType: row.mimeType } : null;
  }
  const [row] = await db
    .select({ url: schema.dubbingRenders.url, lang: schema.dubbingRenders.targetLanguage, title: schema.projects.title })
    .from(schema.dubbingRenders)
    .innerJoin(schema.projects, eq(schema.dubbingRenders.projectId, schema.projects.id))
    .where(and(eq(schema.dubbingRenders.id, id), eq(schema.projects.userId, userId)));
  if (!row) return null;
  const lang = row.lang?.slice(0, 2).toUpperCase();
  return {
    url: row.url,
    name: row.title,
    language: lang && (CREATIVE_LANGUAGES as readonly string[]).includes(lang) ? lang : undefined,
  };
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const type = str("type") as SourceType;
  if (!SOURCE_TYPES.includes(type)) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const id = str("id");
  const useVideo = body.useVideo === true;

  const media = await resolveMedia(userId, type, id, useVideo);
  if (!media) return NextResponse.json({ error: "Output not found or not ready" }, { status: 404 });

  const sourceRef = `${id}${type === "variation" ? (useVideo ? ":video" : ":image") : ""}`;
  const [existing] = await db
    .select()
    .from(schema.creatives)
    .where(
      and(
        eq(schema.creatives.userId, userId),
        eq(schema.creatives.source, type),
        eq(schema.creatives.sourceRef, sourceRef),
      ),
    )
    .limit(1);
  if (existing && body.allowDuplicate !== true) {
    return NextResponse.json({ creative: existing, existing: true });
  }

  const pathname = new URL(media.url, "http://local").pathname;
  const mimeType =
    media.mimeType && CREATIVE_MIME_EXT[media.mimeType] ? media.mimeType : mimeFromName(pathname);
  if (!mimeType) {
    return NextResponse.json({ error: "Only PNG, JPG, WebP, MP4 and MOV can be creatives" }, { status: 400 });
  }

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

  const isVideo = mimeType.startsWith("video/");
  const format = str("format") || base?.format || (isVideo ? "VID" : "IMG");
  if (!isCreativeFormat(format)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  try {
    const creative = await createCreativeFromBuffer({
      userId,
      buffer: await readMediaBuffer(media.url),
      mimeType,
      originalName: path.posix.basename(pathname),
      placement,
      source: type,
      sourceRef,
      meta: {
        product: str("product") || base?.product || "",
        angle: str("angle") || base?.angle || media.name,
        hook: str("hook") || base?.hook || "",
        format,
        creator: str("creator") || base?.creator || "",
        language: str("language") || base?.language || media.language || "PT",
      },
    });
    return NextResponse.json({ creative });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not add" }, { status: 400 });
  }
}
