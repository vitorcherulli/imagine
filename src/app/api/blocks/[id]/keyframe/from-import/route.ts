import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { fitImageBufferToVideoFormat, detectImageExt } from "@/lib/ffmpeg";
import {
  registerMediaLibraryAssetSafe,
  type MediaLibrarySource,
} from "@/lib/media-library-server";
import { downloadReferenceImageBuffer } from "@/lib/reference-image-download";
import { deleteMediaByPublicUrl, saveBuffer, withCacheBuster } from "@/lib/storage";
import { MEDIA_AI_SOURCE } from "@/lib/media-ai-label";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  fullUrl: z.string().url(),
  previewUrl: z.string().url(),
  sourceUrl: z.string().url().optional(),
  provider: z.enum(["google", "serper", "pexels", "wikimedia"]),
  name: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { fullUrl, previewUrl, sourceUrl, provider, name } = parsed.data;

  try {
    const ext =
      fullUrl.includes(".png") || previewUrl.includes(".png") ? "png" : "jpg";
    const buf = await downloadReferenceImageBuffer(
      { fullUrl, previewUrl, provider, sourceUrl },
      { delayBeforeMs: 0 },
    );
    const detectedExt = detectImageExt(buf);
    const framed = await fitImageBufferToVideoFormat(
      { buffer: buf, ext: detectedExt ?? (ext === "png" ? ".png" : ".jpg") },
      owned.project.videoFormat,
      owned.block.keyframeFitMode,
    );
    const outExt = detectedExt === ".png" ? ".png" : ".jpg";

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
      keyframeAiModel: MEDIA_AI_SOURCE.import,
      status: "image_ready",
      errorMessage: null,
    });

    const source: MediaLibrarySource =
      provider === "serper" ? "google" : provider;
    registerMediaLibraryAssetSafe({
      userId,
      url: keyframeUrl,
      name: name?.trim() || "Imported reference",
      mimeType: outExt === ".png" ? "image/png" : "image/jpeg",
      kind: "image",
      source,
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
      { error: err instanceof Error ? err.message : "Could not import image" },
      { status: 500 },
    );
  }
}
