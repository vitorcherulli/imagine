import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { generateSpeech, resolveTtsVoice } from "@/lib/openrouter/tts";
import { saveBuffer, withCacheBuster } from "@/lib/storage";
import { hasFfmpeg, probeAudioBufferDurationSeconds, trimAudioBufferToMaxSeconds } from "@/lib/ffmpeg";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveElevenLabsVoiceSettings, resolveKokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";
import { normalizeTtsSpeed } from "@/lib/narration-speed";
import {
  buildNarratorPreviewText,
  narratorSuggestionSchema,
  NARRATOR_PREVIEW_TARGET_SECONDS,
  parseScriptDraftNotes,
  resolveScriptNarrator,
} from "@/lib/script-studio";
import { deliverySpansInText } from "@/lib/script-tts-delivery";
import { applyPronunciationHints } from "@/lib/script-pronunciation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  script: z.string().max(40_000).optional(),
  speed: z.number().min(0.75).max(1.35).optional(),
  narrator: narratorSuggestionSchema
    .pick({ voiceTone: true, ttsModel: true, ttsVoice: true })
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const notes = parseScriptDraftNotes(project.scriptDraftNotes);
  const models = resolveProjectApiModels(project);
  const baseNarrator = resolveScriptNarrator(project, notes);
  const narrator = parsed.data.narrator
    ? { ...baseNarrator, ...parsed.data.narrator }
    : baseNarrator;

  const previewText = buildNarratorPreviewText(
    parsed.data.script ?? project.scriptDraft ?? "",
  );
  const ttsModel = narrator.ttsModel || models.ttsModel;
  const ttsVoice =
    narrator.ttsVoice && narrator.ttsVoice !== "auto"
      ? narrator.ttsVoice
      : resolveTtsVoice({
          ttsModel,
          ttsVoice: models.ttsVoice,
          voiceTone: narrator.voiceTone || project.voiceTone,
        });
  const speed = normalizeTtsSpeed(parsed.data.speed ?? project.ttsSpeed ?? 1);
  const deliveryNotes = narrator.deliveryNotes || "";
  const hints = notes.pronunciation?.hints;
  const ttsPreviewText = applyPronunciationHints(previewText, hints);
  const previewSpans = deliverySpansInText(
    previewText,
    notes.delivery?.spans ?? [],
  ).map((span) => ({
    ...span,
    quote: applyPronunciationHints(span.quote, hints),
  }));

  try {
    const speech = await generateSpeech({
      text: ttsPreviewText,
      voice: ttsVoice,
      model: ttsModel,
      voiceTone: narrator.voiceTone || project.voiceTone,
      speed,
      deliveryNotes,
      deliverySpans: previewSpans.length > 0 ? previewSpans : undefined,
      elevenLabsSettings: resolveElevenLabsVoiceSettings(project.ttsVoiceSettings),
      kokoroExpressiveness: resolveKokoroVoiceSettings(project.ttsVoiceSettings).expressiveness,
    });

    let buffer = speech.buffer;
    let filename = speech.filename;
    const measuredDurationSeconds = await probeAudioBufferDurationSeconds({
      buffer: speech.buffer,
      filename: speech.filename,
    });

    if (hasFfmpeg()) {
      buffer = await trimAudioBufferToMaxSeconds(
        { buffer, filename },
        NARRATOR_PREVIEW_TARGET_SECONDS,
      );
      filename = `narrator-preview-${Date.now()}.mp3`;
    }

    const url = await saveBuffer(project.id, null, filename, buffer);
    return NextResponse.json({
      ok: true,
      url: withCacheBuster(url),
      filename,
      bytes: buffer.length,
      previewText,
      durationSeconds: NARRATOR_PREVIEW_TARGET_SECONDS,
      measuredDurationSeconds,
      ttsModel: speech.modelUsed,
      ttsVoice,
      usedFallback: speech.usedFallback ?? false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Narrator preview failed" },
      { status: 500 },
    );
  }
}
