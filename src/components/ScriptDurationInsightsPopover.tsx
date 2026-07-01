"use client";

import * as React from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeScriptDurationBudget,
  formatBudgetDelta,
  type DurationBudgetStatus,
  type SegmentBudgetAlert,
} from "@/lib/script-budget";
import { ScriptDurationBar } from "@/components/ScriptDurationBar";

interface Props {
  script: string;
  targetSeconds: number;
  segmentAlerts?: SegmentBudgetAlert[];
  measuredAudioSeconds?: number | null;
  showEmphasisLegend?: boolean;
  emphasisIsAi?: boolean;
}

const STATUS_BAR: Record<DurationBudgetStatus, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  over: "bg-destructive",
};

const STATUS_TEXT: Record<DurationBudgetStatus, string> = {
  ok: "text-success",
  warn: "text-warning",
  over: "text-destructive",
};

function EmphasisLegend({ isAi }: { isAi: boolean }) {
  return (
    <p className="text-[10px] leading-snug text-muted-foreground">
      Emphasis marks{isAi ? " (AI)" : " (auto)"}:{" "}
      <span className="underline decoration-wavy decoration-sky-500/80 underline-offset-2">
        hook / question
      </span>
      {" · "}
      <span className="underline decoration-dotted decoration-teal-500/80 underline-offset-2">
        facts
      </span>
      {" · "}
      <span className="underline decoration-wavy decoration-rose-400/80 underline-offset-2">
        emotion
      </span>
      {" · "}
      <span className="underline decoration-wavy decoration-amber-500/80 underline-offset-2">
        landing
      </span>
      {" · "}
      <span className="underline decoration-dashed decoration-accent/70 underline-offset-2">CTA</span>
      {" — hover a mark for delivery hint"}
    </p>
  );
}

export function ScriptDurationInsightsPopover({
  script,
  targetSeconds,
  segmentAlerts = [],
  measuredAudioSeconds,
  showEmphasisLegend = false,
  emphasisIsAi = false,
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

  if (targetSeconds <= 0) return null;

  const hasScript = script.trim().length > 0;
  const budget = computeScriptDurationBudget(script, targetSeconds);
  const fillPct =
    targetSeconds > 0
      ? Math.min(100, Math.round((budget.estimatedSpeechSeconds / targetSeconds) * 100))
      : 0;

  const triggerLabel = hasScript
    ? `~${Math.round(budget.estimatedSpeechSeconds)}s / ${targetSeconds}s`
    : `${targetSeconds}s target`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-6 max-w-[10rem] items-center gap-1 rounded-md border px-2 text-2xs font-medium transition-colors",
          open
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-background text-foreground hover:bg-muted/40",
        )}
        aria-expanded={open}
        title="Script duration budget and segment breakdown"
      >
        <Gauge className="h-3 w-3 shrink-0 opacity-70" />
        {hasScript && (
          <span
            className="relative h-1 w-8 shrink-0 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_BAR[budget.status])}
              style={{ width: `${fillPct}%` }}
            />
          </span>
        )}
        <span className={cn("truncate tabular-nums", hasScript && STATUS_TEXT[budget.status])}>
          {triggerLabel}
        </span>
        {hasScript && (
          <span className={cn("hidden tabular-nums sm:inline", STATUS_TEXT[budget.status])}>
            {formatBudgetDelta(budget.deltaSeconds)}
          </span>
        )}
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),400px)] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="border-b border-border/60 px-3 py-2">
            <p className="text-xs font-semibold">Duration budget</p>
            <p className="text-2xs text-muted-foreground">
              Speech estimate vs target · segment word limits
            </p>
          </div>
          <div className="space-y-2 p-3">
            <ScriptDurationBar
              script={script}
              targetSeconds={targetSeconds}
              segmentAlerts={segmentAlerts}
              measuredAudioSeconds={measuredAudioSeconds}
              className="text-xs leading-snug"
            />
            {showEmphasisLegend && (
              <div className="border-t border-border/60 pt-2">
                <EmphasisLegend isAi={emphasisIsAi} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
