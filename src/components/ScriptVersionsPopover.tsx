"use client";

import * as React from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scriptVersionSourceLabel, type ScriptVersionMeta } from "@/lib/script-studio";

interface Props {
  currentVersion: number | null;
  versions: ScriptVersionMeta[];
  restoringVersion: number | null;
  onRestore: (version: number) => void;
}

function formatVersionTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ScriptVersionsPopover({
  currentVersion,
  versions,
  restoringVersion,
  onRestore,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!(e.target instanceof Node)) return;
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (currentVersion === null && versions.length === 0) return null;

  const label = currentVersion !== null ? `v${currentVersion}` : "Versions";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-2xs font-medium transition-colors",
          open
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-background text-foreground hover:bg-muted/40",
        )}
        aria-expanded={open}
        title="Script version history"
      >
        <History className="h-3 w-3 shrink-0 opacity-70" />
        <span>{label}</span>
        {versions.length > 0 && (
          <span className="text-muted-foreground font-normal">({versions.length})</span>
        )}
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="text-xs font-semibold">Versions</p>
            <p className="text-2xs text-muted-foreground">
              {versions.length > 0
                ? `${versions.length} saved version${versions.length === 1 ? "" : "s"}`
                : "No versions yet"}
            </p>
          </div>
          <div className="max-h-[min(70vh,420px)] overflow-y-auto p-2">
            {versions.length === 0 ? (
              <p className="text-2xs text-muted-foreground px-1 py-2">
                Versions are created automatically while you edit, and when you generate or paste.
              </p>
            ) : (
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li
                    key={v.version}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-2xs",
                      v.isCurrent
                        ? "border-accent/40 bg-accent/5"
                        : "border-border bg-background",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-semibold">v{v.version}</span>
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">
                            {scriptVersionSourceLabel(v.source)}
                          </Badge>
                          {v.isCurrent && (
                            <Badge variant="accent" className="px-1 py-0 text-[10px]">
                              current
                            </Badge>
                          )}
                        </div>
                        {v.summary && (
                          <p className="mt-0.5 line-clamp-2 text-muted-foreground">{v.summary}</p>
                        )}
                        <p className="mt-0.5 text-muted-foreground">
                          {v.wordCount} words · {formatVersionTime(v.createdAt)}
                        </p>
                      </div>
                      {!v.isCurrent && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0"
                          disabled={restoringVersion !== null}
                          onClick={() => onRestore(v.version)}
                        >
                          {restoringVersion === v.version ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Restore"
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
