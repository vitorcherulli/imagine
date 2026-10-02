import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { isCreativeFormat } from "@/lib/creatives";
import {
  CREATIVE_MIME_EXT,
  MAX_CREATIVE_BYTES,
  createCreativeFromBuffer,
  getOwnedCreative,
  loadCreativeLibrary,
  mimeFromName,
  type CreativePlacement,
} from "@/lib/creatives-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadCreativeLibrary(userId));
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  }
  if (file.size > MAX_CREATIVE_BYTES) {
    return NextResponse.json({ error: "File is larger than 400MB" }, { status: 400 });
  }
  const mimeType = CREATIVE_MIME_EXT[file.type] ? file.type : mimeFromName(file.name);
  if (!mimeType) return NextResponse.json({ error: "Use PNG, JPG, WebP, MP4 or MOV" }, { status: 400 });

  const mode = String(form.get("mode") ?? "new");
  const fromId = String(form.get("fromId") ?? "");
  let placement: CreativePlacement = { mode: "new" };
  let base: Awaited<ReturnType<typeof getOwnedCreative>> = null;
  if (mode === "explicit") {
    const code = Number(form.get("code"));
    const version = Number(form.get("version")) || 1;
    if (!Number.isInteger(code) || code < 1 || !Number.isInteger(version) || version < 1) {
      return NextResponse.json({ error: "Invalid code or version" }, { status: 400 });
    }
    placement = { mode: "size", code, version };
  } else if (mode === "version" || mode === "size") {
    base = await getOwnedCreative(fromId, userId);
    if (!base) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    placement =
      mode === "version"
        ? { mode: "version", code: base.code }
        : { mode: "size", code: base.code, version: base.version };
  }

  const field = (k: string) => String(form.get(k) ?? "").trim();
  const formatRaw = field("format") || base?.format || (mimeType.startsWith("video/") ? "VID" : "IMG");
  if (!isCreativeFormat(formatRaw)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  try {
    const creative = await createCreativeFromBuffer({
      userId,
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType,
      originalName: file.name,
      placement,
      source: mode === "explicit" ? "import" : field("source") === "social-art" ? "social-art" : "upload",
      sourceRef: field("sourceRef").slice(0, 200) || null,
      meta: {
        product: field("product") || base?.product || "",
        angle: field("angle") || base?.angle || "",
        hook: field("hook") || base?.hook || "",
        format: formatRaw,
        creator: field("creator") || base?.creator || "",
        language: field("language") || base?.language || "PT",
      },
    });
    return NextResponse.json({ creative });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
