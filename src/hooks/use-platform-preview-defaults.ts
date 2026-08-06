"use client";

import * as React from "react";
import {
  loadPlatformPreviewDefaults,
  PLATFORM_PREVIEW_PREFS_EVENT,
} from "@/lib/app-preview-preferences";
import { DEFAULT_PLATFORM_PREVIEW, type PlatformPreviewDefaults } from "@/lib/preview-settings";

export function usePlatformPreviewDefaults(): PlatformPreviewDefaults {
  const [defaults, setDefaults] = React.useState(DEFAULT_PLATFORM_PREVIEW);

  React.useEffect(() => {
    function refresh() {
      setDefaults(loadPlatformPreviewDefaults());
    }
    refresh();
    window.addEventListener(PLATFORM_PREVIEW_PREFS_EVENT, refresh);
    return () => window.removeEventListener(PLATFORM_PREVIEW_PREFS_EVENT, refresh);
  }, []);

  return defaults;
}
