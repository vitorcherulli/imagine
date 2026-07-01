export interface ElevenLabsVoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
}

export type KokoroExpressiveness = "subtle" | "natural" | "expressive";

export interface KokoroVoiceSettings {
  expressiveness: KokoroExpressiveness;
}

export interface TtsVoiceSettings {
  elevenLabs?: Partial<ElevenLabsVoiceSettings>;
  kokoro?: Partial<KokoroVoiceSettings>;
}

export const DEFAULT_KOKORO_VOICE_SETTINGS: KokoroVoiceSettings = {
  expressiveness: "expressive",
};

export const DEFAULT_ELEVENLABS_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  /** Steady documentary narration — expressive enough, not robotic. */
  stability: 0.55,
  similarityBoost: 0.85,
  style: 0,
  speakerBoost: true,
};

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export function normalizeElevenLabsVoiceSettings(
  input?: Partial<ElevenLabsVoiceSettings> | null,
): ElevenLabsVoiceSettings {
  return {
    stability: clamp01(input?.stability, DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability),
    similarityBoost: clamp01(
      input?.similarityBoost,
      DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarityBoost,
    ),
    style: clamp01(input?.style, DEFAULT_ELEVENLABS_VOICE_SETTINGS.style),
    speakerBoost:
      typeof input?.speakerBoost === "boolean"
        ? input.speakerBoost
        : DEFAULT_ELEVENLABS_VOICE_SETTINGS.speakerBoost,
  };
}

export function parseTtsVoiceSettings(raw: string | null | undefined): TtsVoiceSettings {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as TtsVoiceSettings;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function serializeTtsVoiceSettings(settings: TtsVoiceSettings): string {
  return JSON.stringify(settings);
}

export function resolveElevenLabsVoiceSettings(
  raw: string | null | undefined,
): ElevenLabsVoiceSettings {
  const parsed = parseTtsVoiceSettings(raw);
  return normalizeElevenLabsVoiceSettings(parsed.elevenLabs);
}

export function normalizeKokoroVoiceSettings(
  input?: Partial<KokoroVoiceSettings> | null,
): KokoroVoiceSettings {
  const level = input?.expressiveness;
  if (level === "subtle" || level === "natural" || level === "expressive") {
    return { expressiveness: level };
  }
  return { ...DEFAULT_KOKORO_VOICE_SETTINGS };
}

export function resolveKokoroVoiceSettings(
  raw: string | null | undefined,
): KokoroVoiceSettings {
  const parsed = parseTtsVoiceSettings(raw);
  return normalizeKokoroVoiceSettings(parsed.kokoro);
}

export function mergeKokoroVoiceSettings(
  raw: string | null | undefined,
  patch: Partial<KokoroVoiceSettings>,
): TtsVoiceSettings {
  const current = parseTtsVoiceSettings(raw);
  return {
    ...current,
    kokoro: normalizeKokoroVoiceSettings({
      ...current.kokoro,
      ...patch,
    }),
  };
}

export function mergeElevenLabsVoiceSettings(
  raw: string | null | undefined,
  patch: Partial<ElevenLabsVoiceSettings>,
): TtsVoiceSettings {
  const current = parseTtsVoiceSettings(raw);
  return {
    ...current,
    elevenLabs: normalizeElevenLabsVoiceSettings({
      ...current.elevenLabs,
      ...patch,
    }),
  };
}
