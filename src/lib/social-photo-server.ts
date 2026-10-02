import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { MediaLibraryAsset, Project, SocialSlide } from "@/lib/db/schema";
import {
  ensureDnaClientGalleryFolder,
  listDnaClientGalleryAssets,
  uploadDnaClientGalleryImage,
} from "@/lib/dna-gallery-server";
import { fitImageBufferToSocialAspect, trimPaintedBorders } from "@/lib/ffmpeg";
import { registerMediaLibraryAsset } from "@/lib/media-library-server";
import { generateImage } from "@/lib/openrouter/images";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { setSocialSlideFields } from "@/lib/publication-server";
import { getSocialAspectRatioSpec, getSocialImageAspectRatio } from "@/lib/social-aspect-ratio";
import { parseSocialSlideArt } from "@/lib/social-art/model";
import {
  deleteMediaByPublicUrl,
  readImageAsDataUrl,
  saveBuffer,
  saveGalleryBuffer,
  withCacheBuster,
} from "@/lib/storage";

function publicationOwnPhotosWhere(userId: string, projectId: string) {
  return and(
    eq(schema.mediaLibraryAssets.userId, userId),
    eq(schema.mediaLibraryAssets.projectId, projectId),
    eq(schema.mediaLibraryAssets.kind, "image"),
    eq(schema.mediaLibraryAssets.source, "upload"),
  );
}

/** Client photos come from the linked DNA's gallery, or from the publication itself without a DNA. */
export async function listClientPhotos(userId: string, project: Project): Promise<MediaLibraryAsset[]> {
  if (project.projectDnaId) return listDnaClientGalleryAssets(userId, project.projectDnaId);
  return db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(publicationOwnPhotosWhere(userId, project.id))
    .orderBy(desc(schema.mediaLibraryAssets.createdAt));
}

/** Moves photos uploaded to a DNA-less publication into the DNA's client gallery. Returns how many moved. */
export async function moveClientPhotosToDna(
  userId: string,
  projectId: string,
  dnaId: string,
): Promise<number> {
  const galleryFolderId = await ensureDnaClientGalleryFolder(userId, dnaId);
  const moved = await db
    .update(schema.mediaLibraryAssets)
    .set({ folderId: galleryFolderId, updatedAt: new Date() })
    .where(publicationOwnPhotosWhere(userId, projectId))
    .returning({ id: schema.mediaLibraryAssets.id });
  return moved.length;
}

export async function addClientPhoto(input: {
  userId: string;
  project: Project;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<MediaLibraryAsset> {
  const { userId, project } = input;
  if (project.projectDnaId) {
    return uploadDnaClientGalleryImage({ ...input, dnaId: project.projectDnaId });
  }
  const ext = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
  const url = withCacheBuster(await saveGalleryBuffer(userId, `${createId()}.${ext}`, input.buffer));
  const asset = await registerMediaLibraryAsset({
    userId,
    url,
    name: input.filename.replace(/\.[^.]+$/, "") || "Client photo",
    mimeType: input.mimeType,
    kind: "image",
    source: "upload",
    projectId: project.id,
  });
  if (!asset) throw new Error("Could not save the photo.");
  return asset;
}

export async function isClientPhotoOf(userId: string, project: Project, assetId: string): Promise<boolean> {
  const photos = await listClientPhotos(userId, project);
  return photos.some((p) => p.id === assetId);
}

export function enhancePrompt(project: Pick<Project, "socialAspectRatio">, slide: Pick<SocialSlide, "art">): string {
  const spec = getSocialAspectRatioSpec(project.socialAspectRatio);
  const art = parseSocialSlideArt(slide.art);
  const textZone = art.layout === "text" ? "" : art.position === "top" ? "upper third" : "lower third";
  return [
    "Professional retouch of the attached photo for an Instagram post.",
    "Keep the same real subject, people, products and place — do not invent new subjects, do not change faces, identities, logos on products or the setting.",
    "Fix exposure and white balance, recover shadows and highlights, remove noise and blur, sharpen details, and give natural, rich, premium colors like a professional photographer's edit.",
    `Recompose it for a ${spec.shortLabel} ${spec.id === "9:16" ? "Story" : "feed"} frame: extend the background naturally where the original is too narrow or cropped, keeping the subject well framed.`,
    textZone ? `Keep the ${textZone} calm and uncluttered so a headline can sit over it.` : "",
    "Photorealistic. No text, no letters, no watermarks, no borders, no frames, no collage.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Retouches a client photo with the image model, saves it to the gallery and uses it as the slide image. */
export async function enhanceClientPhotoForSlide(input: {
  userId: string;
  project: Project;
  slide: SocialSlide;
  asset: MediaLibraryAsset;
}): Promise<void> {
  const { userId, project, slide, asset } = input;
  await setSocialSlideFields(slide.id, { status: "generating", errorMessage: null });
  try {
    const source = await readImageAsDataUrl(asset.url);
    const img = await generateImage({
      prompt: enhancePrompt(project, slide),
      model: resolveProjectApiModels(project).imageModel,
      aspectRatio: getSocialImageAspectRatio(project.socialAspectRatio),
      referenceImages: [source],
      referenceImagesFirst: true,
    });

    let raw: Buffer;
    if (img.b64) {
      raw = Buffer.from(img.b64, "base64");
    } else if (img.url) {
      const res = await fetch(img.url);
      if (!res.ok) throw new Error("Could not download the retouched photo.");
      raw = Buffer.from(await res.arrayBuffer());
    } else {
      throw new Error("The AI returned no image.");
    }

    const framed = await fitImageBufferToSocialAspect(
      { buffer: await trimPaintedBorders(raw), ext: ".png" },
      project.socialAspectRatio,
    );
    const enhanced = await addClientPhoto({
      userId,
      project,
      buffer: framed,
      filename: `${asset.name.replace(/ \(AI\)$/, "")} (AI).png`,
      mimeType: "image/png",
    });

    if (slide.imageUrl) await deleteMediaByPublicUrl(slide.imageUrl);
    const imageUrl = withCacheBuster(await saveBuffer(project.id, slide.id, "slide.png", framed));
    await setSocialSlideFields(slide.id, {
      imageUrl,
      referenceAssetId: enhanced.id,
      status: "ready",
      errorMessage: null,
    });
  } catch (err) {
    await setSocialSlideFields(slide.id, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Photo retouch failed",
    });
  }
}
