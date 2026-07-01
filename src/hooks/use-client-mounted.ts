"use client";

import * as React from "react";

/** Avoid SSR/client mismatch for locale-dependent formatting (React #418). */
export function useClientMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
