import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { getDefaultApiModels } from "@/lib/project-api-models";
import { saveDubExtractedAudio, saveDubSourceFile } from "@/lib/dubbing/storage";
import { normalizeDubLanguage } from "@/lib/dub-languages";
import {
  extractAudioBufferFromVideoBuffer,
  probeAudioBufferDurationSeconds,
} from "@/lib/ffmpeg";

export type DubSourceType = "video" | "audio";

export function detectDubSourceType(mime: string, filename: string): DubSourceType | null {
  const lower = filename.toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm")) {
    return "video";
  }
  if (lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".wav")) {
    return "audio";
  }
  return null;
}

/** Create a dubbing project (projects row + dubbing source) from an in-memory file. */
export async function createDubProject(input: {
  userId: string;
  title: string;
  buffer: Buffer;
  filename: string;
  mimeType?: string | null;
  sourceType: DubSourceType;
  targetLanguage: string;
  backgroundGain?: number;
  useVoiceClone?: boolean;
  /** Existing ElevenLabs voice to dub with instead of cloning the source. */
  clonedVoiceId?: string | null;
  ttsVoice?: string | null;
  ttsModel?: string | null;
  llmModel?: string | null;
  voiceTone?: string | null;
  folderId?: string | null;
  sourceLanguage?: string | null;
}): Promise<string> {
  const defaults = getDefaultApiModels();
  const id = createId();
  const now = new Date();
  const { buffer, filename, sourceType } = input;
  const backgroundGain = Number.isFinite(input.backgroundGain)
    ? Math.min(1, Math.max(0, input.backgroundGain ?? 0))
    : 0;

  const sourceUrl = await saveDubSourceFile({ projectId: id, buffer, filename });

  let extractedAudioUrl: string | null = null;
  let durationSeconds: number | null = null;
  if (sourceType === "video") {
    const extracted = await extractAudioBufferFromVideoBuffer({ buffer, filename });
    if (extracted) {
      extractedAudioUrl = await saveDubExtractedAudio({ projectId: id, buffer: extracted.buffer });
      durationSeconds = extracted.durationSeconds || null;
    }
  } else {
    extractedAudioUrl = sourceUrl;
    durationSeconds = (await probeAudioBufferDurationSeconds({ buffer, filename })) ?? null;
  }

  await db.insert(schema.projects).values({
    id,
    userId: input.userId,
    title: input.title,
    storyDescription: `Dubbing project: ${filename}`,
    genre: "dubbing",
    visualStyle: "n/a",
    voiceTone: input.voiceTone || "natural",
    contentType: "dubbing",
    scriptLanguage:
      input.sourceLanguage === "pt" || input.sourceLanguage === "es" ? input.sourceLanguage : "en",
    llmModel: input.llmModel || defaults.llmModel,
    imageModel: defaults.imageModel,
    videoModel: defaults.videoModel,
    ttsModel: input.ttsModel || defaults.ttsModel,
    ttsVoice: input.ttsVoice ?? defaults.ttsVoice ?? "auto",
    dubTargetLanguage: normalizeDubLanguage(input.targetLanguage),
    dubBackgroundGain: backgroundGain,
    dubUseVoiceClone: Boolean(input.useVoiceClone),
    dubClonedVoiceId: input.useVoiceClone ? input.clonedVoiceId ?? null : null,
    folderId: input.folderId ?? null,
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
    originalFilename: filename,
    mimeType: input.mimeType || null,
    sizeBytes: buffer.length,
    durationSeconds,
    detectedLanguage: null,
    transcriptEngine: null,
    transcribedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}
