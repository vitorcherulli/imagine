import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getSocialSlideForUser, setSocialSlideFields } from "@/lib/publication-server";
import { getOwnedMediaLibraryAsset } from "@/lib/media-library-server";
import { listDnaClientGalleryAssets } from "@/lib/dna-gallery-server";
import {
  deleteMediaByPublicUrl,
  readMediaBuffer,
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";
import { fitImageBufferToSocialAspect } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  assetId: z.string().min(1),
  mode: z.enum(["use", "reference"]).default("use"),
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

  const owned = await getSocialSlideForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const dnaId = owned.project.projectDnaId;
  const asset = await getOwnedMediaLibraryAsset(parsed.data.assetId, userId);
  if (!asset || asset.kind !== "image") {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  if (dnaId) {
    const dnaAssets = await listDnaClientGalleryAssets(userId, dnaId);
    const inDnaGallery = dnaAssets.some((a) => a.id === asset.id);
    if (!inDnaGallery && asset.projectId !== owned.project.id) {
      return NextResponse.json(
        { error: "Pick a photo from this brand's client gallery" },
        { status: 400 },
      );
    }
  }

  if (parsed.data.mode === "reference") {
    await setSocialSlideFields(params.id, {
      referenceAssetId: asset.id,
      status: owned.slide.imageUrl ? owned.slide.status : "draft",
      errorMessage: null,
    });
    return NextResponse.json({
      ok: true,
      referenceAssetId: asset.id,
      referenceUrl: asset.url,
    });
  }

  try {
    const rawBuffer = await readMediaBuffer(asset.url);
    const ext = extFromMime(asset.mimeType, asset.url);
    const framed = await fitImageBufferToSocialAspect(
      { buffer: rawBuffer, ext },
      owned.project.socialAspectRatio,
    );
    const outExt = ext === ".png" ? ".png" : ".jpg";

    if (owned.slide.imageUrl) {
      await deleteMediaByPublicUrl(owned.slide.imageUrl);
    }

    const savedUrl = await saveBuffer(
      owned.project.id,
      owned.slide.id,
      `slide${outExt}`,
      framed,
    );
    const imageUrl = withCacheBuster(savedUrl);

    await setSocialSlideFields(params.id, {
      imageUrl,
      referenceAssetId: asset.id,
      status: "ready",
      errorMessage: null,
    });

    return NextResponse.json({ ok: true, imageUrl, status: "ready" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not apply gallery image" },
      { status: 500 },
    );
  }
}
