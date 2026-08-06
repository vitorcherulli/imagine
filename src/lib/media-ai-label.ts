import {
  imageLabelForModel,
  ttsLabelForModel,
  videoLabelForModel,
} from "@/lib/project-api-models";

/** Stored on story_blocks when media was not AI-generated. */
export const MEDIA_AI_SOURCE = {
  upload: "__upload__",
  import: "__import__",
  gallery: "__gallery__",
  stock: "__stock__",
  extracted: "__extracted__",
} as const;

export type MediaAiKind = "image" | "video" | "tts" | "scene";

const SOURCE_LABELS: Record<string, string> = {
  [MEDIA_AI_SOURCE.upload]: "Upload",
  [MEDIA_AI_SOURCE.import]: "Import",
  [MEDIA_AI_SOURCE.gallery]: "Gallery",
  [MEDIA_AI_SOURCE.stock]: "Stock",
  [MEDIA_AI_SOURCE.extracted]: "From video",
};

function labelForModelSlug(model: string, kind: MediaAiKind): string {
  switch (kind) {
    case "image":
      return imageLabelForModel(model);
    case "video":
      return videoLabelForModel(model);
    case "tts":
      return ttsLabelForModel(model);
    case "scene":
      return videoLabelForModel(model);
  }
}

/** Short badge label for UI (stored slug, project fallback, or import/upload). */
export function mediaAiBadgeLabel(
  stored: string | null | undefined,
  kind: MediaAiKind,
  fallbackModel?: string | null,
): string | null {
  if (stored && SOURCE_LABELS[stored]) return SOURCE_LABELS[stored];
  const model = stored?.trim() || fallbackModel?.trim();
  if (!model) return null;
  return labelForModelSlug(model, kind);
}
