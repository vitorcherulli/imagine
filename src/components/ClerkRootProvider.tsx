"use client";

import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";

/** Clerk auth context — dynamic + Suspense avoids SSR/client markup drift (#418). */
export function ClerkRootProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ClerkProvider dynamic>{children}</ClerkProvider>
    </Suspense>
  );
}
