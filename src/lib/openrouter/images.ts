import { OPENROUTER_MODELS, openRouterFetch, formatOpenRouterError } from "./client";
import {
  imageModelUsesDedicatedImagesApi,
  imageModelUsesTextModality,
  imageModelSupportsPersonReferencePhotos,
  isOpenAiGptImageModel,
} from "@/lib/project-api-models";
import {
  resolveImageGenerationSize,
  type OpenRouterImageSize,
} from "./image-resolution";

export type { OpenRouterImageSize };

export interface ImageGenInput {
  prompt: string;
  aspectRatio?: string;
  imageSize?: OpenRouterImageSize;
  model?: string;
  /** Style, location, editorial references (always sent when provided). */
  referenceImages?: string[];
  /** Avatar / person photos — omitted automatically for GPT Image and similar models. */
  personReferenceImages?: string[];
  /** Put reference images before the text prompt (helps some image models lock identity). */
  referenceImagesFirst?: boolean;
}

export interface ImageGenResult {
  url?: string;
  b64?: string;
}

interface ChatImageMessage {
  content?: string | null | Array<Record<string, unknown>>;
  images?: Array<{
    type?: string;
    image_url?: { url?: string };
    imageUrl?: { url?: string };
  }>;
}

interface ChatImageResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: ChatImageMessage;
  }>;
  error?: { message?: string };
}

interface DedicatedImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
}

function mergeReferenceImages(input: ImageGenInput, model: string): string[] | undefined {
  const envRefs = input.referenceImages ?? [];
  const personRefs = imageModelSupportsPersonReferencePhotos(model)
    ? (input.personReferenceImages ?? [])
    : [];
  const merged = [...envRefs, ...personRefs].filter(Boolean);
  return merged.length > 0 ? merged : undefined;
}

function isImageSexualizationRefusal(text: string): boolean {
  const m = text.toLowerCase();
  return (
    m.includes("sexualized") ||
    m.includes("non-sexual") ||
    m.includes("safer version") ||
    m.includes("i can help with this if")
  );
}

function isImagePersonReferenceRefusal(text: string): boolean {
  const m = text.toLowerCase();
  return m.includes("real person") || m.includes("reference photo");
}

function isImagePolicyRefusal(text: string): boolean {
  const m = text.toLowerCase();
  return (
    isImageSexualizationRefusal(text) ||
    isImagePersonReferenceRefusal(text) ||
    m.includes("can't help") ||
    m.includes("cannot help") ||
    m.includes("refused") ||
    m.includes("policy") ||
    m.includes("blocked this request")
  );
}

/** GPT Image moderation false-alarms on UGC + characters — prepend explicit safety cues on retry. */
const GPT_IMAGE_SAFETY_SUFFIX =
  "\n\nContent safety (required): everyday family-safe scene, fully clothed people, neutral non-sexual documentary context, appropriate for general social media. No nudity, no lingerie, no suggestive poses, no adult or romantic emphasis.";

export function applyGptImageSafetyPrompt(prompt: string): string {
  if (prompt.includes("Content safety (required):")) return prompt;
  return `${prompt.trim()}${GPT_IMAGE_SAFETY_SUFFIX}`;
}

function gptImagePromptForAttempt(input: ImageGenInput, attempt: "normal" | "safe"): ImageGenInput {
  if (!isOpenAiGptImageModel(input.model ?? OPENROUTER_MODELS.image) || attempt === "normal") {
    return input;
  }
  return { ...input, prompt: applyGptImageSafetyPrompt(input.prompt) };
}

function promptLikelyNeedsGptSafetyCue(prompt: string): boolean {
  const m = prompt.toLowerCase();
  return (
    m.includes("ugc") ||
    m.includes("smartphone") ||
    m.includes("main character") ||
    m.includes("user-generated") ||
    m.includes("phone / ugc") ||
    m.includes("of / sexy")
  );
}

function contentPreviewFromMessage(message?: ChatImageMessage): string {
  if (!message?.content) return "";
  if (typeof message.content === "string") return message.content.slice(0, 240);
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join(" ")
      .slice(0, 240);
  }
  return "";
}

