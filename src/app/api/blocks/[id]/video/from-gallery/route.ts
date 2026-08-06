import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { getOwnedMediaLibraryAsset } from "@/lib/media-library-server";
import { readMediaBuffer } from "@/lib/storage";
import { importVideoBufferToBlock } from "@/lib/stock-video-import-server";
import { MEDIA_AI_SOURCE } from "@/lib/media-ai-label";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  assetId: z.string().min(1),
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

  const asset = await getOwnedMediaLibraryAsset(parsed.data.assetId, userId);
  if (!asset || asset.kind !== "video") {
    return NextResponse.json({ error: "Video not found in gallery" }, { status: 404 });
  }

  try {
    const rawBuffer = await readMediaBuffer(asset.url);
    const imported = await importVideoBufferToBlock({
      project: owned.project,
      block: owned.block,
      rawBuf: rawBuffer,
      userId,
      stockVideoId: null,
    });

    await setBlockStatus(params.id, {
      videoUrl: imported.videoUrl,
      keyframeUrl: imported.keyframeUrl,
      sceneAudioUrl: imported.sceneAudioUrl,
      durationSeconds: imported.durationSeconds,
      status: imported.status,
      errorMessage: null,
      videoJobId: null,
      videoPollingUrl: null,
      stockVideoId: null,
      videoAiModel: MEDIA_AI_SOURCE.gallery,
      keyframeAiModel: imported.keyframeUrl ? MEDIA_AI_SOURCE.extracted : null,
      sceneAudioAiModel: imported.sceneAudioUrl ? MEDIA_AI_SOURCE.extracted : null,
    });

    return NextResponse.json({
      ok: true,
      videoUrl: imported.videoUrl,
      keyframeUrl: imported.keyframeUrl,
      sceneAudioUrl: imported.sceneAudioUrl,
      durationSeconds: imported.durationSeconds,
      status: imported.status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not apply gallery video" },
      { status: 500 },
    );
  }
}
