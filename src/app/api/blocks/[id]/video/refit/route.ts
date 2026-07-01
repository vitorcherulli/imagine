import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { refitBlockVideoToDuration } from "@/lib/block-video";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  mode: z.enum(["loop", "slow"]).optional().default("loop"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!owned.block.videoUrl?.trim()) {
    return NextResponse.json({ error: "This block has no video." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const { videoUrl, sceneAudioUrl } = await refitBlockVideoToDuration({
      project: owned.project,
      block: owned.block,
      mode: parsed.data.mode,
    });

    await setBlockStatus(params.id, {
      videoUrl,
      ...(sceneAudioUrl !== undefined ? { sceneAudioUrl } : {}),
      errorMessage: null,
    });

    return NextResponse.json({ ok: true, videoUrl, sceneAudioUrl: sceneAudioUrl ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not extend video" },
      { status: 500 },
    );
  }
}
