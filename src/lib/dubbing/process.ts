/**
 * Server-side orquestrador do pipeline completo de dublagem:
 *   1) Transcreve o áudio da source
 *   2) (Opcional) Clona a voz do falante original via ElevenLabs IVC
 *   3) Traduz todos os segmentos para o idioma alvo via LLM
 *   4) Sintetiza cada segmento com TTS + time-stretch
 */
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Project } from "@/lib/db/schema";
import { readMediaBuffer } from "@/lib/storage";
import {
  getDubSource,
  listDubSegments,
  updateDubSource,
  updateDubProject,
} from "./helpers";

async function setDubPipelineProgress(
  projectId: string,
  progress: {
    stage: string;
    message: string;
    current?: number | null;
    total?: number | null;
  },
): Promise<void> {
  await updateDubProject(projectId, {
    dubPipelineStage: progress.stage,
    dubPipelineMessage: progress.message,
    dubPipelineCurrent: progress.current ?? null,
    dubPipelineTotal: progress.total ?? null,
  });
}

export async function clearDubPipelineProgress(projectId: string): Promise<void> {
  await updateDubProject(projectId, {
    dubPipelineStage: null,
    dubPipelineMessage: null,
    dubPipelineCurrent: null,
    dubPipelineTotal: null,
  });
}
import { transcribeForDubbing } from "./transcribe";
import {
  shortenTranslatedLine,
  translateDubbingSegments,
} from "./translate";
import { synthesizeDubSegment, dubSegmentNeedsShorten } from "./synthesize";
import { saveDubSegmentAudio } from "./storage";
import { cloneVoiceFromAudio } from "@/lib/elevenlabs/voice-clone";
import { normalizeDubLanguage, dubLanguageInfo } from "@/lib/dub-languages";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  ensureDubTracksMigrated,
  getDubTrack,
  listDubTracks,
  listLocalesForTrack,
  syncPrimaryTrackToSegments,
  updateDubSegmentLocale,
} from "./tracks";

export interface ProcessOptions {
  stages?: Array<"transcribe" | "translate" | "synthesize" | "clone">;
  /** Force re-run even if the stage already completed. */
  force?: boolean;
  /** Dub timeline row to process (defaults to project target language track). */
  trackId?: string;
}

export interface ProcessProgress {
  stage: string;
  message: string;
  current?: number;
  total?: number;
}

