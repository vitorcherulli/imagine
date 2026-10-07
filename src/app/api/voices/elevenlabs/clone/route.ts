import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { cloneVoiceFromAudio } from "@/lib/elevenlabs/voice-clone";
import { clearAccountVoicesCache } from "@/lib/elevenlabs/voices";
import { extractAudioBufferFromVideoBuffer, trimAudioBufferToMaxSeconds } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** ElevenLabs instant clones don't improve past a few minutes of speech. */
const MAX_SAMPLE_SECONDS = 180;

/** Instant voice clone from an audio or video sample of someone speaking. */
export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Upload an audio or video of the person speaking" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Give the voice a name" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Sample is larger than 100MB" }, { status: 413 });
  }

  try {
    let audio: Buffer = Buffer.from(await file.arrayBuffer());
    let filename = file.name || "sample.mp3";
    if (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(filename)) {
      const extracted = await extractAudioBufferFromVideoBuffer({ buffer: audio, filename });
      if (!extracted) return NextResponse.json({ error: "This video has no sound" }, { status: 400 });
      audio = extracted.buffer;
      filename = extracted.filename;
    }
    audio = await trimAudioBufferToMaxSeconds({ buffer: audio, filename }, MAX_SAMPLE_SECONDS);
    const cloned = await cloneVoiceFromAudio({
      name,
      description: "Cloned in Imagine",
      audio,
      filename: filename.replace(/\.[^.]+$/, "") + ".mp3",
      mimeType: "audio/mpeg",
    });
    clearAccountVoicesCache();
    return NextResponse.json({ voiceId: cloned.voiceId, name: cloned.name });
  } catch (err) {
    console.error("[elevenlabs] clone failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not clone the voice" },
      { status: 400 },
    );
  }
}
