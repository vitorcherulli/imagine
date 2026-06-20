import { OPENROUTER_MODELS, openRouterFetch } from "./client";
import {
  DEFAULT_GEMINI_TTS_VOICE,
  isGeminiTtsModel,
} from "../project-api-models";

export const KOKORO_TTS_MODEL = "hexgrad/kokoro-82m";

export interface TtsInput {
  text: string;
  voice?: string;
  model?: string;
  format?: "mp3" | "pcm";
  speed?: number;
  /** Used when Gemini is blocked and we fall back to Kokoro. */
  voiceTone?: string;
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
function formatGeminiTtsInput(text: string): string {
  const transcript = text.trim();
  return (
    "Read the following story narration aloud in a warm, natural storyteller voice. " +
    "Speak only the transcript text below. Do not read labels, instructions, or metadata.\n\n" +
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
}): Promise<{ buffer: Buffer; filename: string }> {
  const gemini = isGeminiTtsModel(input.model);
  const ttsText = gemini ? formatGeminiTtsInput(input.text) : input.text;

  const res = await openRouterFetch("/audio/speech", {
    method: "POST",
    json: {
      model: input.model,
      input: ttsText,
      voice: input.voice,
      response_format: input.format,
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

  if (gemini || input.format === "pcm") {
    return { buffer: pcmToWav(buffer), filename: "audio.wav" };
  }
  return { buffer, filename: "audio.mp3" };
}

export async function generateSpeech(input: TtsInput): Promise<SpeechResult> {
  const primaryModel = input.model ?? OPENROUTER_MODELS.tts;
  const gemini = isGeminiTtsModel(primaryModel);
  const voice =
    input.voice ?? (gemini ? DEFAULT_GEMINI_TTS_VOICE : pickVoiceForTone(input.voiceTone ?? ""));
  const format = input.format ?? (gemini ? "pcm" : "mp3");
  console.info(`[tts] model=${primaryModel} voice=${voice} format=${format}`);

  try {
    const result = await requestSpeechOnce({
      text: input.text,
      voice,
      model: primaryModel,
      format,
      speed: input.speed,
    });
    return { ...result, modelUsed: primaryModel };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const canFallback =
      isGeminiTtsModel(primaryModel) && primaryModel !== KOKORO_TTS_MODEL;

    if (canFallback) {
      try {
        const fallbackVoice = pickVoiceForTone(input.voiceTone ?? "warm");
        const result = await requestSpeechOnce({
          text: input.text,
          voice: fallbackVoice,
          model: KOKORO_TTS_MODEL,
          format: "mp3",
          speed: input.speed,
        });
        console.warn(
          `[tts] Gemini blocked/failed — used Kokoro fallback. Original: ${raw.slice(0, 160)}`,
        );
        return {
          ...result,
          modelUsed: KOKORO_TTS_MODEL,
          usedFallback: true,
        };
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

export function resolveTtsVoice(input: {
  ttsModel: string;
  ttsVoice: string;
  voiceTone: string;
}): string {
  if (isGeminiTtsModel(input.ttsModel)) {
    return input.ttsVoice || DEFAULT_GEMINI_TTS_VOICE;
  }
  if (input.ttsVoice && input.ttsVoice !== "auto") {
    return input.ttsVoice;
  }
  return pickVoiceForTone(input.voiceTone);
}
