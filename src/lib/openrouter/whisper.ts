/**
 * Whisper (STT) fallback via OpenRouter.
 *
 * Usa `POST /audio/transcriptions` compatível com OpenAI. Retorna segmentos
 * com timestamps.
 */
import { OPENROUTER_BASE } from "./client";

const DEFAULT_WHISPER_MODEL =
  process.env.OPENROUTER_WHISPER_MODEL ?? "openai/whisper-large-v3";

export interface WhisperSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
}

export interface WhisperResponse {
  language?: string;
  text: string;
  segments?: WhisperSegment[];
}

export interface WhisperTranscription {
  language: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  raw: WhisperResponse;
}

export async function transcribeWithWhisper(input: {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  languageHint?: string | null;
}): Promise<WhisperTranscription> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — cannot run Whisper fallback.",
    );
  }
  const referer = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const form = new FormData();
  const ab = new ArrayBuffer(input.audio.byteLength);
  new Uint8Array(ab).set(input.audio);
  const blob = new Blob([ab], {
    type: input.mimeType || "audio/mpeg",
  });
  form.append("file", blob, input.filename || "source.mp3");
  form.append("model", DEFAULT_WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (input.languageHint) form.append("language", input.languageHint);

  const res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": referer,
      "X-Title": "Imagine",
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Whisper (OpenRouter) error ${res.status}: ${body.slice(0, 400)}`,
    );
  }

  const raw = (await res.json()) as WhisperResponse;
  const segments =
    (raw.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })) ??
    // Fallback: single segment with whole text
    [];
  if (segments.length === 0 && raw.text) {
    segments.push({ start: 0, end: 0, text: raw.text.trim() });
  }
  return {
    language: raw.language || input.languageHint || "en",
    text: raw.text || segments.map((s) => s.text).join(" "),
    segments,
    raw,
  };
}
