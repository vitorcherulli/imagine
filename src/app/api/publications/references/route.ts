import { createId } from "@paralleldrive/cuid2";
import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { registerMediaLibraryAsset } from "@/lib/media-library-server";
import { saveGalleryBuffer, withCacheBuster } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

/** Uploads one inspiration image as-is (no crop) to the media library. */
export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 });
  }

  try {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const url = withCacheBuster(
      await saveGalleryBuffer(userId, `${createId()}.${ext}`, Buffer.from(await file.arrayBuffer())),
    );
    const asset = await registerMediaLibraryAsset({
      userId,
      url,
      name: file.name.replace(/\.[^.]+$/, "") || "Reference",
      mimeType: file.type,
      kind: "image",
      source: "upload",
    });
    if (!asset) throw new Error("Could not save the image.");
    return NextResponse.json({ reference: { assetId: asset.id, url: asset.url } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
