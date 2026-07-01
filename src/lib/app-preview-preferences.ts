import {
  DEFAULT_PLATFORM_PREVIEW,
  isPreviewMode,
  type PlatformPreviewDefaults,
  type PreviewMode,
} from "@/lib/preview-settings";

export const PLATFORM_PREVIEW_MODE_KEY = "imagine-preview-default-mode";
export const PLATFORM_PREVIEW_WARMUP_KEY = "imagine-preview-warmup-enabled";
export const PLATFORM_PREVIEW_PREFS_EVENT = "imagine-preview-prefs-changed";

export function loadPlatformPreviewDefaults(): PlatformPreviewDefaults {
  if (typeof window === "undefined") return DEFAULT_PLATFORM_PREVIEW;
  try {
    const modeRaw = window.localStorage.getItem(PLATFORM_PREVIEW_MODE_KEY);
    const warmupRaw = window.localStorage.getItem(PLATFORM_PREVIEW_WARMUP_KEY);
    return {
      mode: isPreviewMode(modeRaw) ? modeRaw : DEFAULT_PLATFORM_PREVIEW.mode,
      warmupEnabled:
        warmupRaw === null ? DEFAULT_PLATFORM_PREVIEW.warmupEnabled : warmupRaw === "1",
    };
  } catch {
    return DEFAULT_PLATFORM_PREVIEW;
  }
}

export function savePlatformPreviewDefaults(prefs: PlatformPreviewDefaults): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLATFORM_PREVIEW_MODE_KEY, prefs.mode);
    window.localStorage.setItem(
      PLATFORM_PREVIEW_WARMUP_KEY,
      prefs.warmupEnabled ? "1" : "0",
    );
    window.dispatchEvent(new CustomEvent(PLATFORM_PREVIEW_PREFS_EVENT));
  } catch {
    // ignore quota / private mode
  }
}

export function savePlatformPreviewMode(mode: PreviewMode): void {
  savePlatformPreviewDefaults({
    ...loadPlatformPreviewDefaults(),
    mode,
  });
}

export function savePlatformPreviewWarmup(enabled: boolean): void {
  savePlatformPreviewDefaults({
    ...loadPlatformPreviewDefaults(),
    warmupEnabled: enabled,
  });
}