function extractImageUrlFromChatMessage(message?: ChatImageMessage): string | null {
  if (!message) return null;

  const direct =
    message.images?.[0]?.image_url?.url ?? message.images?.[0]?.imageUrl?.url ?? null;
  if (direct) return direct;

  const content = message.content;
  if (typeof content === "string") {
    const match = content.match(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/i);
    return match?.[0] ?? null;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      const url =
        (part.image_url as { url?: string } | undefined)?.url ??
        (part.imageUrl as { url?: string } | undefined)?.url;
      if (typeof url === "string" && url.length > 0) return url;
    }
  }

  return null;
}

function formatMissingImageError(
  model: string,
  contentPreview?: string,
  finishReason?: string,
): string {
  if (contentPreview && isOpenAiGptImageModel(model)) {
    if (isImageSexualizationRefusal(contentPreview)) {
      return (
        "GPT Image flagged this scene as suggestive (common false alarm with Phone/UGC style + characters). " +
        "Switch to Seedream or Gemini, or simplify the visual prompt."
      );
    }
    if (isImagePersonReferenceRefusal(contentPreview)) {
      return (
        "GPT Image blocked reference photos of real people (avatars). " +
        "Use Seedream, Gemini, or Flux for character likeness."
      );
    }
  }
  if (contentPreview && isImagePolicyRefusal(contentPreview)) {
    return `Image model refused the prompt: ${contentPreview.slice(0, 200).trim()}`;
  }
  if (isOpenAiGptImageModel(model)) {
    return (
      "GPT Image returned no image (moderation or unsupported prompt). " +
      "Try Seedream or Gemini for character keyframes."
    );
  }
  const hint = imageModelUsesDedicatedImagesApi(model)
    ? ""
    : " The model may have refused the prompt or returned text only.";
  const reasonHint = finishReason && finishReason !== "stop" ? ` Finish reason: ${finishReason}.` : "";
  return `No image returned from ${model}.${reasonHint}${hint}${
    contentPreview ? ` Model said: "${contentPreview.slice(0, 120)}"` : ""
  }`;
}

function imageResultFromUrl(url: string): ImageGenResult {
  if (url.startsWith("data:")) {
    const b64 = url.split(",", 2)[1] ?? "";
    return { b64 };
  }
  return { url };
}

async function generateImageViaDedicatedApi(
  input: ImageGenInput,
  referenceImages?: string[],
): Promise<ImageGenResult> {
  const model = input.model ?? OPENROUTER_MODELS.image;
  const imageSize = resolveImageGenerationSize(model, input.imageSize);
  const refs = referenceImages ?? mergeReferenceImages(input, model);
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
  };
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  body.resolution = imageSize;
  if (refs?.length) {
    body.input_references = refs.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
  }

  const res = await openRouterFetch("/images", { method: "POST", json: body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatOpenRouterError(res.status, text));
  }
  const json = (await res.json()) as DedicatedImageResponse;
  if (json.error?.message) throw new Error(`Image error: ${json.error.message}`);

  const first = json.data?.[0];
  if (first?.b64_json) return { b64: first.b64_json };
  if (first?.url) return { url: first.url };
  throw new Error(formatMissingImageError(model));
}

async function generateImageViaChatCompletions(
  input: ImageGenInput,
  referenceImages?: string[],
): Promise<ImageGenResult> {
  const model = input.model ?? OPENROUTER_MODELS.image;
  const imageSize = resolveImageGenerationSize(model, input.imageSize);
  const refs = referenceImages ?? mergeReferenceImages(input, model);
  let userContent: unknown = input.prompt;
  if (refs && refs.length > 0) {
    const imageParts = refs.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
    userContent = input.referenceImagesFirst
      ? [...imageParts, { type: "text", text: input.prompt }]
      : [{ type: "text", text: input.prompt }, ...imageParts];
  }
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: userContent }],
    modalities: imageModelUsesTextModality(model) ? ["image", "text"] : ["image"],
    stream: false,
  };
  const image_config: Record<string, unknown> = {};
  if (input.aspectRatio) image_config.aspect_ratio = input.aspectRatio;
  image_config.image_size = imageSize;
  body.image_config = image_config;

  const res = await openRouterFetch("/chat/completions", { method: "POST", json: body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatOpenRouterError(res.status, text));
  }
  const json = (await res.json()) as ChatImageResponse;
  if (json.error?.message) throw new Error(`Image error: ${json.error.message}`);

  const choice = json.choices?.[0];
  const msg = choice?.message;
  const first = extractImageUrlFromChatMessage(msg);
  if (!first) {
    throw new Error(
      formatMissingImageError(model, contentPreviewFromMessage(msg), choice?.finish_reason),
    );
  }
  return imageResultFromUrl(first);
}

