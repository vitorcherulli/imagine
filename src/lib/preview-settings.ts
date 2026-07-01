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

export const DEFAULT_PLATFORM_PREVIEW: PlatformPreviewDefaults = {
  mode: "proxy",
  warmupEnabled: true,
};

export const PREVIEW_MODE_OPTIONS: Array<{
  id: PreviewMode;
  label: string;
  description: string;
}> = [
  {
    id: "proxy",
    label: "Light proxy",
    description: "360p preview clips — smooth editing, fast export stays full quality.",
  },
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
    description: "Minimal preview — no proxy generation, no video playback.",
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
  return PREVIEW_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export function resolvePreviewSettings(
  projectMode: string | null | undefined,
  platform: PlatformPreviewDefaults = DEFAULT_PLATFORM_PREVIEW,
): ResolvedPreviewSettings {
  const normalized = normalizeProjectPreviewMode(projectMode);
  const mode = normalized === "auto" ? platform.mode : normalized;
  const useProxy = mode === "proxy";
  const playVideo = mode === "proxy" || mode === "full";
  const generateProxy = useProxy;
  const warmupEnabled = useProxy && platform.warmupEnabled;

  return {
    mode,
    warmupEnabled,
    useProxy,
    playVideo,
    generateProxy,
  };
}

/** Server-side when project is `auto` — platform prefs live in the browser. */
export function serverDefaultPreviewMode(): PreviewMode {
  return DEFAULT_PLATFORM_PREVIEW.mode;
}

export function shouldGeneratePreviewProxy(
  projectMode: string | null | undefined,
): boolean {
  const normalized = normalizeProjectPreviewMode(projectMode);
  if (normalized === "auto") return serverDefaultPreviewMode() === "proxy";
  return normalized === "proxy";
}
