import {
  buildScriptSegmentMarkers,
  countWords,
  DEFAULT_WORDS_PER_MINUTE,
  estimateNarrationSeconds,
  parseScriptNarrationSegments,
  type ScriptSegmentRole,
} from "./script-studio";

export type DurationBudgetStatus = "ok" | "warn" | "over";

export function targetWordBudget(
  targetSeconds: number,
  wpm: number = DEFAULT_WORDS_PER_MINUTE,
): number {
  if (targetSeconds <= 0) return 0;
  return Math.max(1, Math.round((targetSeconds / 60) * wpm));
}

/** Beat count range for outline-from-brief, scaled to target duration. */
export function targetOutlineBeatRange(targetSeconds: number): { min: number; max: number } {
  if (targetSeconds <= 30) return { min: 4, max: 5 };
  if (targetSeconds <= 60) return { min: 5, max: 7 };
  if (targetSeconds <= 120) return { min: 7, max: 10 };
  if (targetSeconds <= 180) return { min: 9, max: 12 };
  return { min: 10, max: Math.min(18, Math.max(12, Math.round(targetSeconds / 22))) };
}

function budgetStatus(ratio: number): DurationBudgetStatus {
  if (ratio > 1.3) return "over";
  if (ratio > 1.15 || ratio < 0.85) return "warn";
  return "ok";
}

export interface ScriptDurationBudget {
  targetSeconds: number;
  targetWords: number;
  wordCount: number;
  estimatedSpeechSeconds: number;
  /** Speech + pauses + ~12% visual breathing room between beats. */
  estimatedVideoSeconds: number;
  pauseSeconds: number;
  deltaSeconds: number;
  deltaWords: number;
  ratio: number;
  status: DurationBudgetStatus;
}

export function computeScriptDurationBudget(
  script: string,
  targetSeconds: number,
): ScriptDurationBudget {
  const segments = parseScriptNarrationSegments(script);
  const wordCount = segments
    .filter((s) => s.kind === "speech")
    .reduce((n, s) => n + countWords(s.text), 0);
  const pauseSeconds = segments
    .filter((s) => s.kind === "pause")
    .reduce((n, s) => n + s.pauseSeconds, 0);
  const estimatedSpeechSeconds = estimateNarrationSeconds(script);
  const estimatedVideoSeconds = Math.round(estimatedSpeechSeconds * 1.12);
  const targetWords = targetWordBudget(targetSeconds);
  const ratio = targetSeconds > 0 ? estimatedSpeechSeconds / targetSeconds : 0;

  return {
    targetSeconds,
    targetWords,
    wordCount,
    estimatedSpeechSeconds,
    estimatedVideoSeconds,
    pauseSeconds,
    deltaSeconds: estimatedSpeechSeconds - targetSeconds,
    deltaWords: wordCount - targetWords,
    ratio,
    status: targetSeconds > 0 ? budgetStatus(ratio) : "ok",
  };
}

/** Share of target duration allocated per narrative role. */
const ROLE_DURATION_SHARE: Record<Exclude<ScriptSegmentRole, "pause">, number> = {
  intro: 0.2,
  middle: 0.35,
  climax: 0.25,
  cta: 0.2,
};

export interface SegmentBudgetAlert {
  index: number;
  role: ScriptSegmentRole;
  label: string;
  words: number;
  maxWords: number;
  estimatedSeconds: number;
  maxSeconds: number;
  status: DurationBudgetStatus;
}

