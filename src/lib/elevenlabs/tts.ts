import type { ElevenLabsVoiceSettings } from "../elevenlabs-voice-settings";
import { normalizeElevenLabsVoiceSettings } from "../elevenlabs-voice-settings";
import { normalizeTtsSpeed } from "../narration-speed";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsSpeechInput {
  text: string;
  voiceId: string;
  modelId: string;
  speed?: number;
  voiceSettings?: Partial<ElevenLabsVoiceSettings>;
  /** When true, text may contain SSML break tags. */
  useSsml?: boolean;
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export function elevenLabsModelIdFromSlug(model: string): string {
  if (model.startsWith("elevenlabs/")) {
    return model.slice("elevenlabs/".length);
  }
  return model;
}

export async function generateElevenLabsSpeech(
  input: ElevenLabsSpeechInput,
): Promise<{ buffer: Buffer; filename: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local to use ElevenLabs voices.",
    );
  }

  const voiceId = input.voiceId.trim();
  if (!voiceId) throw new Error("ElevenLabs voice id is required.");

  const speed = normalizeTtsSpeed(input.speed ?? 1);
  const voiceSettings = normalizeElevenLabsVoiceSettings(input.voiceSettings);
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: input.modelId,
      ...(input.useSsml ? { enable_ssml_parsing: true } : {}),
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarityBoost,
        style: voiceSettings.style,
        use_speaker_boost: voiceSettings.speakerBoost,
        speed,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 300);
    try {
      const json = JSON.parse(body) as { detail?: { message?: string } | string };
      if (typeof json.detail === "string") message = json.detail;
      else if (json.detail?.message) message = json.detail.message;
    } catch {
      // keep raw slice
    }
    throw new Error(`ElevenLabs TTS error ${res.status}: ${message}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename: "audio.mp3" };
}
