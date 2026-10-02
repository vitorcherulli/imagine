"use client";

import * as React from "react";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

/** Merges patches and PATCHes them to `url` after a pause; flushes on unmount and page leave. */
export function useSocialArtAutosave<T extends object>(
  url: string,
  onSaved?: (data: unknown) => void,
  delayMs = 700,
) {
  const [state, setState] = React.useState<AutosaveState>("idle");
  const pending = React.useRef<Partial<T> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = React.useRef(onSaved);
  savedRef.current = onSaved;

  const flush = React.useCallback(
    async (keepalive = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const body = pending.current;
      if (!body) return;
      pending.current = null;
      setState("saving");
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        setState(pending.current ? "saving" : "saved");
        savedRef.current?.(data);
      } catch {
        pending.current = Object.assign({}, body, pending.current);
        setState("error");
      }
    },
    [url],
  );

  const schedule = React.useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush, delayMs],
  );

  React.useEffect(() => {
    const onLeave = () => void flush(true);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      void flush(true);
    };
  }, [flush]);

  return { state, schedule, flush };
}

export function autosaveLabel(state: AutosaveState): string {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved";
  if (state === "error") return "Not saved — retrying on next edit";
  return "";
}
