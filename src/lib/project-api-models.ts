import { z } from "zod";
import { OPENROUTER_MODELS } from "./openrouter/client";
import type { Project } from "./db/schema";

export interface ApiModelOption {
  value: string;
  label: string;
  /** Name shown on OpenRouter usage/billing (when different from label). */
  openRouterBilling?: string;
}

export interface VoiceOption {
  value: string;
  label: string;
}

export const LLM_MODEL_OPTIONS: ApiModelOption[] = [
  { value: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "openai/gpt-4.1", label: "GPT-4.1" },
];

export const IMAGE_MODEL_OPTIONS: ApiModelOption[] = [
  { value: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
  { value: "black-forest-labs/flux-1.1-pro", label: "Flux 1.1 Pro" },
  { value: "google/gemini-2.5-flash-image-preview", label: "Gemini Flash Image" },
];

export const VIDEO_MODEL_OPTIONS: ApiModelOption[] = [
  { value: "bytedance/seedance-2.0", label: "Seedance 2.0" },
  {
    value: "kwaivgi/kling-v3.0-pro",
    label: "Kling v3.0 Pro",
    openRouterBilling: "Video v3.0 Pro",
  },
  { value: "x-ai/grok-imagine-video", label: "Grok Imagine Video" },
  { value: "minimax/video-01", label: "MiniMax Video" },
];

export const TTS_MODEL_OPTIONS: ApiModelOption[] = [
  { value: "hexgrad/kokoro-82m", label: "Kokoro 82M (reliable)" },
  { value: "x-ai/grok-voice-tts-1.0", label: "Grok Voice TTS (expressive)" },
  { value: "google/gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS" },
  { value: "elevenlabs/eleven_multilingual_v2", label: "ElevenLabs Multilingual v2" },
  { value: "elevenlabs/eleven_flash_v2_5", label: "ElevenLabs Flash v2.5 (fast)" },
];

export const GROK_TTS_MODEL = "x-ai/grok-voice-tts-1.0";
export const ELEVENLABS_MULTILINGUAL_MODEL = "elevenlabs/eleven_multilingual_v2";

const VIDEO_MODEL_VALUES = new Set(VIDEO_MODEL_OPTIONS.map((o) => o.value));

function normalizeVideoModel(model: string | null | undefined, fallback: string): string {
  if (!model) return fallback;
  return VIDEO_MODEL_VALUES.has(model) ? model : fallback;
}

export function videoLabelForModel(model: string): string {
  return VIDEO_MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model;
}

export function videoOpenRouterBillingForModel(model: string): string | null {
  return VIDEO_MODEL_OPTIONS.find((o) => o.value === model)?.openRouterBilling ?? null;
}

/** OpenRouter removed older Gemini TTS slugs; remap saved project settings. */
const LEGACY_TTS_MODELS: Record<string, string> = {
  "google/gemini-2.5-flash-preview-tts": "google/gemini-3.1-flash-tts-preview",
  "google/gemini-2.5-flash-tts": "google/gemini-3.1-flash-tts-preview",
};

function normalizeTtsModel(model: string | null | undefined, fallback: string): string {
  if (!model) return fallback;
  return LEGACY_TTS_MODELS[model] ?? model;
}

export const KOKORO_VOICE_OPTIONS: VoiceOption[] = [
  { value: "auto", label: "Auto (from tone)" },
  { value: "af_heart", label: "Heart (warm F)" },
  { value: "af_nicole", label: "Nicole (calm F)" },
  { value: "af_bella", label: "Bella (energetic F)" },
  { value: "am_michael", label: "Michael (dramatic M)" },
  { value: "am_adam", label: "Adam (narrator M)" },
  { value: "bf_emma", label: "Emma (soft F)" },
  { value: "bm_george", label: "George (deep M)" },
];

/** All 30 prebuilt voices from Google Gemini TTS (gemini-3.1-flash-tts-preview). */
export const GEMINI_VOICE_OPTIONS: VoiceOption[] = [
  { value: "Achernar", label: "Achernar — Soft" },
  { value: "Achird", label: "Achird — Friendly" },
  { value: "Algenib", label: "Algenib — Gravelly" },
  { value: "Algieba", label: "Algieba — Smooth" },
  { value: "Alnilam", label: "Alnilam — Firm" },
  { value: "Aoede", label: "Aoede — Breezy" },
  { value: "Autonoe", label: "Autonoe — Bright" },
  { value: "Callirrhoe", label: "Callirrhoe — Easy-going" },
  { value: "Charon", label: "Charon — Informative" },
  { value: "Despina", label: "Despina — Smooth" },
  { value: "Enceladus", label: "Enceladus — Breathy" },
  { value: "Erinome", label: "Erinome — Clear" },
  { value: "Fenrir", label: "Fenrir — Excitable" },
  { value: "Gacrux", label: "Gacrux — Mature" },
  { value: "Iapetus", label: "Iapetus — Clear" },
  { value: "Kore", label: "Kore — Firm (recommended)" },
  { value: "Laomedeia", label: "Laomedeia — Upbeat" },
  { value: "Leda", label: "Leda — Youthful" },
  { value: "Orus", label: "Orus — Firm" },
  { value: "Puck", label: "Puck — Upbeat" },
  { value: "Pulcherrima", label: "Pulcherrima — Forward" },
  { value: "Rasalgethi", label: "Rasalgethi — Informative" },
  { value: "Sadachbia", label: "Sadachbia — Lively" },
  { value: "Sadaltager", label: "Sadaltager — Knowledgeable" },
  { value: "Schedar", label: "Schedar — Even" },
  { value: "Sulafat", label: "Sulafat — Warm" },
  { value: "Umbriel", label: "Umbriel — Easy-going" },
  { value: "Vindemiatrix", label: "Vindemiatrix — Gentle" },
  { value: "Zephyr", label: "Zephyr — Bright" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi — Casual" },
];

/** Built-in voices for xAI Grok Voice TTS 1.0 (OpenRouter). */
export const GROK_VOICE_OPTIONS: VoiceOption[] = [
  { value: "eve", label: "Eve — Energetic (F)" },
  { value: "ara", label: "Ara — Warm (F)" },
  { value: "rex", label: "Rex — Confident (M)" },
  { value: "sal", label: "Sal — Balanced" },
  { value: "leo", label: "Leo — Authoritative (M)" },
];

/** ElevenLabs voices (premade + account custom). */
export const ELEVENLABS_VOICE_OPTIONS: VoiceOption[] = [
  { value: "Uo9SxBmutmSnfiiXtEVq", label: "Edi Shankar Kowalewski — Custom" },
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — Calm narrator (F)" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Bella — Soft (F)" },
  { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli — Energetic (F)" },
  { value: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — Documentary (F)" },
  { value: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — Warm (F)" },
  { value: "pNInz6obpgDQGcFmaJgB", label: "Adam — Deep narrator (M)" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Storyteller (M)" },
  { value: "ErXwobaYiN019PkySvjV", label: "Antoni — Warm (M)" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — British (M)" },
  { value: "IKne3meq5aSn9XLyUdCD", label: "Charlie — Casual (M)" },
];

export const DEFAULT_GEMINI_TTS_VOICE = "Kore";
export const DEFAULT_GROK_TTS_VOICE = "ara";
export const DEFAULT_ELEVENLABS_VOICE = "Uo9SxBmutmSnfiiXtEVq";

const GEMINI_VOICE_VALUES = new Set(GEMINI_VOICE_OPTIONS.map((o) => o.value));
const KOKORO_VOICE_VALUES = new Set(KOKORO_VOICE_OPTIONS.map((o) => o.value));
const GROK_VOICE_VALUES = new Set(GROK_VOICE_OPTIONS.map((o) => o.value));
const ELEVENLABS_VOICE_VALUES = new Set(ELEVENLABS_VOICE_OPTIONS.map((o) => o.value));

export function getDefaultTtsVoiceForModel(model: string): string {
  if (isGeminiTtsModel(model)) return DEFAULT_GEMINI_TTS_VOICE;
  if (isGrokTtsModel(model)) return DEFAULT_GROK_TTS_VOICE;
  if (isElevenLabsTtsModel(model)) return DEFAULT_ELEVENLABS_VOICE;
  return "auto";
}

function normalizeTtsVoice(model: string, voice: string | null | undefined): string {
  if (isGeminiTtsModel(model)) {
    if (!voice || voice === "auto" || voice === "default" || !GEMINI_VOICE_VALUES.has(voice)) {
      return DEFAULT_GEMINI_TTS_VOICE;
    }
    return voice;
  }
  if (isGrokTtsModel(model)) {
    const normalized = voice?.toLowerCase();
    if (!normalized || normalized === "auto" || !GROK_VOICE_VALUES.has(normalized)) {
      return DEFAULT_GROK_TTS_VOICE;
    }
    return normalized;
  }
  if (isElevenLabsTtsModel(model)) {
    if (!voice || voice === "auto" || !ELEVENLABS_VOICE_VALUES.has(voice)) {
      return DEFAULT_ELEVENLABS_VOICE;
    }
    return voice;
  }
  if (!voice || voice === "default") return "auto";
  if (KOKORO_VOICE_VALUES.has(voice)) return voice;
  return "auto";
}

export function voiceLabelForModel(model: string, voice: string): string {
  const options = voiceOptionsForTtsModel(model);
  return options.find((o) => o.value === voice)?.label ?? voice;
}

export type ProjectApiModels = {
  llmModel: string;
  imageModel: string;
  videoModel: string;
  ttsModel: string;
  ttsVoice: string;
};

export function getDefaultApiModels(): ProjectApiModels {
  const ttsModel = OPENROUTER_MODELS.tts;
  return {
    llmModel: OPENROUTER_MODELS.llm,
    imageModel: OPENROUTER_MODELS.image,
    videoModel: OPENROUTER_MODELS.video,
    ttsModel,
    ttsVoice: getDefaultTtsVoiceForModel(ttsModel),
  };
}

export function resolveProjectApiModels(
  project: Pick<
    Project,
    "llmModel" | "imageModel" | "videoModel" | "ttsModel" | "ttsVoice"
  >,
): ProjectApiModels {
  const defaults = getDefaultApiModels();
  const ttsModel = normalizeTtsModel(project.ttsModel, defaults.ttsModel);
  return {
    llmModel: project.llmModel ?? defaults.llmModel,
    imageModel: project.imageModel ?? defaults.imageModel,
    videoModel: normalizeVideoModel(project.videoModel, defaults.videoModel),
    ttsModel,
    ttsVoice: normalizeTtsVoice(ttsModel, project.ttsVoice),
  };
}

export function isGeminiTtsModel(model: string): boolean {
  return model.includes("gemini") && model.includes("tts");
}

export function isGrokTtsModel(model: string): boolean {
  return model.includes("grok") && model.includes("voice");
}

export function isElevenLabsTtsModel(model: string): boolean {
  return model.startsWith("elevenlabs/");
}

export function voiceOptionsForTtsModel(model: string): VoiceOption[] {
  if (isGeminiTtsModel(model)) return GEMINI_VOICE_OPTIONS;
  if (isGrokTtsModel(model)) return GROK_VOICE_OPTIONS;
  if (isElevenLabsTtsModel(model)) return ELEVENLABS_VOICE_OPTIONS;
  return KOKORO_VOICE_OPTIONS;
}

export const projectApiModelsSchema = z.object({
  llmModel: z.string().min(1).max(120).optional(),
  imageModel: z.string().min(1).max(120).optional(),
  videoModel: z.string().min(1).max(120).optional(),
  ttsModel: z.string().min(1).max(120).optional(),
  ttsVoice: z.string().min(1).max(60).optional(),
});

export function projectApiModelsFromProject(project: Project): ProjectApiModels {
  return resolveProjectApiModels(project);
}
