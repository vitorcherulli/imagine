import { OPENROUTER_MODELS, openRouterFetch } from "./client";

export interface ImageGenInput {
  prompt: string;
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
  model?: string;
  referenceImages?: string[];
  /** Put reference images before the text prompt (helps some image models lock identity). */
  referenceImagesFirst?: boolean;
}

export interface ImageGenResult {
  url?: string;
  b64?: string;
}

interface ChatImageResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      images?: Array<{
        type?: string;
        image_url?: { url?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const model = input.model ?? OPENROUTER_MODELS.image;
  console.info(`[image] model=${model} refs=${input.referenceImages?.length ?? 0}`);
  let userContent: unknown = input.prompt;
  if (input.referenceImages && input.referenceImages.length > 0) {
    const imageParts = input.referenceImages.map((url) => ({
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
    modalities: ["image"],
    stream: false,
  };
  const image_config: Record<string, unknown> = {};
  if (input.aspectRatio) image_config.aspect_ratio = input.aspectRatio;
  if (input.imageSize) image_config.image_size = input.imageSize;
  if (Object.keys(image_config).length > 0) body.image_config = image_config;

  const res = await openRouterFetch("/chat/completions", { method: "POST", json: body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter image error ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as ChatImageResponse;
  if (json.error?.message) throw new Error(`Image error: ${json.error.message}`);

  const msg = json.choices?.[0]?.message;
  const first = msg?.images?.[0]?.image_url?.url;
  if (!first) {
    throw new Error(
      `No image returned. content="${(msg?.content ?? "").slice(0, 120)}"`,
    );
  }
  if (first.startsWith("data:")) {
    const b64 = first.split(",", 2)[1] ?? "";
    return { b64 };
  }
  return { url: first };
}
