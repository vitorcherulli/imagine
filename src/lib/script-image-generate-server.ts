import { createId } from "@paralleldrive/cuid2";
import type { Avatar, Project } from "@/lib/db/schema";
import {
  avatarHintForPrompt,
  avatarReferenceImages,
} from "@/lib/avatar-block";
import { ENGLISH_VISUAL_PROMPT_LINE } from "@/lib/generation-language";
import { generateImage } from "@/lib/openrouter/images";
import { getAspectRatio } from "@/lib/video-format";
import {
  formatStyleBibleForPrompt,
  parseStyleBible,
  type StyleBible,
} from "@/lib/style-bible";
import { loadEditorialReferenceDataUrls } from "@/lib/style-bible-server";
import {
  saveBuffer,
  withCacheBuster,
} from "@/lib/storage";
import { fitImageBufferToVideoFormat } from "@/lib/ffmpeg";
import type { ScriptKeywordImageMatch } from "@/lib/script-studio";
import { uniqueKeywordLabel } from "@/lib/script-studio";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

export function buildScriptParagraphImagePrompt(input: {
  project: Pick<Project, "visualStyle" | "genre" | "storyDescription">;
  paragraphText: string;
  userPrompt?: string;
  bible: StyleBible | null;
  avatarHint?: string;
  hasEditorialReference?: boolean;
}): string {
  const parts: string[] = [];
  const bibleBlock = formatStyleBibleForPrompt(input.bible).trim();
  if (bibleBlock) parts.push(bibleBlock);

  if (input.project.visualStyle?.trim()) {
    parts.push(`Visual style: ${input.project.visualStyle.trim()}.`);
  }
  if (input.project.genre?.trim()) {
    parts.push(`Genre: ${input.project.genre.trim()}.`);
  }
  if (input.project.storyDescription?.trim()) {
    parts.push(`Story context: ${input.project.storyDescription.trim().slice(0, 400)}`);
  }

  parts.push(
    `Narration paragraph this image must illustrate:\n${input.paragraphText.trim().slice(0, 800)}`,
  );

  if (input.userPrompt?.trim()) {
    parts.push(`Specific shot to create: ${input.userPrompt.trim().slice(0, 400)}`);
  } else {
    parts.push(
      "Create one cinematic documentary still — concrete place, subject, lighting and composition that match the paragraph.",
    );
  }

  if (input.avatarHint) parts.push(input.avatarHint.trim());

  if (input.hasEditorialReference) {
    parts.push(
      "Match the reference image color grade, lighting mood and lens character. Do NOT copy its exact layout or geography.",
    );
  } else if (input.bible) {
    parts.push("Keep the editorial line consistent across the film.");
  }

  parts.push(ENGLISH_VISUAL_PROMPT_LINE);
  parts.push("No text, no logos, no watermarks, no collage.");
  return parts.filter(Boolean).join("\n\n");
}

export async function runScriptParagraphImageGenerate(input: {
  project: Project;
  projectId: string;
  speechIndex: number;
  paragraphText: string;
  imageModel: string;
  primaryAvatar: Avatar | null;
  userPrompt?: string;
  existingKeywords?: ScriptKeywordImageMatch[];
}): Promise<ScriptKeywordImageMatch> {
  const bible = parseStyleBible(input.project.styleBible);
  const avatarHint = avatarHintForPrompt(input.primaryAvatar);
  const avatarRefs = (await avatarReferenceImages(input.primaryAvatar)) ?? [];
  const editorialRefs = await loadEditorialReferenceDataUrls(input.project);
  const referenceImages = [...editorialRefs, ...avatarRefs];

  const prompt = buildScriptParagraphImagePrompt({
    project: input.project,
    paragraphText: input.paragraphText,
    userPrompt: input.userPrompt,
    bible,
    avatarHint,
    hasEditorialReference: editorialRefs.length > 0,
  });

  const img = await generateImage({
    prompt,
    model: input.imageModel,
    aspectRatio: getAspectRatio(input.project.videoFormat),
    imageSize: "1K",
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    referenceImagesFirst: referenceImages.length > 0,
  });

  const slug = slugify(input.userPrompt ?? `paragraph-${input.speechIndex + 1}`);
  const filename = `script-ai-p${input.speechIndex + 1}-${slug || createId()}.png`;

  let rawBuffer: Buffer;
  if (img.b64) {
    rawBuffer = Buffer.from(img.b64, "base64");
  } else if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error("Could not download generated image.");
    rawBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("No image data returned from the model.");
  }

  const framed = await fitImageBufferToVideoFormat(
    { buffer: rawBuffer, ext: ".png" },
    input.project.videoFormat,
  );
  const storedUrl = await saveBuffer(input.projectId, null, filename, framed);

  const importedUrl = withCacheBuster(storedUrl);
  const labelBase = input.userPrompt?.trim()
    ? `AI · ${input.userPrompt.trim().slice(0, 36)}`
    : `AI · ¶${input.speechIndex + 1}`;

  return {
    keyword: uniqueKeywordLabel(labelBase, input.existingKeywords ?? []),
    selectedId: null,
    results: [],
    importedUrl,
    importedPreviewUrl: importedUrl,
    importedAt: new Date().toISOString(),
  };
}
