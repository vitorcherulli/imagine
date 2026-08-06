import type { Project, SocialMetadata, SocialSlide } from "@/lib/db/schema";
import { avatarHintForPrompt, avatarReferenceImages } from "@/lib/avatar-block";
import { generateImage } from "@/lib/openrouter/images";
import { resolveProjectApiModels, imageModelSupportsPersonReferencePhotos } from "@/lib/project-api-models";
import { fetchAvatarById } from "@/lib/avatar-block";
import { buildSlideVisualPrompt } from "@/lib/social-prompts";
import { getSocialImageAspectRatio } from "@/lib/social-aspect-ratio";
import { deleteMediaByPublicUrl, readImageAsDataUrl, saveBuffer, withCacheBuster } from "@/lib/storage";
import { fitImageBufferToSocialAspect } from "@/lib/ffmpeg";
import { setSocialSlideFields } from "@/lib/publication-server";
import { fetchProjectDnaById } from "@/lib/project-dna-server";
import { getOwnedMediaLibraryAsset } from "@/lib/media-library-server";

export async function generateSocialSlideImage(input: {
  project: Project;
  slide: SocialSlide;
}): Promise<string> {
  const { project, slide } = input;
  const models = resolveProjectApiModels(project);

  const dna = project.projectDnaId
    ? await fetchProjectDnaById(project.projectDnaId, project.userId)
    : null;

  let avatar = null;
  if (project.socialUseAvatar && project.avatarId) {
    avatar = await fetchAvatarById(project.avatarId);
  }

  const avatarRefs = avatar ? ((await avatarReferenceImages(avatar)) ?? []) : [];

  let clientRefs: string[] = [];
  if (slide.referenceAssetId) {
    const refAsset = await getOwnedMediaLibraryAsset(slide.referenceAssetId, project.userId);
    if (refAsset?.url) {
      const dataUrl = await readImageAsDataUrl(refAsset.url);
      if (dataUrl) clientRefs = [dataUrl];
    }
  }

  const attachAvatarRefs =
    avatarRefs.length > 0 && imageModelSupportsPersonReferencePhotos(models.imageModel);
  const envRefs = clientRefs;
  const hasRefs = envRefs.length > 0 || avatarRefs.length > 0;

  const prompt = buildSlideVisualPrompt({
    project,
    slide,
    avatarHint: avatar
      ? avatarHintForPrompt(avatar, { referencePhotosAttached: attachAvatarRefs })
      : null,
    dna,
    hasClientReference: clientRefs.length > 0,
  });

  const img = await generateImage({
    prompt,
    model: models.imageModel,
    aspectRatio: getSocialImageAspectRatio(project.socialAspectRatio),
    referenceImages: envRefs.length > 0 ? envRefs : undefined,
    personReferenceImages: avatarRefs.length > 0 ? avatarRefs : undefined,
    referenceImagesFirst: hasRefs,
  });

  let rawBuffer: Buffer;
  if (img.b64) {
    rawBuffer = Buffer.from(img.b64, "base64");
  } else if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error("Could not download generated image.");
    rawBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("No image data in response");
  }

  const framed = await fitImageBufferToSocialAspect(
    { buffer: rawBuffer, ext: ".png" },
    project.socialAspectRatio,
  );

  if (slide.imageUrl) {
    await deleteMediaByPublicUrl(slide.imageUrl);
  }

  const savedUrl = await saveBuffer(project.id, slide.id, "slide.png", framed);
  return withCacheBuster(savedUrl);
}

export async function runSocialSlideImageGeneration(input: {
  project: Project;
  slide: SocialSlide;
}): Promise<void> {
  await setSocialSlideFields(input.slide.id, { status: "generating", errorMessage: null });
  try {
    const url = await generateSocialSlideImage(input);
    await setSocialSlideFields(input.slide.id, {
      imageUrl: url,
      status: "ready",
      errorMessage: null,
    });
  } catch (err) {
    await setSocialSlideFields(input.slide.id, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Image generation failed",
    });
    throw err;
  }
}

export function formatSocialCaptionForExport(metadata: SocialMetadata | null): string {
  if (!metadata?.caption?.trim()) return "";

  const tags = parseHashtags(metadata.hashtags);
  const tagLine = tags.length > 0 ? `\n\n${tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}` : "";
  return `${metadata.caption.trim()}${tagLine}`;
}

function parseHashtags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    }
  } catch {
    // fall through
  }
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
