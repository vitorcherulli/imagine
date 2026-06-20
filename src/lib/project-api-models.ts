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
  { value: "hexgrad/kokoro-82m", label: "Kokoro 82M (recommended)" },
  { value: "google/gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS" },
];

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

export const DEFAULT_GEMINI_TTS_VOICE = "Kore";

const GEMINI_VOICE_VALUES = new Set(GEMINI_VOICE_OPTIONS.map((o) => o.value));
const KOKORO_VOICE_VALUES = new Set(KOKORO_VOICE_OPTIONS.map((o) => o.value));

export function getDefaultTtsVoiceForModel(model: string): string {
  return isGeminiTtsModel(model) ? DEFAULT_GEMINI_TTS_VOICE : "auto";
}

function normalizeTtsVoice(model: string, voice: string | null | undefined): string {
  if (isGeminiTtsModel(model)) {
    if (!voice || voice === "auto" || voice === "default" || !GEMINI_VOICE_VALUES.has(voice)) {
      return DEFAULT_GEMINI_TTS_VOICE;
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
    ttsVoice: isGeminiTtsModel(ttsModel) ? DEFAULT_GEMINI_TTS_VOICE : "auto",
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

export function voiceOptionsForTtsModel(model: string): VoiceOption[] {
  return isGeminiTtsModel(model) ? GEMINI_VOICE_OPTIONS : KOKORO_VOICE_OPTIONS;
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
