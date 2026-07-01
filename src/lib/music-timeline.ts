import type { Project } from "@/lib/db/schema";

export const MUSIC_START_MIN = 0;
export const MUSIC_START_MAX = 600;
export const MUSIC_SPAN_MIN = 1;
export const MUSIC_SPAN_MAX = 600;

export function normalizeMusicStartSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MUSIC_START_MAX, Math.max(MUSIC_START_MIN, n));
}

export function normalizeMusicSpanSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MUSIC_SPAN_MAX, Math.max(MUSIC_SPAN_MIN, n));
}

/** How many seconds of the timeline the music covers (defaults to full video). */
export function effectiveMusicSpanSeconds(
  project: Pick<Project, "musicSpanSeconds">,
  timelineTotalSeconds: number,
): number {
  const custom = normalizeMusicSpanSeconds(project.musicSpanSeconds);
  const timeline = Math.max(0, timelineTotalSeconds);
  if (custom === null) return timeline;
  return Math.min(custom, timeline);
}

export function musicActiveAtTime(
  globalSeconds: number,
  spanSeconds: number,
): boolean {
  return globalSeconds < spanSeconds - 0.02;
}

export function musicFileOffsetAtTime(
  startSeconds: number,
  globalSeconds: number,
  fileDurationSeconds: number | null,
): number {
  const offset = normalizeMusicStartSeconds(startSeconds) + Math.max(0, globalSeconds);
  if (fileDurationSeconds != null && fileDurationSeconds > 0) {
    return offset % fileDurationSeconds;
  }
  return offset;
}
