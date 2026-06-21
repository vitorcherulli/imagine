/** Max length for project DNA / episode synopsis text fields */
export const PROJECT_TEXT_MAX = 4000;

export const PROJECT_IDENTITY_LABEL = "Project DNA";
export const PROJECT_IDENTITY_HINT =
  "Select your series or brand identity — who you are, who you speak to, tone, and what ties every video in this line together. Add new DNAs in the library.";

export const EPISODE_TITLE_LABEL = "Video title";
export const EPISODE_STORY_LABEL = "Video synopsis";
export const EPISODE_STORY_HINT =
  "The specific story for this episode — script, hook, and payoff for this video.";

/** Trim and normalize optional project identity for prompts and storage */
export function normalizeProjectIdentity(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function hasProjectIdentity(value: string | null | undefined): boolean {
  return normalizeProjectIdentity(value).length > 0;
}
