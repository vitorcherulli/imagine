import { OPENROUTER_MODELS, openRouterFetch } from "./client";
import { adjustSpeechSpeed } from "../ffmpeg";
import { normalizeTtsSpeed } from "../narration-speed";
import {
  DEFAULT_GEMINI_TTS_VOICE,
  DEFAULT_GROK_TTS_VOICE,
  DEFAULT_ELEVENLABS_VOICE,
  isElevenLabsTtsModel,
  isGeminiTtsModel,
  isGrokTtsModel,
} from "../project-api-models";
import {
  elevenLabsModelIdFromSlug,
  generateElevenLabsSpeech,
} from "../elevenlabs/tts";
import type { ScriptDeliverySpan } from "../script-studio";
import {
  buildTtsDeliveryNotes,
  formatGeminiDeliverySpanBlock,
  prepareSpeechTextForTts,
} from "../script-tts-delivery";

export const KOKORO_TTS_MODEL = "hexgrad/kokoro-82m";
export const GROK_TTS_MODEL = "x-ai/grok-voice-tts-1.0";

export interface TtsInput {
  text: string;
  voice?: string;
  model?: string;
  format?: "mp3" | "pcm";
  speed?: number;
  /** Used when Gemini is blocked and we fall back to Kokoro. */
  voiceTone?: string;
  /** Director pacing hint from Script Studio narrator suggestion. */
  deliveryNotes?: string;
  /** AI delivery spans from Analyze delivery — applied per speech segment. */
  deliverySpans?: ScriptDeliverySpan[];
}

function deliverySpeedBias(notes?: string): number {
  if (!notes?.trim()) return 0;
  const lower = notes.toLowerCase();
  if (/\b(slow|unhurried|gentle|calm|lingering|soft|breath)\b/.test(lower)) return -0.08;
  if (/\b(fast|quick|energetic|urgent|brisk|punchy)\b/.test(lower)) return 0.08;
  return 0;
}

export interface SpeechResult {
  buffer: Buffer;
  filename: string;
  /** Model that actually produced the audio (may differ after fallback). */
  modelUsed: string;
  /** True when Gemini was blocked and Kokoro was used instead. */
  usedFallback?: boolean;
}

/** Gemini TTS returns 24 kHz, 16-bit mono PCM. */
const GEMINI_PCM_SAMPLE_RATE = 24000;

function pcmToWav(
  pcm: Buffer,
  sampleRate = GEMINI_PCM_SAMPLE_RATE,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Google recommends a clear preamble so the TTS classifier does not false-reject. */
function formatGeminiTtsInput(
  text: string,
  deliveryNotes?: string,
  deliverySpans?: ScriptDeliverySpan[],
): string {
  const transcript = text.trim();
  const delivery = deliveryNotes?.trim();
  const spanBlock = formatGeminiDeliverySpanBlock(deliverySpans ?? []);
  const deliveryLine = delivery
    ? `Overall delivery (do not read aloud): ${delivery}\n\n`
    : "";
  return (
    "Read the following story narration aloud in a warm, natural storyteller voice. " +
    "Speak only the transcript text below. Do not read labels, instructions, or metadata. " +
    "Follow the performance emphasis notes for intonation and pacing on specific phrases.\n\n" +
    spanBlock +
    deliveryLine +
    `Transcript:\n${transcript}`
  );
}

export function isTtsSafetyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("sensitive information") ||
    lower.includes("output audio may contain") ||
    lower.includes("prohibited_content") ||
    lower.includes("prohibited content") ||
    lower.includes("content filter") ||
    lower.includes("safety filter") ||
    lower.includes("blocked") ||
    lower.includes("request failed because")
  );
}

function extractErrorMessage(raw: string): string {
  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };
    return json.error?.message ?? json.message ?? raw;
  } catch {
    return raw;
  }
}

export function shouldFallbackFromGemini(message: string): boolean {
  return isTtsSafetyError(message);
}

export function formatTtsUserError(raw: string, model: string): string {
  if (!isTtsSafetyError(raw)) return raw;
  if (isGeminiTtsModel(model)) {
    return (
      "Gemini TTS blocked this narration (Google content safety filter). " +
      "Try rephrasing the script, switch Voice API to Kokoro in project settings, " +
      "or regenerate — the app will auto-fallback to Kokoro when possible."
    );
  }
  return "TTS blocked this narration (content safety filter). Try rephrasing the script.";
}

function parseTtsErrorBody(status: number, body: string): string {
  const core = extractErrorMessage(body);
  return core.includes("OpenRouter TTS error") ? core : `OpenRouter TTS error ${status}: ${core}`;
}

