import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { fitImageBufferToVideoFormat } from "@/lib/ffmpeg";
import { getOwnedMediaLibraryAsset } from "@/lib/media-library-server";
import {
  deleteMediaByPublicUrl,
  readMediaBuffer,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  assetId: z.string().min(1),
});

function extFromMime(mimeType: string, url: string): string {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  const fromUrl = url.match(/\.(\w+)(?:\?|#|$)/)?.[1]?.toLowerCase();
  if (fromUrl === "png" || fromUrl === "webp") return `.${fromUrl}`;
  return ".jpg";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const asset = await getOwnedMediaLibraryAsset(parsed.data.assetId, userId);
  if (!asset || asset.kind !== "image") {
    return NextResponse.json({ error: "Image not found in gallery" }, { status: 404 });
  }

  try {
    const rawBuffer = await readMediaBuffer(asset.url);
    const ext = extFromMime(asset.mimeType, asset.url);
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
      status: "image_ready",
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      keyframeUrl,
      status: "image_ready",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not apply gallery image" },
      { status: 500 },
    );
  }
}
