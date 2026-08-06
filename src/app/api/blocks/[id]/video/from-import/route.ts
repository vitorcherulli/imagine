import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { importStockVideoToBlock } from "@/lib/stock-video-import-server";
import { MEDIA_AI_SOURCE } from "@/lib/media-ai-label";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  downloadUrl: z.string().url(),
  previewUrl: z.string().url(),
  provider: z.literal("pexels"),
  stockVideoId: z.string().min(1).max(80).optional(),
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

  const { downloadUrl, previewUrl, provider, name, stockVideoId } = parsed.data;

  try {
    const imported = await importStockVideoToBlock({
      project: owned.project,
      block: owned.block,
      result: {
        downloadUrl,
        previewUrl,
        provider,
        sourceTitle: name,
        attribution: name,
        id: stockVideoId ?? "",
      },
      userId,
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
      stockVideoId: imported.stockVideoId,
      videoAiModel: MEDIA_AI_SOURCE.stock,
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
      stockVideoId: imported.stockVideoId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not import video" },
      { status: 500 },
    );
  }
}
