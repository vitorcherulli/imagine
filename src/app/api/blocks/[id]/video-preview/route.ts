import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser } from "@/lib/block-helpers";
import { mediaFileExists } from "@/lib/storage";
import { ensureBlockPreviewVideo } from "@/lib/video-preview-server";
import { previewVideoStorageKey } from "@/lib/video-preview";
import {
  normalizeProjectPreviewMode,
  serverDefaultPreviewMode,
} from "@/lib/preview-settings";

function previewMediaUrl(projectId: string, blockId: string): string {
  const key = previewVideoStorageKey(projectId, blockId);
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Ensure a low-res `video_preview.mp4` exists for in-app playback. Export still uses full `video.mp4`. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!owned.block.videoUrl?.trim()) {
    return NextResponse.json({ previewUrl: null });
  }

  const projectMode = normalizeProjectPreviewMode(owned.project.previewMode);
  const effectiveMode =
    projectMode === "auto" ? serverDefaultPreviewMode() : projectMode;
  const fullUrl = owned.block.videoUrl.split("?")[0] ?? owned.block.videoUrl;

  if (effectiveMode === "off" || effectiveMode === "keyframe") {
    return NextResponse.json({ previewUrl: null, cached: true });
  }

  if (effectiveMode === "full") {
    return NextResponse.json({ previewUrl: fullUrl, cached: true });
  }

  try {
    const stableUrl = previewMediaUrl(owned.project.id, owned.block.id);
    const alreadyExists = await mediaFileExists(stableUrl);
    const previewUrl = await ensureBlockPreviewVideo(owned.project.id, owned.block);
    return NextResponse.json({
      previewUrl,
      cached: alreadyExists,
    });
  } catch (err) {
    const fallback = owned.block.videoUrl?.split("?")[0] ?? owned.block.videoUrl ?? null;
    return NextResponse.json({
      previewUrl: fallback,
      error: err instanceof Error ? err.message : "Could not prepare preview video",
    });
  }
}
