import type { Project } from "./db/schema";

export type ProjectContentType = "video" | "social";

export type PostFormat = "carousel" | "single";

export type PostKind =
  | "educational"
  | "list"
  | "quote"
  | "promo"
  | "story"
  | "mixed";

export const POST_KINDS: Array<{ id: PostKind; label: string; hint: string }> = [
  {
    id: "educational",
    label: "Educational",
    hint: "Teach one idea with clear takeaways.",
  },
  {
    id: "list",
    label: "List / tips",
    hint: "Numbered tips, myths, or quick wins.",
  },
  {
    id: "quote",
    label: "Quote / statement",
    hint: "Bold statement with mood imagery.",
  },
  {
    id: "promo",
    label: "Promotional",
    hint: "Offer, launch, or call to action.",
  },
  {
    id: "story",
    label: "Storytelling",
    hint: "Mini narrative arc — optional character.",
  },
  {
    id: "mixed",
    label: "Mixed",
    hint: "Let the AI pick the best structure.",
  },
];

export const POST_FORMATS: Array<{ id: PostFormat; label: string; hint: string }> = [
  { id: "carousel", label: "Carousel", hint: "Multiple slides (3–10)." },
  { id: "single", label: "Single post", hint: "One image + caption." },
];

export function normalizeContentType(value: unknown): ProjectContentType {
  return value === "social" ? "social" : "video";
}

export function isSocialProject(
  project: Pick<Project, "contentType"> | { contentType?: string | null },
): boolean {
  return normalizeContentType(project.contentType) === "social";
}

export function normalizePostFormat(value: unknown): PostFormat {
  return value === "single" ? "single" : "carousel";
}

export function normalizePostKind(value: unknown): PostKind {
  const valid = POST_KINDS.map((k) => k.id);
  return valid.includes(value as PostKind) ? (value as PostKind) : "educational";
}

export function defaultSlideCount(postFormat: PostFormat): number {
  return postFormat === "single" ? 1 : 7;
}

export function clampSlideCount(count: number, postFormat: PostFormat): number {
  if (postFormat === "single") return 1;
  return Math.min(10, Math.max(3, Math.round(count)));
}

export function projectEditorHref(project: Pick<Project, "id" | "contentType">): string {
  return isSocialProject(project) ? `/publications/${project.id}` : `/projects/${project.id}`;
}
