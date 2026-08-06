import { createId } from "@paralleldrive/cuid2";
import type { Scenario } from "@/lib/db/schema";
import { generateImage } from "@/lib/openrouter/images";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";
import { saveScenarioBuffer, readImageAsDataUrl } from "@/lib/storage";
import {
  MAX_SCENARIO_IMAGES,
  normalizeScenarioImages,
  parseScenarioImageUrls,
} from "@/lib/scenario-images";
import { visualStylePromptCue } from "@/lib/project-creative-options";
import { buildScenarioPerspectivePrompt } from "@/lib/scenario-perspective-presets";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function buildScenarioPrompt(input: {
  name: string;
  description?: string | null;
  prompt: string;
  visualStyle?: string | null;
}): string {
  const styleCue = visualStylePromptCue(input.visualStyle);
  const lines = [
    `Establishing environment / location shot: ${input.prompt}.`,
    `Location name: ${input.name}.`,
    input.description?.trim() ? `Location notes: ${input.description.trim()}.` : "",
    styleCue ? `Visual style: ${styleCue}.` : "",
    "Empty scene with NO people, NO characters, NO text, NO logos and NO watermarks.",
    "Wide, well-composed frame that clearly establishes the place, its architecture/landscape, materials, atmosphere and lighting.",
  ];
  return lines.filter(Boolean).join("\n");
}

async function imageResultToBuffer(img: {
  b64?: string | null;
  url?: string | null;
}): Promise<Buffer> {
  if (img.b64) return Buffer.from(img.b64, "base64");
  if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error("Could not download generated image.");
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("No image data in response.");
}

async function persistScenarioImage(
  scenario: Scenario,
  userId: string,
  buffer: Buffer,
  existing: string[],
): Promise<{ imageUrl: string; imageUrls: string[]; primaryImageUrl: string | null }> {
  const filename = `gen_${slugify(scenario.name) || "scene"}_${createId().slice(0, 8)}.png`;
  const imageUrl = await saveScenarioBuffer(userId, scenario.id, filename, buffer);
  const merged = normalizeScenarioImages({
    imageUrls: [...existing, imageUrl],
    primaryImageUrl: scenario.primaryImageUrl,
  });
  return { imageUrl, ...merged };
}

export async function generateScenarioImage(input: {
  userId: string;
  scenario: Scenario;
  prompt: string;
  visualStyle?: string | null;
  imageModel?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}): Promise<{ imageUrl: string; imageUrls: string[]; primaryImageUrl: string | null }> {
  const existing = parseScenarioImageUrls(input.scenario);
  if (existing.length >= MAX_SCENARIO_IMAGES) {
    throw new Error(`Maximum ${MAX_SCENARIO_IMAGES} images. Remove one before generating.`);
  }

  const prompt = buildScenarioPrompt({
    name: input.scenario.name,
    description: input.scenario.description,
    prompt: input.prompt,
    visualStyle: input.visualStyle,
  });

  const img = await generateImage({
    prompt,
    model: input.imageModel?.trim() || OPENROUTER_MODELS.image,
    aspectRatio: input.aspectRatio ?? "16:9",
  });

  const rawBuffer = await imageResultToBuffer(img);
  return persistScenarioImage(input.scenario, input.userId, rawBuffer, existing);
}

/** Generate a NEW camera perspective of the same location using an existing image as reference. */
export async function generateScenarioPerspectiveImage(input: {
  userId: string;
  scenario: Scenario;
  sourceImageUrl: string;
  perspectivePrompt: string;
  visualStyle?: string | null;
  imageModel?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}): Promise<{ imageUrl: string; imageUrls: string[]; primaryImageUrl: string | null }> {
  const existing = parseScenarioImageUrls(input.scenario);
  if (existing.length >= MAX_SCENARIO_IMAGES) {
    throw new Error(`Maximum ${MAX_SCENARIO_IMAGES} images. Remove one before generating.`);
  }
  if (!existing.includes(input.sourceImageUrl)) {
    throw new Error("Source image is not part of this scenario.");
  }

  const referenceImage = await readImageAsDataUrl(input.sourceImageUrl);
  if (!referenceImage) throw new Error("Could not read the source image.");

  const prompt = buildScenarioPerspectivePrompt({
    name: input.scenario.name,
    description: input.scenario.description,
    perspectivePrompt: input.perspectivePrompt,
    styleCue: visualStylePromptCue(input.visualStyle),
  });

  const img = await generateImage({
    prompt,
    model: input.imageModel?.trim() || OPENROUTER_MODELS.image,
    aspectRatio: input.aspectRatio ?? "16:9",
    referenceImages: [referenceImage],
    referenceImagesFirst: true,
  });

  const rawBuffer = await imageResultToBuffer(img);
  return persistScenarioImage(input.scenario, input.userId, rawBuffer, existing);
}
