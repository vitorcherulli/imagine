export const TIMELINE_DURATION_MIN = 1;
export const TIMELINE_DURATION_MAX = 60;
export const TIMELINE_DURATION_SNAP = 1;

export function snapTimelineDurationSeconds(
  rawSeconds: number,
  minSeconds: number = TIMELINE_DURATION_MIN,
): number {
  const snapped =
    Math.round(rawSeconds / TIMELINE_DURATION_SNAP) * TIMELINE_DURATION_SNAP;
  const clamped = Math.min(
    TIMELINE_DURATION_MAX,
    Math.max(minSeconds, snapped),
  );
  return Math.round(clamped);
}

export function durationFromResizeDelta(
  startDurationSeconds: number,
  deltaPx: number,
  pxPerSecond: number,
  minSeconds: number = TIMELINE_DURATION_MIN,
  options?: { snap?: boolean },
): number {
  if (pxPerSecond <= 0) return startDurationSeconds;
  const raw = startDurationSeconds + deltaPx / pxPerSecond;
  const clamped = Math.min(
    TIMELINE_DURATION_MAX,
    Math.max(minSeconds, raw),
  );
  if (options?.snap === false) return clamped;
  return snapTimelineDurationSeconds(clamped, minSeconds);
}

/** Split target seconds across N visual cuts (integers summing to target). */
export function distributeVisualCutDurations(
  targetTotalSeconds: number,
  cutCount: number,
): number[] {
  if (cutCount <= 0) return [];
  const target = Math.max(cutCount, Math.round(targetTotalSeconds));
  const base = Math.floor(target / cutCount);
  const remainder = target % cutCount;
  return Array.from({ length: cutCount }, (_, index) => {
    const value = base + (index < remainder ? 1 : 0);
    return Math.max(1, value);
  });
}

export function formatTimelineDuration(seconds: number): string {
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}
