import { createId } from "@paralleldrive/cuid2";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { fitImageBufferToVideoFormat } from "@/lib/ffmpeg";
import {
  getOwnedMediaFolder,
  registerMediaLibraryAsset,
} from "@/lib/media-library-server";
import { saveGalleryBuffer, withCacheBuster } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("image");
  const folderIdRaw = form.get("folderId");
  const folderId =
    typeof folderIdRaw === "string" && folderIdRaw.trim() && folderIdRaw !== "root"
      ? folderIdRaw.trim()
      : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 20MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 });
  }

  if (folderId) {
    const folder = await getOwnedMediaFolder(folderId, userId);
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const raw = Buffer.from(await file.arrayBuffer());
    const framed = await fitImageBufferToVideoFormat(
      { buffer: raw, ext: `.${ext}` },
      "horizontal",
    );
    const filename = `${createId()}.${ext === "png" ? "png" : "jpg"}`;
    const savedUrl = withCacheBuster(await saveGalleryBuffer(userId, filename, framed));

    const asset = await registerMediaLibraryAsset({
      userId,
      url: savedUrl,
      name: file.name.replace(/\.[^.]+$/, "") || "Upload",
      mimeType: file.type,
      kind: "image",
      source: "upload",
      folderId,
    });

    return NextResponse.json({ ok: true, asset, url: savedUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
