"use client";

import { cn } from "@/lib/utils";
import {
  computeScriptDurationBudget,
  formatBudgetAlertSummary,
  formatBudgetDelta,
  summarizeBudgetAlerts,
  type DurationBudgetStatus,
  type SegmentBudgetAlert,
} from "@/lib/script-budget";
import { computeScriptStats } from "@/lib/script-studio";

interface Props {
  script: string;
  targetSeconds: number;
  segmentAlerts?: SegmentBudgetAlert[];
  measuredAudioSeconds?: number | null;
  className?: string;
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

const CHIP_CLASS: Record<DurationBudgetStatus, string> = {
  ok: "border-border bg-muted/40 text-muted-foreground",
  warn: "border-warning/40 bg-warning/10 text-warning",
  over: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ScriptDurationBar({
  script,
  targetSeconds,
  segmentAlerts = [],
  measuredAudioSeconds,
  className,
}: Props) {
  const budget = computeScriptDurationBudget(script, targetSeconds);
  const stats = computeScriptStats(script);
  const hasScript = script.trim().length > 0;
  const fillPct =
    targetSeconds > 0
      ? Math.min(100, Math.round((budget.estimatedSpeechSeconds / targetSeconds) * 100))
      : 0;
  const alertSummaries = summarizeBudgetAlerts(segmentAlerts);

  if (targetSeconds <= 0) return null;

  return (
    <div
      className={cn(
        "flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs leading-none",
        className,
      )}
    >
      {hasScript ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="relative h-1 w-14 shrink-0 overflow-hidden rounded-full bg-muted"
              title={`${Math.round(budget.estimatedSpeechSeconds)}s / ${targetSeconds}s`}
            >
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_BAR[budget.status])}
                style={{ width: `${fillPct}%` }}
              />
            </span>
            <span className={cn("font-medium tabular-nums", STATUS_TEXT[budget.status])}>
              ~{Math.round(budget.estimatedSpeechSeconds)}s
            </span>
            <span className={cn("tabular-nums", STATUS_TEXT[budget.status])}>
              {formatBudgetDelta(budget.deltaSeconds)}
            </span>
            <span className="text-muted-foreground">/ {targetSeconds}s</span>
          </span>

          <Sep />

          <span className="tabular-nums text-muted-foreground">
            {stats.words}w · ~{Math.round(budget.estimatedVideoSeconds)}s video
          </span>

          {measuredAudioSeconds != null && measuredAudioSeconds > 0 && (
            <>
              <Sep />
              <span className="tabular-nums text-accent">TTS {Math.round(measuredAudioSeconds)}s</span>
            </>
          )}

          {alertSummaries.length > 0 && (
            <>
              <Sep />
              <span className="inline-flex flex-wrap items-center gap-1">
                {alertSummaries.map((summary) => (
                  <span
                    key={summary.role}
                    title={formatBudgetAlertSummary(summary)}
                    className={cn(
                      "inline-flex max-w-[9rem] truncate rounded border px-1 py-px text-[9px] font-medium leading-tight",
                      CHIP_CLASS[summary.status],
                    )}
                  >
                    {formatBudgetAlertSummary(summary)}
                  </span>
                ))}
              </span>
            </>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">
          Target {targetSeconds}s (~{budget.targetWords}w) · paste or generate a script
        </span>
      )}
    </div>
  );
}

function Sep() {
  return <span className="hidden text-muted-foreground/40 sm:inline">·</span>;
}
