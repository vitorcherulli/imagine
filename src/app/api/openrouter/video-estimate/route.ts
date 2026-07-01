import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { estimateVideoClipCostForModel } from "@/lib/openrouter/video-pricing";
import { normalizeVideoClipAudio } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const model = req.nextUrl.searchParams.get("model");
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  const durationRaw = req.nextUrl.searchParams.get("duration");
  const durationSeconds = durationRaw ? Number(durationRaw) : 8;
  const videoClipAudio = normalizeVideoClipAudio(req.nextUrl.searchParams.get("audio"));
  const resolution = req.nextUrl.searchParams.get("resolution") ?? "720p";
  const hasFirstFrame = req.nextUrl.searchParams.get("firstFrame") === "1";

  try {
    const estimate = await estimateVideoClipCostForModel({
      model,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 8,
      videoClipAudio,
      resolution,
      hasFirstFrame,
    });
    return NextResponse.json(estimate);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to estimate video cost";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
