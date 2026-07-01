import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { isVideoMp4Buffer } from "@/lib/ffmpeg";
import { importVideoBufferToBlock } from "@/lib/stock-video-import-server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a video file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Video is larger than 200MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type || "unknown"}. Use MP4, MOV, or WebM.` },
      { status: 400 },
    );
  }

  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (!isVideoMp4Buffer(rawBuffer) && file.type !== "video/quicktime" && file.type !== "video/webm") {
      return NextResponse.json(
        { error: "Could not read this file as video. Try exporting as MP4 (H.264)." },
        { status: 400 },
      );
    }

    const imported = await importVideoBufferToBlock({
      project: owned.project,
      block: owned.block,
      rawBuf: rawBuffer,
      userId,
      registerGallery: {
        name: file.name.trim().slice(0, 80) || `Block video ${owned.block.position + 1}`,
        source: "upload",
      },
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
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
