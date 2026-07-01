import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, getLatestBlock, setBlockStatus } from "@/lib/block-helpers";
import { generateBlockVideo } from "@/lib/block-video";
import { repairInvalidKeyframeIfNeeded } from "@/lib/keyframe-repair";
import { resolveProjectApiModels } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (owned.block.status === "video_generating" || owned.block.status === "generating") {
    return NextResponse.json(
      { error: "Video generation already in progress for this block." },
      { status: 409 },
    );
  }

  await setBlockStatus(params.id, {
    status: "video_generating",
    errorMessage: null,
    videoJobId: null,
    videoPollingUrl: null,
    stockVideoId: null,
  });

  void (async () => {
    try {
      resolveProjectApiModels(owned.project);
      const latest = await getLatestBlock(params.id);
      let block = latest ?? owned.block;
      const { block: repairedBlock, repaired } = await repairInvalidKeyframeIfNeeded(
        owned.project,
        block,
      );
      if (repaired) {
        await setBlockStatus(params.id, {
          keyframeUrl: repairedBlock.keyframeUrl,
          status: repairedBlock.status,
          errorMessage: null,
        });
        block = repairedBlock;
      }
      const { videoUrl, durationSeconds, sceneAudioUrl, openRouterCostUsd } =
        await generateBlockVideo({
        project: owned.project,
        block,
      });
      const refreshed = await getLatestBlock(params.id);
      const audioReady = !!refreshed?.audioUrl;
      await setBlockStatus(params.id, {
        videoUrl,
        durationSeconds,
        sceneAudioUrl,
        openRouterCostUsd,
        status: audioReady ? "ready" : "video_ready",
      });
    } catch (err) {
      await setBlockStatus(params.id, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Video failed",
      });
    }
  })();

  return NextResponse.json({ ok: true, status: "video_generating" });
}
