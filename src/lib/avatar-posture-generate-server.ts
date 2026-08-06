import { createId } from "@paralleldrive/cuid2";
import type { Avatar } from "@/lib/db/schema";
import { avatarReferenceImages } from "@/lib/avatar-block";
import {
  buildAvatarPosturePrompt,
  type AvatarPosturePreset,
} from "@/lib/avatar-posture-presets";
import { generateImage } from "@/lib/openrouter/images";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";
import { imageModelSupportsPersonReferencePhotos } from "@/lib/project-api-models";
import { saveAvatarBuffer } from "@/lib/storage";
import {
  MAX_AVATAR_IMAGES,
  normalizeAvatarImages,
  parseAvatarImageUrls,
} from "@/lib/avatar-images";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export async function generateAvatarPostureImage(input: {
  userId: string;
  avatar: Avatar;
  posture: Pick<AvatarPosturePreset, "id" | "prompt"> | { id: string; prompt: string };
  imageModel?: string;
}): Promise<{ imageUrl: string; imageUrls: string[]; primaryImageUrl: string | null }> {
  const existing = parseAvatarImageUrls(input.avatar);
  if (existing.length >= MAX_AVATAR_IMAGES) {
    throw new Error(`Maximum ${MAX_AVATAR_IMAGES} reference images. Remove one before generating.`);
  }

  const referenceImages = await avatarReferenceImages(input.avatar);
  if (!referenceImages?.length) {
    throw new Error("Upload at least one reference image before generating postures.");
  }

  const model = input.imageModel?.trim() || OPENROUTER_MODELS.image;
  if (!imageModelSupportsPersonReferencePhotos(model)) {
    throw new Error(
      "GPT Image can't generate new poses from reference photos. Choose Seedream, Gemini, or Flux in image settings.",
    );
  }

  const prompt = buildAvatarPosturePrompt({
    avatarName: input.avatar.name,
    avatarDescription: input.avatar.description,
    posturePrompt: input.posture.prompt,
  });

  const img = await generateImage({
    prompt,
    model,
    aspectRatio: "1:1",
    personReferenceImages: referenceImages,
    referenceImagesFirst: true,
  });

  let rawBuffer: Buffer;
  if (img.b64) {
    rawBuffer = Buffer.from(img.b64, "base64");
  } else if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error("Could not download generated image.");
    rawBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("No image data in response.");
  }

  const filename = `gen_${slugify(input.posture.id) || "pose"}_${createId().slice(0, 8)}.png`;
  const imageUrl = await saveAvatarBuffer(input.userId, input.avatar.id, filename, rawBuffer);
  const merged = normalizeAvatarImages({
    imageUrls: [...existing, imageUrl],
    primaryImageUrl: input.avatar.primaryImageUrl,
  });

  return { imageUrl, ...merged };
}
