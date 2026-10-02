import type { Project } from "./db/schema";

export type ProjectContentType = "video" | "social" | "dubbing";

export type PostFormat = "carousel" | "single";

export type PostKind =
  | "educational"
  | "list"
  | "quote"
  | "promo"
  | "product_feature"
  | "problem_solution"
  | "before_after"
  | "testimonial"
  | "comparison"
  | "offer"
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
    id: "product_feature",
    label: "Product / feature",
    hint: "Showcase a product or software feature and the outcome it delivers.",
  },
  {
    id: "problem_solution",
    label: "Problem → solution",
    hint: "Name the pain, agitate it, then present your product as the fix.",
  },
  {
    id: "before_after",
    label: "Before / after",
    hint: "Contrast life or workflow before and after using the product.",
  },
  {
    id: "testimonial",
    label: "Testimonial / social proof",
    hint: "Customer result, review, or case study with concrete numbers.",
  },
  {
    id: "comparison",
    label: "Comparison",
    hint: "Your product vs. the old way or competitors — clear winner.",
  },
  {
    id: "offer",
    label: "Offer / discount",
    hint: "Limited-time deal, free trial, or coupon with urgency and a strong CTA.",
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

export const POST_KIND_IDS = POST_KINDS.map((k) => k.id) as [PostKind, ...PostKind[]];

export const POST_FORMATS: Array<{ id: PostFormat; label: string; hint: string }> = [
  { id: "carousel", label: "Carousel", hint: "Multiple slides (3–10)." },
  { id: "single", label: "Single post", hint: "One image + caption." },
];

export function normalizeContentType(value: unknown): ProjectContentType {
  if (value === "social") return "social";
  if (value === "dubbing") return "dubbing";
  return "video";
}

export function isSocialProject(
  project: Pick<Project, "contentType"> | { contentType?: string | null },
): boolean {
  return normalizeContentType(project.contentType) === "social";
}

export function isDubbingProject(
  project: Pick<Project, "contentType"> | { contentType?: string | null },
): boolean {
  return normalizeContentType(project.contentType) === "dubbing";
}

export function normalizePostFormat(value: unknown): PostFormat {
  return value === "single" ? "single" : "carousel";
}

export function normalizePostKind(value: unknown): PostKind {
  const valid = POST_KINDS.map((k) => k.id);
  return valid.includes(value as PostKind) ? (value as PostKind) : "educational";
}

export function postKindPromptHint(value: unknown): string {
  const kind = normalizePostKind(value);
  return POST_KINDS.find((k) => k.id === kind)?.hint ?? "";
}

export function defaultSlideCount(postFormat: PostFormat): number {
  return postFormat === "single" ? 1 : 7;
}

export function clampSlideCount(count: number, postFormat: PostFormat): number {
  if (postFormat === "single") return 1;
  return Math.min(10, Math.max(3, Math.round(count)));
}

export function projectEditorHref(project: Pick<Project, "id" | "contentType">): string {
  if (isDubbingProject(project)) return `/dubs/${project.id}`;
  if (isSocialProject(project)) return `/publications/${project.id}`;
  return `/projects/${project.id}`;
}
