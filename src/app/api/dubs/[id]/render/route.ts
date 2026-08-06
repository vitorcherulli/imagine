import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  getDubProjectForUser,
  getDubSource,
  listDubSegments,
} from "@/lib/dubbing/helpers";
import {
  ensureDubTracksMigrated,
  getDubTrack,
  listDubTracks,
  listLocalesForTrack,
} from "@/lib/dubbing/tracks";
import { saveDubRender } from "@/lib/dubbing/storage";
import { readMediaBuffer } from "@/lib/storage";
import {
  muxDubbedAudioOntoVideo,
  renderDubbedAudioTrack,
} from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const bodySchema = z.object({
  kind: z.enum(["video", "audio"]).optional(),
  trackId: z.string().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.text();
  const body = raw ? JSON.parse(raw) : {};
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const source = await getDubSource(id);
  if (!source) return NextResponse.json({ error: "No source" }, { status: 400 });

  const kind =
    parsed.data.kind ?? (source.sourceType === "video" ? "video" : "audio");

  const segments = await listDubSegments(id);
  await ensureDubTracksMigrated(project, segments);
  const tracks = await listDubTracks(id);
  const trackId =
    parsed.data.trackId ??
    tracks.find((t) => t.languageId === project.dubTargetLanguage)?.id ??
    tracks[0]?.id;
  if (!trackId) {
    return NextResponse.json({ error: "No dub track" }, { status: 400 });
  }
  const track = await getDubTrack(trackId, id);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const locales = await listLocalesForTrack(trackId);
  const withAudio = locales.filter((l) => l.ttsAudioUrl);
  if (withAudio.length === 0) {
    return NextResponse.json(
      { error: "No synthesized segments yet — run processing first" },
      { status: 400 },
    );
  }

  const segmentById = new Map(segments.map((s) => [s.id, s]));

  const totalDuration =
    source.durationSeconds ??
    Math.max(...segments.map((s) => s.endSeconds), 0) + 1;

  const segmentBuffers = await Promise.all(
    withAudio.map(async (loc) => {
      const seg = segmentById.get(loc.segmentId);
      if (!seg) throw new Error(`Missing segment ${loc.segmentId}`);
      return {
        startSeconds: seg.startSeconds,
        durationSeconds:
          loc.ttsDurationSeconds ??
          Math.max(0.3, seg.endSeconds - seg.startSeconds),
        buffer: await readMediaBuffer(loc.ttsAudioUrl as string),
        filename: `seg_${loc.segmentId}.mp3`,
      };
    }),
  );

  const backgroundGain = Math.min(1, Math.max(0, project.dubBackgroundGain ?? 0));
  let originalAudio: {
    buffer: Buffer;
    filename: string;
    gain: number;
  } | null = null;
  if (backgroundGain > 0.001 && source.extractedAudioUrl) {
    const bgBuffer = await readMediaBuffer(source.extractedAudioUrl);
    originalAudio = {
      buffer: bgBuffer,
      filename: "background.mp3",
      gain: backgroundGain,
    };
  }

  const rendered = await renderDubbedAudioTrack({
    totalDurationSeconds: totalDuration,
    segments: segmentBuffers,
    originalAudio,
    outputFormat: kind === "audio" ? "mp3" : "m4a",
  });

  let outputBuffer = rendered.buffer;
  let outputFilename = rendered.filename;

  if (kind === "video") {
    if (source.sourceType !== "video") {
      return NextResponse.json(
        { error: "Cannot render video — source is audio only" },
        { status: 400 },
      );
    }
    const videoBuffer = await readMediaBuffer(source.sourceUrl);
    const muxed = await muxDubbedAudioOntoVideo({
      video: {
        buffer: videoBuffer,
        filename: source.originalFilename ?? "source.mp4",
      },
      audio: {
        buffer: rendered.buffer,
        filename: rendered.filename,
      },
    });
    outputBuffer = muxed.buffer;
    outputFilename = muxed.filename;
  }

  const url = await saveDubRender({
    projectId: id,
    buffer: outputBuffer,
    filename: outputFilename,
  });

  const now = new Date();
  const renderId = createId();
  await db.insert(schema.dubbingRenders).values({
    id: renderId,
    projectId: id,
    kind,
    url,
    targetLanguage: track.languageId,
    trackId,
    backgroundGain,
    durationSeconds: rendered.durationSeconds,
    sizeBytes: outputBuffer.length,
    createdAt: now,
  });

  return NextResponse.json({
    id: renderId,
    url,
    kind,
    durationSeconds: rendered.durationSeconds,
    sizeBytes: outputBuffer.length,
  });
}
