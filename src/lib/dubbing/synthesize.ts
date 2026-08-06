/**
 * TTS por segmento para o pipeline de dublagem.
 *
 * Estratégia sincronizada:
 *   1. Gera o áudio no idioma alvo com a voz escolhida (com speed preemptivo).
 *   2. Mede a duração natural produzida.
 *   3. Se ela ultrapassa a janela mesmo com o max-stretch → **retorna sem
 *      renderizar** para que o orquestrador possa pedir uma versão mais curta
 *      da tradução e chamar de novo.
 *   4. Caso contrário, aplica time-stretch leve (≤10%) para caber no slot.
 *      Nunca desacelera a voz para preencher silêncio — isso soa robótico.
 */
import { generateSpeech } from "@/lib/openrouter/tts";
import { normalizeTtsSpeed } from "@/lib/narration-speed";
import {
  probeAudioBufferDurationSeconds,
  stretchAudioBufferToTargetDuration,
} from "@/lib/ffmpeg";

/** Max speed-up before voice sounds crushed — prefer shortening the text. */
export const DUB_STRETCH_MAX = 1.1;
/** Never slow speech to fill a longer slot. */
export const DUB_STRETCH_MIN = 0.98;

export interface SegmentSynthesisInput {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface SegmentSynthesisResult {
  id: string;
  buffer: Buffer;
  filename: string;
  ttsDurationSeconds: number;
  naturalDurationSeconds: number;
  stretchRatio: number;
  modelUsed: string;
  voiceUsed: string;
  targetSeconds: number;
  /** True when TTS was too long even at max stretch (dub will overflow). */
  overflowed: boolean;
}

export interface SynthesizeOptions {
  ttsModel: string;
  voice?: string;
  voiceTone?: string | null;
  speed?: number;
  minStretchRatio?: number;
  maxStretchRatio?: number;
  /**
   * Overflow threshold: if the natural TTS duration is more than
   * `targetSeconds * (maxStretchRatio + overflowMargin)`, mark as overflow so
   * the caller can shorten the translation and retry.
   */
  overflowMargin?: number;
}

/** True when the segment should be re-synthesized with a shorter translation. */
export function dubSegmentNeedsShorten(result: SegmentSynthesisResult): boolean {
  if (result.overflowed) return true;
  const stretchDist = Math.abs(result.stretchRatio - 1);
  if (stretchDist > 0.09) return true;
  return result.ttsDurationSeconds > result.targetSeconds * 1.04;
}

function estimatePreemptiveTtsSpeed(
  text: string,
  targetSeconds: number,
  baseSpeed: number,
): number {
  const estimatedDuration = Math.max(0.5, text.length / 13);
  if (estimatedDuration <= targetSeconds * 0.94) return baseSpeed;
  const needed = (estimatedDuration / targetSeconds) * baseSpeed;
  return normalizeTtsSpeed(needed);
}

export async function synthesizeDubSegment(
  segment: SegmentSynthesisInput,
  opts: SynthesizeOptions,
): Promise<SegmentSynthesisResult> {
  const text = segment.text.trim();
  if (!text) throw new Error(`Segment ${segment.id} has empty translated text`);

  const targetSeconds = Math.max(0.5, segment.endSeconds - segment.startSeconds);
  const baseSpeed = opts.speed ?? 1;
  const ttsSpeed = estimatePreemptiveTtsSpeed(text, targetSeconds, baseSpeed);

  const speech = await generateSpeech({
    text,
    model: opts.ttsModel,
    voice: opts.voice,
    voiceTone: opts.voiceTone ?? undefined,
    speed: ttsSpeed,
  });

  const naturalDuration =
    (await probeAudioBufferDurationSeconds({
      buffer: speech.buffer,
      filename: speech.filename,
    })) ?? Math.max(1, text.length / 15);

  const minRatio = opts.minStretchRatio ?? DUB_STRETCH_MIN;
  const maxRatio = opts.maxStretchRatio ?? DUB_STRETCH_MAX;
  const overflowMargin = opts.overflowMargin ?? 0.04;
  const overflowed =
    naturalDuration > targetSeconds * (maxRatio + overflowMargin);

  const stretched = await stretchAudioBufferToTargetDuration({
    buffer: speech.buffer,
    filename: speech.filename,
    currentSeconds: naturalDuration,
    targetSeconds,
    minRatio,
    maxRatio,
  });

  const stillTooLong =
    stretched.durationSeconds > targetSeconds * 1.04 ||
    naturalDuration > targetSeconds * maxRatio;

  return {
    id: segment.id,
    buffer: stretched.buffer,
    filename: stretched.filename,
    ttsDurationSeconds: stretched.durationSeconds,
    naturalDurationSeconds: naturalDuration,
    stretchRatio: stretched.ratio,
    modelUsed: speech.modelUsed,
    voiceUsed: opts.voice ?? "",
    targetSeconds,
    overflowed: overflowed || stillTooLong,
  };
}
