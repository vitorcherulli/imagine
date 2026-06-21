import type { Avatar, Project, StoryBlock } from "@/lib/db/schema";
import { avatarHintForPrompt } from "@/lib/avatar-block";
import {
  finalizeThumbnailImagePrompt,
  type ThumbnailMode,
} from "@/lib/thumbnail-mode";

/** Strip invented hair/face/body descriptions that fight reference photos. */
export function sanitizeCoverScenePrompt(prompt: string, avatarName?: string | null): string {
  let text = prompt.trim();
  if (!text) return text;

  const patterns = [
    /\b(dark|light|blonde|blond|brunette|black|brown|golden|red|auburn|silver|grey|gray|white)[- ]?(haired|hair)\b/gi,
    /\b(long|short|curly|straight|wavy|flowing|silky)\s+hair\b/gi,
    /\b(young|beautiful|stunning|gorgeous|elegant|slender|tall)\s+(woman|man|girl|model|lady)\b/gi,
    /\b(woman|man|girl|model|lady)\s+with\s+[^,.]{0,60}\b(hair|eyes|skin)\b[^,.]*/gi,
    /\bshe\s+has\s+[^,.]{0,80}\b(hair|eyes|skin)\b[^,.]*/gi,
    /\bher\s+(long|short|dark|light|flowing|golden)\s+hair\b/gi,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, "");
  }

  if (avatarName?.trim()) {
    const escaped = avatarName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`\\b${escaped}\\b(,?\\s+(?:a|an|the)?\\s*[^,.]{0,120})?`, "gi"),
      avatarName.trim(),
    );
  }

  return text.replace(/\s{2,}/g, " ").replace(/ ,/g, ",").trim();
}

/** Scene/composition text for cover — avoids relying on stale LLM appearance details. */
export function buildCoverScenePrompt(input: {
  project: Pick<Project, "title" | "storyDescription" | "visualStyle">;
  blocks: Pick<StoryBlock, "visualPrompt" | "narrativeText" | "segmentType">[];
  storedThumbnailPrompt?: string | null;
  avatar?: Pick<Avatar, "name"> | null;
}): string {
  const { project, blocks, storedThumbnailPrompt, avatar } = input;
  const blockHints = blocks
    .slice(0, 4)
    .map((b) => b.visualPrompt?.trim() || b.narrativeText?.trim())
    .filter(Boolean)
    .join(" ");

  const story = project.storyDescription?.trim();
  const sanitizedStored = storedThumbnailPrompt
    ? sanitizeCoverScenePrompt(storedThumbnailPrompt, avatar?.name)
    : "";

  if (sanitizedStored.length > 80) {
    return sanitizedStored;
  }

  const parts = [
    `Cinematic cover for "${project.title}".`,
    story ? `Story mood: ${story.slice(0, 320)}.` : "",
    blockHints ? `Key visuals: ${blockHints.slice(0, 400)}.` : "",
    "Hero composition with strong lighting, clear focal subject, premium short-form cover framing.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Build image prompt with strong identity lock to reference photos. */
export function buildCoverImagePrompt(input: {
  basePrompt: string;
  avatar: Avatar | null;
  visualStyle?: string | null;
  thumbnailMode: ThumbnailMode;
  selectedTitle?: string | null;
}): string {
  const { basePrompt, avatar, visualStyle, thumbnailMode, selectedTitle } = input;
  const styleHint = visualStyle ? `Visual style: ${visualStyle}.` : "";
  const scenePrompt = avatar
    ? sanitizeCoverScenePrompt(basePrompt, avatar.name)
    : basePrompt.trim();
  const parts: string[] = [];

  if (avatar) {
    parts.push(
      "IDENTITY LOCK: The attached reference photo(s) are the ONLY source of truth for the person's face, hair color, hair style, skin tone, age, and body type.",
      `Feature "${avatar.name}" as the sole human subject. Reproduce the EXACT person from the reference photos. Do NOT invent a different face, hair color, or body.`,
    );
    const desc = avatar.description?.trim();
    if (desc) {
      parts.push(
        `Optional styling notes (physical traits still MUST match reference photos): ${desc}.`,
      );
    }
  }

  if (styleHint) parts.push(styleHint);

  if (avatar) {
    parts.push(
      `Scene composition ONLY (lighting, location, pose, wardrobe mood — ignore any person descriptions here; match reference photos for all physical traits): ${scenePrompt}`,
      avatarHintForPrompt(avatar),
    );
  } else {
    parts.push(scenePrompt);
  }

  return finalizeThumbnailImagePrompt(parts.join(" "), thumbnailMode, selectedTitle);
}