async function requestSpeechOnce(input: {
  text: string;
  voice: string;
  model: string;
  format: "mp3" | "pcm";
  speed?: number;
  deliveryNotes?: string;
  deliverySpans?: ScriptDeliverySpan[];
}): Promise<{ buffer: Buffer; filename: string }> {
  const gemini = isGeminiTtsModel(input.model);
  const spokenText = prepareSpeechTextForTts({
    text: input.text,
    deliverySpans: input.deliverySpans,
    ttsModel: input.model,
    isGemini: gemini,
    isElevenLabs: false,
  });
  const ttsText = gemini
    ? formatGeminiTtsInput(spokenText, input.deliveryNotes, input.deliverySpans)
    : spokenText;
  const format = input.format ?? (gemini ? "pcm" : "mp3");

  const res = await openRouterFetch("/audio/speech", {
    method: "POST",
    json: {
      model: input.model,
      input: ttsText,
      voice: input.voice,
      response_format: format,
      ...(input.speed ? { speed: input.speed } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseTtsErrorBody(res.status, text));
  }

  let buffer: Buffer;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as {
      error?: { message?: string };
      data?: Array<{ url?: string }>;
      url?: string;
    };
    if (json.error?.message) {
      throw new Error(json.error.message);
    }
    const url = json.data?.[0]?.url ?? json.url;
    if (!url) throw new Error("TTS returned JSON without audio URL");
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      throw new Error(`TTS audio download error ${audioRes.status}`);
    }
    buffer = Buffer.from(await audioRes.arrayBuffer());
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
    // Some providers return JSON errors with a non-JSON content-type.
    if (buffer.length < 4096 && buffer[0] === 0x7b) {
      const maybe = extractErrorMessage(buffer.toString("utf8"));
      if (shouldFallbackFromGemini(maybe) || maybe.toLowerCase().includes("error")) {
        throw new Error(maybe);
      }
    }
  }

  if (gemini || format === "pcm") {
    return { buffer: pcmToWav(buffer), filename: "audio.wav" };
  }
  return { buffer, filename: "audio.mp3" };
}

export async function generateSpeech(input: TtsInput): Promise<SpeechResult> {
  const primaryModel = input.model ?? OPENROUTER_MODELS.tts;
  const gemini = isGeminiTtsModel(primaryModel);
  const grok = isGrokTtsModel(primaryModel);
  const elevenlabs = isElevenLabsTtsModel(primaryModel);
  const voice =
    input.voice ??
    (gemini
      ? DEFAULT_GEMINI_TTS_VOICE
      : grok
        ? pickGrokVoiceForTone(input.voiceTone ?? "")
        : elevenlabs
          ? pickElevenLabsVoiceForTone(input.voiceTone ?? "")
          : pickVoiceForTone(input.voiceTone ?? ""));
  const format = input.format ?? (gemini ? "pcm" : "mp3");
  const speed = normalizeTtsSpeed(
    (input.speed ?? 1) + deliverySpeedBias(input.deliveryNotes),
  );
  const deliveryNotes = buildTtsDeliveryNotes(
    input.deliveryNotes,
    input.deliverySpans ?? [],
  );
  const spokenText = prepareSpeechTextForTts({
    text: input.text,
    deliverySpans: input.deliverySpans,
    ttsModel: primaryModel,
    isGemini: gemini,
    isElevenLabs: elevenlabs,
  });
  console.info(
    `[tts] model=${primaryModel} voice=${voice} format=${format} speed=${speed} deliverySpans=${input.deliverySpans?.length ?? 0}`,
  );

  async function finish(result: { buffer: Buffer; filename: string }, modelUsed: string, usedFallback?: boolean) {
    const adjusted = await adjustSpeechSpeed(result.buffer, result.filename, speed);
    return { ...adjusted, modelUsed, usedFallback };
  }

  async function synthesize(): Promise<{ buffer: Buffer; filename: string }> {
    if (elevenlabs) {
      return generateElevenLabsSpeech({
        text: spokenText,
        voiceId: voice,
        modelId: elevenLabsModelIdFromSlug(primaryModel),
        speed,
        useSsml: Boolean(input.deliverySpans?.length),
      });
    }
    return requestSpeechOnce({
      text: input.text,
      voice,
      model: primaryModel,
      format,
      speed: speed !== 1 ? speed : undefined,
      deliveryNotes,
      deliverySpans: input.deliverySpans,
    });
  }

  try {
    const result = await synthesize();
    return finish(result, primaryModel);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const canFallback =
      (isGeminiTtsModel(primaryModel) ||
        isGrokTtsModel(primaryModel) ||
        isElevenLabsTtsModel(primaryModel)) &&
      primaryModel !== KOKORO_TTS_MODEL;

    if (canFallback) {
      try {
        const fallbackVoice = pickVoiceForTone(input.voiceTone ?? "warm");
        const result = await requestSpeechOnce({
          text: input.text,
          voice: fallbackVoice,
          model: KOKORO_TTS_MODEL,
          format: "mp3",
          speed: input.speed,
          deliveryNotes,
          deliverySpans: input.deliverySpans,
        });
        console.warn(
          `[tts] Gemini blocked/failed — used Kokoro fallback. Original: ${raw.slice(0, 160)}`,
        );
        return finish(
          result,
          KOKORO_TTS_MODEL,
          true,
        );
      } catch (fallbackErr) {
        const fallbackRaw =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(
          `${formatTtsUserError(raw, primaryModel)} Kokoro fallback also failed: ${fallbackRaw}`,
        );
      }
    }

    throw new Error(formatTtsUserError(raw, primaryModel));
  }
}

