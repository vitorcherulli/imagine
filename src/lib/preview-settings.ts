/** How the in-app timeline preview plays video. Export always uses full `video.mp4`. */
export type PreviewMode = "proxy" | "keyframe" | "full" | "off";

/** Per-project override — `auto` follows platform default. */
export type ProjectPreviewMode = PreviewMode | "auto";

export interface PlatformPreviewDefaults {
  mode: PreviewMode;
  /** Pre-generate low-res proxies while editing (proxy mode only). */
  warmupEnabled: boolean;
}

export interface ResolvedPreviewSettings {
  mode: PreviewMode;
  warmupEnabled: boolean;
  useProxy: boolean;
  playVideo: boolean;
  generateProxy: boolean;
}

/**
 * Default is `full`: the in-player video always plays the original `video.mp4`.
 *
 * NOTE: The `proxy` preview mode (low-res `video_preview.mp4` + client cache +
 * background warmup) is DEPRECATED. Since the player was refactored to always
 * play the full video, the proxy no longer feeds playback — it only added
 * background encoding, storage churn, and stale-cache bugs. The flags below
 * (`useProxy`, `generateProxy`, `warmupEnabled`) are now forced off in
 * {@link resolvePreviewSettings}, so `proxy` behaves like `full`. The enum and
 * code paths are kept for backward compatibility with existing projects.
 */
export const DEFAULT_PLATFORM_PREVIEW: PlatformPreviewDefaults = {
  mode: "full",
  warmupEnabled: false,
};

export const PREVIEW_MODE_OPTIONS: Array<{
  id: PreviewMode;
  label: string;
  description: string;
}> = [
  {
    id: "keyframe",
    label: "Keyframes only",
    description: "Still images in preview — no video decode, best on slow machines.",
  },
  {
    id: "full",
    label: "Full quality",
    description: "Plays the original clip in preview — heavy, but shows exact footage.",
  },
  {
    id: "off",
    label: "Disabled",
    description: "Minimal preview — shows stills only, no video playback.",
  },
];

export const PROJECT_PREVIEW_MODE_OPTIONS: Array<{
  id: ProjectPreviewMode;
  label: string;
  description: string;
}> = [
  {
    id: "auto",
    label: "Platform default",
    description: "Use the default from app Settings.",
  },
  ...PREVIEW_MODE_OPTIONS,
];

export function isPreviewMode(value: string | null | undefined): value is PreviewMode {
  return value === "proxy" || value === "keyframe" || value === "full" || value === "off";
}

export function isProjectPreviewMode(
  value: string | null | undefined,
): value is ProjectPreviewMode {
  return value === "auto" || isPreviewMode(value);
}

export function normalizeProjectPreviewMode(
  value: string | null | undefined,
): ProjectPreviewMode {
  return isProjectPreviewMode(value) ? value : "auto";
}

export function previewModeLabel(mode: PreviewMode | ProjectPreviewMode): string {
  if (mode === "auto") return "Platform default";
  // Deprecated proxy mode now behaves like full quality.
  if (mode === "proxy") return "Full quality";
  return PREVIEW_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export function resolvePreviewSettings(
  projectMode: string | null | undefined,
  platform: PlatformPreviewDefaults = DEFAULT_PLATFORM_PREVIEW,
): ResolvedPreviewSettings {
  const normalized = normalizeProjectPreviewMode(projectMode);
  const mode = normalized === "auto" ? platform.mode : normalized;
  // Proxy preview is deprecated: `proxy` now plays the full video like `full`.
  const playVideo = mode === "proxy" || mode === "full";

  return {
    mode,
    // Proxy/cache/warmup subsystem is deprecated and force-disabled.
    warmupEnabled: false,
    useProxy: false,
    playVideo,
    generateProxy: false,
  };
}

/** Server-side when project is `auto` — platform prefs live in the browser. */
export function serverDefaultPreviewMode(): PreviewMode {
  return DEFAULT_PLATFORM_PREVIEW.mode;
}

/**
 * DEPRECATED: preview proxies are no longer generated. The player always plays
 * the full `video.mp4`, so the low-res proxy added cost and stale-cache bugs
 * without improving playback. Always returns false; kept for call-site stability.
 */
export function shouldGeneratePreviewProxy(
  _projectMode: string | null | undefined,
): boolean {
  return false;
}
