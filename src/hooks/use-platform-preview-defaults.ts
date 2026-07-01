"use client";

import * as React from "react";
import {
  loadPlatformPreviewDefaults,
  PLATFORM_PREVIEW_PREFS_EVENT,
} from "@/lib/app-preview-preferences";
import type { PlatformPreviewDefaults } from "@/lib/preview-settings";

export function usePlatformPreviewDefaults(): PlatformPreviewDefaults {
  const [defaults, setDefaults] = React.useState(loadPlatformPreviewDefaults);

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