export function buildSegmentBudgetAlerts(
  script: string,
  targetSeconds: number,
): SegmentBudgetAlert[] {
  if (targetSeconds <= 0) return [];

  const markers = buildScriptSegmentMarkers(script);
  const middleCount = markers.filter((m) => m.role === "middle").length || 1;
  const alerts: SegmentBudgetAlert[] = [];

  markers.forEach((marker, index) => {
    if (marker.role === "pause") {
      const pauseSeconds = parsePauseSecondsFromDisplay(marker.displayText);
      const maxSeconds = Math.max(1, Math.round(targetSeconds * 0.08));
      alerts.push({
        index,
        role: "pause",
        label: marker.label,
        words: 0,
        maxWords: 0,
        estimatedSeconds: pauseSeconds,
        maxSeconds,
        status: pauseSeconds > maxSeconds ? "warn" : "ok",
      });
      return;
    }

    const words = countWords(marker.displayText);
    const estimatedSeconds = Math.max(1, estimateNarrationSeconds(marker.displayText));
    const share =
      marker.role === "middle"
        ? ROLE_DURATION_SHARE.middle / middleCount
        : ROLE_DURATION_SHARE[marker.role];
    const maxSeconds = Math.max(2, Math.round(targetSeconds * share));
    const maxWords = targetWordBudget(maxSeconds);
    const wordRatio = maxWords > 0 ? words / maxWords : 0;
    const secRatio = maxSeconds > 0 ? estimatedSeconds / maxSeconds : 0;
    const ratio = Math.max(wordRatio, secRatio);

    alerts.push({
      index,
      role: marker.role,
      label: marker.label,
      words,
      maxWords,
      estimatedSeconds,
      maxSeconds,
      status: budgetStatus(ratio),
    });
  });

  return alerts;
}

function parsePauseSecondsFromDisplay(text: string): number {
  const tagged = /^\[pause(?:\s+(\d+(?:\.\d+)?)\s*s)?\]$/i.exec(text.trim());
  if (tagged) {
    const raw = tagged[1] ? Number.parseFloat(tagged[1]) : 0.6;
    return Number.isFinite(raw) ? raw : 0.6;
  }
  if (/^-{3,}$/.test(text.trim())) return 0.6;
  return 0.6;
}

export function formatBudgetDelta(seconds: number): string {
  if (seconds === 0) return "on target";
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${Math.round(seconds)}s`;
}

export interface BudgetAlertSummary {
  role: ScriptSegmentRole;
  label: string;
  count: number;
  worst: SegmentBudgetAlert;
  status: DurationBudgetStatus;
}

/** Group over-budget blocks by role (e.g. five "Meio" → one chip). */
export function summarizeBudgetAlerts(alerts: SegmentBudgetAlert[]): BudgetAlertSummary[] {
  const over = alerts.filter((a) => a.status !== "ok");
  const byRole = new Map<ScriptSegmentRole, SegmentBudgetAlert[]>();
  for (const alert of over) {
    const list = byRole.get(alert.role) ?? [];
    list.push(alert);
    byRole.set(alert.role, list);
  }

  return Array.from(byRole.entries()).map(([role, items]) => {
    const worst = items.reduce((acc, item) => {
      const accRatio =
        acc.role === "pause"
          ? acc.estimatedSeconds / acc.maxSeconds
          : acc.words / Math.max(1, acc.maxWords);
      const itemRatio =
        item.role === "pause"
          ? item.estimatedSeconds / item.maxSeconds
          : item.words / Math.max(1, item.maxWords);
      return itemRatio > accRatio ? item : acc;
    });
    return {
      role,
      label: items[0]!.label,
      count: items.length,
      worst,
      status: items.some((i) => i.status === "over") ? "over" : "warn",
    };
  });
}

export function formatBudgetAlertSummary(summary: BudgetAlertSummary): string {
  const { worst, count, label } = summary;
  if (worst.role === "pause") {
    return count > 1
      ? `${label} ×${count} · ${worst.estimatedSeconds}s (max ${worst.maxSeconds}s)`
      : `${label} · ${worst.estimatedSeconds}s (max ${worst.maxSeconds}s)`;
  }
  const detail = `${worst.words}w / ~${worst.maxWords}w max`;
  return count > 1 ? `${label} ×${count} · ${detail}` : `${label} · ${detail}`;
}