export async function processDubbingProject(
  project: Project,
  opts: ProcessOptions = {},
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ ok: true }> {
  const stages = new Set(
    opts.stages ?? ["transcribe", "clone", "translate", "synthesize"],
  );
  const models = resolveProjectApiModels(project);

  const source = await getDubSource(project.id);
  if (!source) throw new Error("Dubbing source not found");
  if (!source.extractedAudioUrl) {
    throw new Error("Extracted audio missing — source may not have an audio track");
  }

  let existingSegments = await listDubSegments(project.id);
  const tracks = await ensureDubTracksMigrated(project, existingSegments);
  const track =
    (opts.trackId ? await getDubTrack(opts.trackId, project.id) : null) ??
    tracks.find(
      (t) => t.languageId === normalizeDubLanguage(project.dubTargetLanguage ?? "en"),
    ) ??
    tracks[0];
  if (!track) throw new Error("No dub language track — add a target language first");

  const targetLanguage = normalizeDubLanguage(track.languageId);
  const targetInfo = dubLanguageInfo(targetLanguage);
  let trackLocales = await listLocalesForTrack(track.id);
  const localeBySegment = () =>
    new Map(trackLocales.map((l) => [l.segmentId, l]));

  async function report(progress: ProcessProgress) {
    onProgress?.(progress);
    await setDubPipelineProgress(project.id, {
      stage: progress.stage,
      message: progress.message,
      current: progress.current ?? null,
      total: progress.total ?? null,
    });
  }

  await report({ stage: "start", message: "Starting dub pipeline…" });

  // -----------------------------------------------------------------------
  // 1. Transcribe
  // -----------------------------------------------------------------------
  const existingSegmentsForTranscription = await listDubSegments(project.id);
  const needsTranscription =
    stages.has("transcribe") &&
    (opts.force ||
      existingSegmentsForTranscription.length === 0 ||
      !source.transcribedAt);

  if (needsTranscription) {
    const durationHint =
      source.durationSeconds && source.durationSeconds > 60
        ? ` (~${Math.ceil(source.durationSeconds / 60)} min audio — can take several minutes)`
        : "";
    await report({
      stage: "transcribe",
      message: `Transcribing source audio${durationHint}…`,
    });
    const audioBuffer = await readMediaBuffer(source.extractedAudioUrl);
    const transcript = await transcribeForDubbing({
      audio: audioBuffer,
      filename: source.originalFilename ?? "source.mp3",
      mimeType: "audio/mpeg",
      languageHint: source.detectedLanguage,
      engine: "auto",
    });

    await db
      .delete(schema.dubbingSegments)
      .where(eq(schema.dubbingSegments.projectId, project.id));

    const now = new Date();
    const rows = transcript.segments.map((seg, idx) => ({
      id: createId(),
      projectId: project.id,
      position: idx,
      startSeconds: seg.start,
      endSeconds: seg.end,
      sourceText: seg.text,
      sourceLanguage: transcript.language,
      translatedText: "",
      targetLanguage,
      status: "transcribed" as const,
      speakerId: seg.speakerId ?? null,
      createdAt: now,
      updatedAt: now,
    }));
    if (rows.length > 0) {
      await db.insert(schema.dubbingSegments).values(rows);
      const allTracks = await listDubTracks(project.id);
      const localeNow = new Date();
      const localeRows = allTracks.flatMap((t) =>
        rows.map((seg) => ({
          id: createId(),
          segmentId: seg.id,
          trackId: t.id,
          translatedText: "",
          status: "transcribed" as const,
          createdAt: localeNow,
          updatedAt: localeNow,
        })),
      );
      if (localeRows.length > 0) {
        await db.insert(schema.dubbingSegmentLocales).values(localeRows);
      }
    }
    await updateDubSource(project.id, {
      detectedLanguage: transcript.language,
      transcriptEngine: transcript.engine,
      transcribedAt: now,
    });
  }

  // -----------------------------------------------------------------------
  // 2. Optional voice clone (IVC)
  // -----------------------------------------------------------------------
  let voiceIdOverride: string | null = null;
  if (stages.has("clone") && project.dubUseVoiceClone) {
    if (project.dubClonedVoiceId && !opts.force) {
      voiceIdOverride = project.dubClonedVoiceId;
    } else {
      await report({
        stage: "clone",
        message: "Cloning source voice via ElevenLabs IVC…",
      });
      const audioBuffer = await readMediaBuffer(source.extractedAudioUrl);
      const cloned = await cloneVoiceFromAudio({
        name: `dub_${project.id.slice(0, 8)}`,
        description: `Cloned from source video for dubbing project ${project.title}`,
        audio: audioBuffer,
        filename: source.originalFilename ?? "sample.mp3",
        mimeType: "audio/mpeg",
      });
      voiceIdOverride = cloned.voiceId;
      await updateDubProject(project.id, { dubClonedVoiceId: cloned.voiceId });
    }
  }

  // -----------------------------------------------------------------------
  // 3. Translate
  // -----------------------------------------------------------------------
  trackLocales = await listLocalesForTrack(track.id);
  const segmentsForTranslation = await listDubSegments(project.id);
  const locMapForTranslate = localeBySegment();
  const missingTranslations = segmentsForTranslation.filter((s) => {
    const loc = locMapForTranslate.get(s.id);
    return opts.force || !loc?.translatedText?.trim();
  });

  if (stages.has("translate") && missingTranslations.length > 0) {
    await report({
      stage: "translate",
      message: `Translating ${missingTranslations.length} segments to ${targetInfo.label}…`,
      current: 0,
      total: missingTranslations.length,
    });
    const translationResult = await translateDubbingSegments({
      sourceLanguage: source.detectedLanguage ?? "en",
      targetLanguage,
      voiceTone: project.voiceTone,
      model: models.llmModel,
      segments: missingTranslations.map((s) => ({
        id: s.id,
        text: s.sourceText,
        durationSeconds: Math.max(0.1, s.endSeconds - s.startSeconds),
      })),
    });
    for (const t of translationResult.translations) {
      const loc = locMapForTranslate.get(t.id);
      if (loc) {
        await updateDubSegmentLocale(loc.id, {
          translatedText: t.text,
          status: "translated",
        });
      }
    }
    trackLocales = await listLocalesForTrack(track.id);
  }

  // -----------------------------------------------------------------------
  // 4. Synthesize
  // -----------------------------------------------------------------------
  if (stages.has("synthesize")) {
    const locMapForSynth = localeBySegment();
    const segmentsForTts = await listDubSegments(project.id);
    const toSynth = segmentsForTts.filter((s) => {
      const loc = locMapForSynth.get(s.id);
      return (
        !!loc?.translatedText.trim() &&
        (opts.force || !loc.ttsAudioUrl || loc.status !== "synthesized")
      );
    });
    let index = 0;
    for (const seg of toSynth) {
      const loc = locMapForSynth.get(seg.id);
      if (!loc) continue;
      index += 1;
      await report({
        stage: "synthesize",
        message: `Synthesizing voice ${index}/${toSynth.length}…`,
        current: index,
        total: toSynth.length,
      });
      try {
        let currentText = loc.translatedText;
        let attempt = 0;
        const MAX_SHORTEN_ATTEMPTS = 4;
        let result = await synthesizeDubSegment(
          {
            id: seg.id,
            text: currentText,
            startSeconds: seg.startSeconds,
            endSeconds: seg.endSeconds,
          },
          {
            ttsModel: models.ttsModel,
            voice: voiceIdOverride ?? models.ttsVoice ?? undefined,
            voiceTone: project.voiceTone,
            speed: project.ttsSpeed ?? 1,
          },
        );

        // Retry with a shorter translation when TTS needs heavy stretch — the
        // main cause of robotic-sounding dubs.
        while (dubSegmentNeedsShorten(result) && attempt < MAX_SHORTEN_ATTEMPTS) {
          attempt += 1;
          await report({
            stage: "synthesize",
            message: `Segment ${index} too long — shortening translation (retry ${attempt}/${MAX_SHORTEN_ATTEMPTS})…`,
            current: index,
            total: toSynth.length,
          });
          try {
            const shorter = await shortenTranslatedLine({
              targetLanguage,
              originalSource: seg.sourceText,
              currentTranslation: currentText,
              targetSeconds: Math.max(0.5, seg.endSeconds - seg.startSeconds),
              model: models.llmModel,
              attempt,
            });
            if (!shorter || shorter === currentText) break;
            currentText = shorter;
            result = await synthesizeDubSegment(
              {
                id: seg.id,
                text: currentText,
                startSeconds: seg.startSeconds,
                endSeconds: seg.endSeconds,
              },
              {
                ttsModel: models.ttsModel,
                voice: voiceIdOverride ?? models.ttsVoice ?? undefined,
                voiceTone: project.voiceTone,
                speed: project.ttsSpeed ?? 1,
              },
            );
          } catch {
            break;
          }
        }

        const url = await saveDubSegmentAudio({
          projectId: project.id,
          segmentId: seg.id,
          buffer: result.buffer,
          filename: `${track.languageId}_${result.filename}`,
        });
        await updateDubSegmentLocale(loc.id, {
          translatedText: currentText,
          ttsAudioUrl: url,
          ttsDurationSeconds: result.ttsDurationSeconds,
          ttsModel: result.modelUsed,
          ttsVoice: result.voiceUsed || null,
          stretchRatio: result.stretchRatio,
          status: "synthesized",
          errorMessage: result.overflowed
            ? `Voice still slightly over the original slot (${(result.stretchRatio).toFixed(2)}x max stretch).`
            : null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateDubSegmentLocale(loc.id, {
          status: "error",
          errorMessage: message.slice(0, 500),
        });
      }
    }
  }

  await syncPrimaryTrackToSegments(project, track.id);
  await clearDubPipelineProgress(project.id);

  return { ok: true };
}
