import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { deleteMediaByPublicUrl, saveBuffer, withCacheBuster } from "@/lib/storage";
import { fitImageBufferToVideoFormat, isVideoMp4Buffer } from "@/lib/ffmpeg";
import { registerMediaLibraryAssetSafe } from "@/lib/media-library-server";
import { MEDIA_AI_SOURCE } from "@/lib/media-ai-label";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

function extForMime(mime: string, filename: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName === "png" || fromName === "webp" || fromName === "jpg" || fromName === "jpeg") {
    return fromName === "jpeg" ? ".jpg" : `.${fromName}`;
  }
  return ".jpg";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 20MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type || "unknown"}. Use JPG, PNG, or WebP.` },
      { status: 400 },
    );
  }

  try {
    const ext = extForMime(file.type, file.name);
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (isVideoMp4Buffer(rawBuffer)) {
      return NextResponse.json(
        { error: "Videos cannot be used as keyframes. Upload a JPG or PNG image." },
        { status: 400 },
      );
    }
    const framed = await fitImageBufferToVideoFormat(
      { buffer: rawBuffer, ext },
      owned.project.videoFormat,
      owned.block.keyframeFitMode,
    );
    const outExt = ext === ".png" ? ".png" : ".jpg";

    if (owned.block.keyframeUrl) {
      await deleteMediaByPublicUrl(owned.block.keyframeUrl);
    }

    const savedUrl = await saveBuffer(
      owned.project.id,
      owned.block.id,
      `keyframe${outExt}`,
      framed,
    );
    const keyframeUrl = withCacheBuster(savedUrl);

    await setBlockStatus(params.id, {
      keyframeUrl,
      keyframeAiModel: MEDIA_AI_SOURCE.upload,
      status: "image_ready",
      errorMessage: null,
    });

    registerMediaLibraryAssetSafe({
      userId,
      url: keyframeUrl,
      name: `Block keyframe ${owned.block.position + 1}`,
      mimeType: outExt === ".png" ? "image/png" : "image/jpeg",
      kind: "image",
      source: "upload",
      projectId: owned.project.id,
      blockId: owned.block.id,
    });

    return NextResponse.json({
      ok: true,
      keyframeUrl,
      status: "image_ready",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