export function pickVoiceForTone(tone: string): string {
  const t = tone.toLowerCase();
  if (t.includes("dramatic") || t.includes("suspense") || t.includes("dark")) return "am_michael";
  if (t.includes("calm") || t.includes("soft")) return "af_nicole";
  if (t.includes("energ") || t.includes("excit")) return "af_bella";
  if (t.includes("warm") || t.includes("kind")) return "af_heart";
  if (t.includes("narr") || t.includes("document")) return "am_adam";
  return "af_heart";
}

export function pickGeminiVoiceForTone(tone: string): string {
  const t = tone.toLowerCase();
  if (t.includes("dramatic") || t.includes("suspense") || t.includes("dark")) return "Charon";
  if (t.includes("calm") || t.includes("soft")) return "Aoede";
  if (t.includes("energ") || t.includes("excit") || t.includes("playful")) return "Puck";
  if (t.includes("warm") || t.includes("kind")) return "Kore";
  if (t.includes("narr") || t.includes("document")) return "Fenrir";
  return "Kore";
}

export function pickGrokVoiceForTone(tone: string): string {
  const t = tone.toLowerCase();
  if (t.includes("dramatic") || t.includes("suspense") || t.includes("dark")) return "rex";
  if (t.includes("calm") || t.includes("soft")) return "sal";
  if (t.includes("energ") || t.includes("excit") || t.includes("playful")) return "eve";
  if (t.includes("warm") || t.includes("kind")) return "ara";
  if (t.includes("narr") || t.includes("document")) return "leo";
  return DEFAULT_GROK_TTS_VOICE;
}

export function pickElevenLabsVoiceForTone(tone: string): string {
  const t = tone.toLowerCase();
  if (t.includes("dramatic") || t.includes("suspense") || t.includes("dark")) return "pNInz6obpgDQGcFmaJgB";
  if (t.includes("calm") || t.includes("soft")) return "EXAVITQu4vr4xnSDxMaL";
  if (t.includes("energ") || t.includes("excit")) return "MF3mGyEYCl7XYWbV9V6O";
  if (t.includes("warm") || t.includes("kind")) return "XrExE9yKIg1WjnnlVkGX";
  if (t.includes("narr") || t.includes("document")) return "XB0fDUnXU5powFXDhCwa";
  return DEFAULT_ELEVENLABS_VOICE;
}

export function resolveTtsVoice(input: {
  ttsModel: string;
  ttsVoice: string;
  voiceTone: string;
}): string {
  if (isGeminiTtsModel(input.ttsModel)) {
    return input.ttsVoice || DEFAULT_GEMINI_TTS_VOICE;
  }
  if (isGrokTtsModel(input.ttsModel)) {
    if (input.ttsVoice && input.ttsVoice !== "auto") {
      return input.ttsVoice.toLowerCase();
    }
    return pickGrokVoiceForTone(input.voiceTone);
  }
  if (isElevenLabsTtsModel(input.ttsModel)) {
    if (input.ttsVoice && input.ttsVoice !== "auto") return input.ttsVoice;
    return pickElevenLabsVoiceForTone(input.voiceTone);
  }
  if (input.ttsVoice && input.ttsVoice !== "auto") {
    return input.ttsVoice;
  }
  return pickVoiceForTone(input.voiceTone);
}
