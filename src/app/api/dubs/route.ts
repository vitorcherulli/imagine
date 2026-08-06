import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getDefaultApiModels } from "@/lib/project-api-models";
import {
  saveDubExtractedAudio,
  saveDubSourceFile,
} from "@/lib/dubbing/storage";
import { normalizeDubLanguage } from "@/lib/dub-languages";
import {
  extractAudioBufferFromVideoBuffer,
  probeAudioBufferDurationSeconds,
} from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Max upload size: 500MB. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
]);

function detectSourceType(mime: string, filename: string): "video" | "audio" | null {
  const lower = filename.toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm")) {
    return "video";
  }
  if (
    lower.endsWith(".mp3") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".wav")
  ) {
    return "audio";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data upload" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const defaults = getDefaultApiModels();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const targetLanguage = normalizeDubLanguage(
    String(form.get("targetLanguage") ?? "en"),
  );
  const backgroundGainRaw = Number(form.get("backgroundGain") ?? 0);
  const backgroundGain = Number.isFinite(backgroundGainRaw)
    ? Math.min(1, Math.max(0, backgroundGainRaw))
    : 0;
  const useVoiceClone = String(form.get("useVoiceClone") ?? "") === "true";
  const ttsVoice = String(form.get("ttsVoice") ?? "").trim() || null;
  const ttsModel = String(form.get("ttsModel") ?? "").trim() || defaults.ttsModel;
  const llmModel = String(form.get("llmModel") ?? "").trim() || defaults.llmModel;
  const voiceTone = String(form.get("voiceTone") ?? "").trim();
  const folderId = String(form.get("folderId") ?? "").trim() || null;
  const scriptLanguageHint =
    String(form.get("sourceLanguage") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
      },
      { status: 413 },
    );
  }

  const sourceType = detectSourceType(file.type || "", file.name);
  if (!sourceType) {
    return NextResponse.json(
      { error: "Unsupported file type. Use MP4/MOV/WebM (video) or MP3/M4A/WAV (audio)." },
      { status: 400 },
    );
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    // Non-strict: some browsers set weird MIME; we already sniffed extension.
  }

  const id = createId();
  const now = new Date();
  const buffer = Buffer.from(await file.arrayBuffer());

  const sourceUrl = await saveDubSourceFile({
    projectId: id,
    buffer,
    filename: file.name,
  });

  let extractedAudioUrl: string | null = null;
  let durationSeconds: number | null = null;

  if (sourceType === "video") {
    const extracted = await extractAudioBufferFromVideoBuffer({
      buffer,
      filename: file.name,
    });
    if (extracted) {
      extractedAudioUrl = await saveDubExtractedAudio({
        projectId: id,
        buffer: extracted.buffer,
      });
      durationSeconds = extracted.durationSeconds || null;
    }
  } else {
    extractedAudioUrl = sourceUrl;
    durationSeconds =
      (await probeAudioBufferDurationSeconds({
        buffer,
        filename: file.name,
      })) ?? null;
  }

  await db.insert(schema.projects).values({
    id,
    userId,
    title,
    storyDescription: `Dubbing project: ${file.name}`,
    genre: "dubbing",
    visualStyle: "n/a",
    voiceTone: voiceTone || "natural",
    contentType: "dubbing",
    scriptLanguage:
      scriptLanguageHint === "pt" || scriptLanguageHint === "es"
        ? scriptLanguageHint
        : "en",
    llmModel,
    imageModel: defaults.imageModel,
    videoModel: defaults.videoModel,
    ttsModel,
    ttsVoice: ttsVoice ?? defaults.ttsVoice ?? "auto",
    dubTargetLanguage: targetLanguage,
    dubBackgroundGain: backgroundGain,
    dubUseVoiceClone: useVoiceClone,
    dubClonedVoiceId: null,
    folderId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.dubbingSources).values({
    id: createId(),
    projectId: id,
    sourceType,
    sourceUrl,
    extractedAudioUrl,
    originalFilename: file.name,
    mimeType: file.type || null,
    sizeBytes: file.size,
    durationSeconds,
    detectedLanguage: null,
    transcriptEngine: null,
    transcribedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id });
}

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dubs = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.contentType, "dubbing"),
      ),
    )
    .orderBy(desc(schema.projects.updatedAt));
  return NextResponse.json({ dubs });
}
