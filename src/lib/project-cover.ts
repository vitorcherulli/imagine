/** Resolve the best cover image for a project card in the library. */
export function resolveProjectCoverUrl(input: {
  thumbnailUrl?: string | null;
  anchorImageUrl?: string | null;
  keyframeUrl?: string | null;
}): string | null {
  const thumbnail = input.thumbnailUrl?.trim();
  if (thumbnail) return thumbnail;

  const anchor = input.anchorImageUrl?.trim();
  if (anchor) return anchor;

  const keyframe = input.keyframeUrl?.trim();
  if (keyframe) return keyframe;

  return null;
}

export const PROJECT_COVER_SOURCES = [
  {
    id: "thumbnail",
    label: "Reels / thumbnail cover",
    hint: "Generated from Reels cover or Thumbnail in the project header.",
  },
  {
    id: "anchor",
    label: "Editorial reference",
    hint: "Mood image created automatically when generating the story.",
  },
  {
    id: "keyframe",
    label: "First keyframe",
    hint: "First image generated on the timeline when no cover exists yet.",
  },
] as const;
