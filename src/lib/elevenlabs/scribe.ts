/**
 * ElevenLabs Scribe — Speech-to-Text com timestamps por palavra + segmento.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

const SCRIBE_MODEL_ID = "scribe_v1";

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(buf);
  return out;
}

export interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type?: "word" | "spacing" | "audio_event";
  speaker_id?: string;
}

export interface ScribeResponse {
  language_code?: string;
  language_probability?: number;
  text: string;
  words: ScribeWord[];
}

export interface ScribeSegment {
  start: number;
  end: number;
  text: string;
  speakerId?: string;
}

export interface ScribeTranscription {
  language: string;
  text: string;
  segments: ScribeSegment[];
  raw: ScribeResponse;
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/**
 * Envia o buffer de áudio para o Scribe e devolve o transcript já quebrado em
 * segmentos utilizáveis pelo pipeline de dublagem.
 */
export async function transcribeWithScribe(input: {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  /** Optional hint: e.g. "en", "pt" — ajuda quando o STT patina em auto-detect. */
  languageHint?: string | null;
  /** Se true, tenta detectar diferentes falantes (para futuro; hoje só marca id). */
  diarize?: boolean;
}): Promise<ScribeTranscription> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local to use ElevenLabs Scribe.",
    );
  }

  const form = new FormData();
  const blob = new Blob([bufferToArrayBuffer(input.audio)], {
    type: input.mimeType || "audio/mpeg",
  });
  form.append("file", blob, input.filename || "source.mp3");
  form.append("model_id", SCRIBE_MODEL_ID);
  form.append("timestamps_granularity", "word");
  if (input.diarize) form.append("diarize", "true");
  if (input.languageHint) form.append("language_code", input.languageHint);
  form.append("tag_audio_events", "false");

  const res = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 400);
    try {
      const json = JSON.parse(body) as {
        detail?: { message?: string } | string;
      };
      if (typeof json.detail === "string") message = json.detail;
      else if (json.detail?.message) message = json.detail.message;
    } catch {
      // keep raw
    }
    throw new Error(`ElevenLabs Scribe error ${res.status}: ${message}`);
  }

  const raw = (await res.json()) as ScribeResponse;
  const segments = wordsToSegments(raw.words ?? []);
  return {
    language: raw.language_code || input.languageHint || "en",
    text: raw.text || segments.map((s) => s.text).join(" "),
    segments,
    raw,
  };
}

/**
 * Agrupa palavras em segmentos falados curtos, otimizados para dublagem
 * sincronizada. Estratégia:
 *
 *   - Quebra imediatamente em fim de frase (. ? ! …) se o segmento atual já
 *     tiver conteúdo — pontos naturais para trocar cabeça na dublagem.
 *   - Quebra em vírgulas / “—” se o segmento passou de MIN_COMMA_CHARS.
 *   - Quebra em pausas ≥ SHORT_PAUSE (400ms) — respiração/troca de tom.
 *   - Hard cap: MAX_CHARS ou MAX_DURATION.
 *   - Speaker change sempre quebra.
 *
 * Segmentos curtos = drift menor, sync melhor. O “custo” é mais chamadas TTS.
 */
export function wordsToSegments(words: ScribeWord[]): ScribeSegment[] {
  const spoken = words.filter(
    (w) => w.type !== "spacing" && w.type !== "audio_event" && w.text.trim(),
  );
  if (spoken.length === 0) return [];

  const MAX_CHARS = 130;
  const MAX_DURATION = 7; // seconds
  const SHORT_PAUSE = 0.4;
  const MIN_COMMA_CHARS = 40;
  const MIN_SENTENCE_CHARS = 8;
  const segments: ScribeSegment[] = [];

  let bufferWords: ScribeWord[] = [];
  let bufferStart = spoken[0].start;
  let bufferText = "";
  let lastEnd = spoken[0].start;
  let currentSpeaker = spoken[0].speaker_id;

  const flush = () => {
    if (bufferWords.length === 0) return;
    const start = bufferStart;
    const end = bufferWords[bufferWords.length - 1].end;
    segments.push({
      start,
      end: Math.max(end, start + 0.05),
      text: bufferText.trim(),
      speakerId: currentSpeaker,
    });
    bufferWords = [];
    bufferText = "";
  };

  for (const word of spoken) {
    const gap = word.start - lastEnd;
    const nextText = bufferText ? `${bufferText} ${word.text}` : word.text;
    const speakerChanged =
      word.speaker_id && currentSpeaker && word.speaker_id !== currentSpeaker;

    const hardBreak =
      bufferWords.length > 0 &&
      (gap >= SHORT_PAUSE ||
        nextText.length > MAX_CHARS ||
        word.end - bufferStart > MAX_DURATION ||
        speakerChanged);

    if (hardBreak) {
      flush();
      bufferStart = word.start;
      currentSpeaker = word.speaker_id;
    }

    if (bufferWords.length === 0) {
      bufferStart = word.start;
      currentSpeaker = word.speaker_id ?? currentSpeaker;
    }
    bufferWords.push(word);
    bufferText = nextText;
    lastEnd = word.end;

    const trimmed = word.text.trim();
    const endsSentence = /[.!?…]$/.test(trimmed);
    const endsClause = /[,;:—]$/.test(trimmed);

    if (endsSentence && bufferText.length >= MIN_SENTENCE_CHARS) {
      flush();
    } else if (endsClause && bufferText.length >= MIN_COMMA_CHARS) {
      flush();
    }
  }
  flush();

  return segments;
}