function shouldRetryWithoutReferences(err: unknown, hadReferences: boolean): boolean {
  if (!hadReferences || !(err instanceof Error)) return false;
  return (
    err.message.includes("No image returned") ||
    err.message.includes("blocked this request") ||
    err.message.includes("flagged this scene") ||
    isImagePolicyRefusal(err.message)
  );
}

function finalizeGptImageError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err));
  if (isImageSexualizationRefusal(err.message)) {
    return new Error(
      "GPT Image blocked this scene even after family-safe retries (Phone/UGC + characters often trigger this). " +
        "Use Seedream or Gemini for this keyframe.",
    );
  }
  return err;
}

async function runGptImageAttempts(input: ImageGenInput): Promise<ImageGenResult> {
  const model = input.model ?? OPENROUTER_MODELS.image;
  const referenceImages = mergeReferenceImages(input, model);
  const safeInput = gptImagePromptForAttempt(input, "safe");
  const firstInput = promptLikelyNeedsGptSafetyCue(input.prompt) ? safeInput : input;

  const steps: Array<{ input: ImageGenInput; refs: string[] | undefined; useChat: boolean }> = [
    { input: firstInput, refs: referenceImages, useChat: false },
    { input: firstInput, refs: [], useChat: false },
  ];
  if (safeInput.prompt !== firstInput.prompt) {
    steps.push({ input: safeInput, refs: [], useChat: false });
  }
  steps.push({ input: safeInput, refs: [], useChat: true });

  let lastErr: unknown;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      return step.useChat
        ? await generateImageViaChatCompletions(step.input, step.refs)
        : await generateImageViaDedicatedApi(step.input, step.refs);
    } catch (err) {
      lastErr = err;
      if (i < steps.length - 1) {
        console.warn(`[image] ${model} GPT attempt ${i + 1}/${steps.length} failed`);
      }
    }
  }
  throw finalizeGptImageError(lastErr);
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const model = input.model ?? OPENROUTER_MODELS.image;
  const imageSize = resolveImageGenerationSize(model, input.imageSize);
  const referenceImages = mergeReferenceImages(input, model);
  const personRefCount = input.personReferenceImages?.length ?? 0;
  if (personRefCount > 0 && !imageModelSupportsPersonReferencePhotos(model)) {
    console.warn(
      `[image] ${model} ignores ${personRefCount} person reference photo(s) — using text description only`,
    );
  }
  console.info(
    `[image] model=${model} size=${imageSize} refs=${referenceImages?.length ?? 0} ` +
      `via=${imageModelUsesDedicatedImagesApi(model) ? "images" : "chat"}`,
  );

  if (isOpenAiGptImageModel(model)) {
    return runGptImageAttempts(input);
  }

  const hadReferences = Boolean(referenceImages?.length);

  if (imageModelUsesDedicatedImagesApi(model)) {
    try {
      return await generateImageViaDedicatedApi(input, referenceImages);
    } catch (err) {
      if (shouldRetryWithoutReferences(err, hadReferences)) {
        console.warn(`[image] ${model} failed with references — retrying prompt-only via /images`);
        return generateImageViaDedicatedApi(input, []);
      }
      throw err;
    }
  }

  try {
    return await generateImageViaChatCompletions(input, referenceImages);
  } catch (err) {
    if (shouldRetryWithoutReferences(err, hadReferences)) {
      console.warn(`[image] ${model} refused with references — retrying prompt-only`);
      return generateImageViaChatCompletions(input, []);
    }
    throw err;
  }
}
