import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { generateSpeech, resolveTtsVoice } from "@/lib/openrouter/tts";
import { saveBuffer, withCacheBuster } from "@/lib/storage";
import { concatAudioPiecesToMp3, hasFfmpeg, probeAudioBufferDurationSeconds } from "@/lib/ffmpeg";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeTtsSpeed } from "@/lib/narration-speed";
import { resolveElevenLabsVoiceSettings, resolveKokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";
import {
  buildMp3PiecesFromParagraphClips,
  paragraphNarrationReadiness,
} from "@/lib/script-mp3-build";
import {
  DEFAULT_SPEECH_GAP_SECONDS,
  normalizeScriptText,
  parseScriptDraftNotes,
  parseScriptNarrationSegments,
  resolveScriptNarrator,
} from "@/lib/script-studio";
import { deliverySpansInText } from "@/lib/script-tts-delivery";
import { applyPronunciationHints } from "@/lib/script-pronunciation";
import { saveScriptDraft } from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  speed: z.number().min(0.75).max(1.35).optional(),
  script: z.string().max(40_000).optional(),
  /** When true, re-TTS even if paragraph clips exist. Default: stitch approved takes. */
  forceRegenerate: z.boolean().optional(),
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

  let projectRow = project;
  let script = normalizeScriptText(parsed.data.script ?? project.scriptDraft ?? "");
  if (parsed.data.script !== undefined) {
    try {
      const synced = await saveScriptDraft(project, {
        script: parsed.data.script,
        status: "draft",
      });
      projectRow = {
        ...project,
        scriptDraft: synced.script || null,
        scriptDraftNotes: synced.notes
          ? JSON.stringify(synced.notes)
          : project.scriptDraftNotes,
        scriptDraftStatus: synced.status,
        scriptDraftVersion: synced.currentVersion,
      };
      script = synced.script;
    } catch (err) {
      console.error("[script/mp3] draft sync failed:", err);
    }
  }
  if (!script) {
    return NextResponse.json({ error: "No script draft to render." }, { status: 400 });
  }

  const paragraphs = parseScriptNarrationSegments(script).filter(
    (segment) => segment.kind === "speech",
  );
  if (paragraphs.length === 0) {
    return NextResponse.json({ error: "Script is empty." }, { status: 400 });
  }

  const notes = parseScriptDraftNotes(projectRow.scriptDraftNotes);
  const readiness = paragraphNarrationReadiness(script, notes);
  const forceRegenerate = parsed.data.forceRegenerate ?? false;
  const useParagraphClips = !forceRegenerate && readiness.allReady;

  const models = resolveProjectApiModels(projectRow);
  const narrator = resolveScriptNarrator(projectRow, notes);
  const ttsModel = narrator.ttsModel;
  const ttsVoice =
    narrator.ttsVoice && narrator.ttsVoice !== "auto"
      ? narrator.ttsVoice
      : resolveTtsVoice({
          ttsModel,
          ttsVoice: models.ttsVoice,
          voiceTone: narrator.voiceTone || project.voiceTone,
        });
  const speed = normalizeTtsSpeed(parsed.data.speed ?? project.ttsSpeed ?? 1);
  const elevenLabsSettings = resolveElevenLabsVoiceSettings(projectRow.ttsVoiceSettings);
  const kokoroExpressiveness = resolveKokoroVoiceSettings(projectRow.ttsVoiceSettings)
    .expressiveness;
  const deliveryNotes = narrator.deliveryNotes || "";
  const allDeliverySpans = notes.delivery?.spans ?? [];
  const segments = parseScriptNarrationSegments(script);
  const speechOnly = segments.every((segment) => segment.kind === "speech");
  const useSingleShot =
    !useParagraphClips && speechOnly && (paragraphs.length === 1 || script.length < 600);

  try {
    function speechOptsForText(speechText: string) {
      const hints = notes.pronunciation?.hints;
      const text = applyPronunciationHints(speechText, hints);
      const segmentSpans = deliverySpansInText(speechText, allDeliverySpans).map((span) => ({
        ...span,
        quote: applyPronunciationHints(span.quote, hints),
      }));
      return {
        text,
        voice: ttsVoice,
        model: ttsModel,
        voiceTone: narrator.voiceTone || project.voiceTone,
        speed,
        deliveryNotes,
        deliverySpans: segmentSpans.length > 0 ? segmentSpans : undefined,
        elevenLabsSettings,
        kokoroExpressiveness,
      };
    }

    let finalBuffer: Buffer;
    let filename: string;
    let deliverySpansUsed = 0;
    let source: "paragraph_clips" | "tts" = "tts";

    if (useParagraphClips) {
      source = "paragraph_clips";
      const pieces = await buildMp3PiecesFromParagraphClips(script, notes);

      if (pieces.length === 1 && pieces[0]?.kind === "clip") {
        finalBuffer = pieces[0].buffer;
        filename = pieces[0].filename.endsWith(".mp3")
          ? pieces[0].filename
          : `script-${Date.now()}.mp3`;
      } else {
        if (!hasFfmpeg()) {
          return NextResponse.json(
            {
              error:
                "ffmpeg is required to merge paragraph narration into one MP3. Install ffmpeg on the server.",
            },
            { status: 500 },
          );
        }
        finalBuffer = await concatAudioPiecesToMp3(pieces, { bitrateKbps: 192 });
        filename = `script-${Date.now()}.mp3`;
      }
    } else if (!forceRegenerate && readiness.ready > 0 && readiness.ready < readiness.total) {
      return NextResponse.json(
        {
          error: `Only ${readiness.ready}/${readiness.total} paragraphs are narrated. Generate the missing ones, or pass forceRegenerate to re-TTS everything.`,
          readiness,
        },
        { status: 400 },
      );
    } else if (useSingleShot) {
      const opts = speechOptsForText(script);
      deliverySpansUsed = opts.deliverySpans?.length ?? 0;
      const speech = await generateSpeech(opts);
      finalBuffer = speech.buffer;
      filename = `script-${Date.now()}${speech.filename.endsWith(".wav") ? ".wav" : ".mp3"}`;
    } else if (speechOnly) {
      const parts: Array<{ buffer: Buffer; filename: string }> = [];
      for (const segment of segments) {
        if (segment.kind !== "speech") continue;
        const opts = speechOptsForText(segment.text);
        deliverySpansUsed += opts.deliverySpans?.length ?? 0;
        const speech = await generateSpeech(opts);
        parts.push({ buffer: speech.buffer, filename: speech.filename });
      }
      if (!hasFfmpeg()) {
        return NextResponse.json(
          {
            error:
              "Script has multiple paragraphs and ffmpeg is required to merge them. Install ffmpeg or generate paragraph narration first.",
          },
          { status: 500 },
        );
      }
      finalBuffer = await concatAudioPiecesToMp3(
        parts.flatMap((part, index) => {
          const pieces: Array<
            { kind: "clip"; buffer: Buffer; filename: string } | { kind: "silence"; seconds: number }
          > = [];
          if (index > 0) pieces.push({ kind: "silence", seconds: DEFAULT_SPEECH_GAP_SECONDS });
          pieces.push({ kind: "clip", buffer: part.buffer, filename: part.filename });
          return pieces;
        }),
        { bitrateKbps: 192 },
      );
      filename = `script-${Date.now()}.mp3`;
    } else {
      if (!hasFfmpeg()) {
        return NextResponse.json(
          {
            error:
              "Script uses [pause] markers and ffmpeg is required to merge narration. Install ffmpeg.",
          },
          { status: 500 },
        );
      }

      const pieces: Array<
        { kind: "clip"; buffer: Buffer; filename: string } | { kind: "silence"; seconds: number }
      > = [];
      let speechIndex = 0;
      for (const segment of segments) {
        if (segment.kind === "section") continue;
        if (segment.kind === "pause") {
          pieces.push({ kind: "silence", seconds: segment.pauseSeconds });
          continue;
        }
        if (speechIndex > 0 && pieces[pieces.length - 1]?.kind !== "silence") {
          pieces.push({ kind: "silence", seconds: DEFAULT_SPEECH_GAP_SECONDS });
        }
        const opts = speechOptsForText(segment.text);
        deliverySpansUsed += opts.deliverySpans?.length ?? 0;
        const speech = await generateSpeech(opts);
        pieces.push({ kind: "clip", buffer: speech.buffer, filename: speech.filename });
        speechIndex += 1;
      }
      finalBuffer = await concatAudioPiecesToMp3(pieces, { bitrateKbps: 192 });
      filename = `script-${Date.now()}.mp3`;
    }

    const measuredDurationSeconds = await probeAudioBufferDurationSeconds({
      buffer: finalBuffer,
      filename,
    });

    const url = await saveBuffer(project.id, null, filename, finalBuffer);
    return NextResponse.json({
      ok: true,
      url: withCacheBuster(url),
      filename,
      bytes: finalBuffer.length,
      paragraphs: paragraphs.length,
      pauses: segments.filter((segment) => segment.kind === "pause").length,
      measuredDurationSeconds,
      ttsModel,
      ttsVoice,
      deliverySpansUsed,
      deliveryAnalysis: allDeliverySpans.length > 0,
      source,
      paragraphClipsUsed: source === "paragraph_clips" ? readiness.total : 0,
      readiness,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "MP3 rendering failed" },
      { status: 500 },
    );
  }
}
