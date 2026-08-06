/**
 * Orquestrador de transcrição para o pipeline de dublagem.
 *
 * Estratégia: **ElevenLabs Scribe primeiro** (melhor qualidade + timestamps por
 * palavra), com **Whisper via OpenRouter** como fallback caso Scribe não esteja
 * configurado ou falhe.
 */
import {
  transcribeWithScribe,
  isElevenLabsConfigured,
  type ScribeSegment,
} from "@/lib/elevenlabs/scribe";
import { transcribeWithWhisper } from "@/lib/openrouter/whisper";

export interface DubTranscriptSegment {
  start: number;
  end: number;
  text: string;
  speakerId?: string;
}

export interface DubTranscript {
  language: string;
  text: string;
  segments: DubTranscriptSegment[];
  engine: "elevenlabs-scribe" | "openrouter-whisper";
}

export interface TranscribeOptions {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  languageHint?: string | null;
  diarize?: boolean;
  /**
   * Fluxo:
   *  - "auto" (default): Scribe → Whisper fallback
   *  - "scribe": só Scribe
   *  - "whisper": só Whisper
   */
  engine?: "auto" | "scribe" | "whisper";
}

export async function transcribeForDubbing(
  opts: TranscribeOptions,
): Promise<DubTranscript> {
  const engine = opts.engine ?? "auto";
  const errors: string[] = [];

  const tryScribe = async (): Promise<DubTranscript | null> => {
    if (!isElevenLabsConfigured()) {
      errors.push("Scribe skipped: ELEVENLABS_API_KEY not set");
      return null;
    }
    try {
      const result = await transcribeWithScribe({
        audio: opts.audio,
        filename: opts.filename,
        mimeType: opts.mimeType,
        languageHint: opts.languageHint ?? null,
        diarize: opts.diarize,
      });
      return {
        language: result.language,
        text: result.text,
        segments: result.segments.map(toDubSegment),
        engine: "elevenlabs-scribe",
      };
    } catch (err) {
      errors.push(
        `Scribe failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  };

  const tryWhisper = async (): Promise<DubTranscript | null> => {
    try {
      const result = await transcribeWithWhisper({
        audio: opts.audio,
        filename: opts.filename,
        mimeType: opts.mimeType,
        languageHint: opts.languageHint ?? null,
      });
      return {
        language: result.language,
        text: result.text,
        segments: result.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        engine: "openrouter-whisper",
      };
    } catch (err) {
      errors.push(
        `Whisper failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  };

  if (engine === "scribe") {
    const scribe = await tryScribe();
    if (scribe) return scribe;
    throw new Error(`Scribe transcription failed: ${errors.join(" · ")}`);
  }

  if (engine === "whisper") {
    const whisper = await tryWhisper();
    if (whisper) return whisper;
    throw new Error(`Whisper transcription failed: ${errors.join(" · ")}`);
  }

  const scribe = await tryScribe();
  if (scribe) return scribe;
  const whisper = await tryWhisper();
  if (whisper) return whisper;
  throw new Error(`No STT engine succeeded. ${errors.join(" · ")}`);
}

function toDubSegment(s: ScribeSegment): DubTranscriptSegment {
  return {
    start: s.start,
    end: s.end,
    text: s.text,
    speakerId: s.speakerId,
  };
}
