import {
  effectiveMusicSpanSeconds,
  musicActiveAtTime,
  musicFileOffsetAtTime,
  normalizeMusicStartSeconds,
} from "@/lib/music-timeline";
import { defaultMusic2TimelineStartSeconds } from "@/lib/music-duration-mismatch";
import type { Project } from "@/lib/db/schema";

export type ProjectMusicFields = Pick<
  Project,
  | "musicUrl"
  | "musicStartSeconds"
  | "musicSpanSeconds"
  | "music2Url"
  | "music2TimelineStartSeconds"
  | "music2FileStartSeconds"
>;

export interface ResolvedTimelineMusic {
  track: 1 | 2;
  url: string;
  fileOffsetSeconds: number;
  loop: boolean;
}

export function normalizeMusic2TimelineStart(
  value: unknown,
  file1DurationSec: number | null,
  musicStartSeconds: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  if (file1DurationSec != null && file1DurationSec > 0) {
    return defaultMusic2TimelineStartSeconds(
      file1DurationSec,
      normalizeMusicStartSeconds(musicStartSeconds),
    );
  }
  return 0;
}

export function resolveTimelineMusicAtTime(
  project: ProjectMusicFields,
  timelineTotalSeconds: number,
  globalSeconds: number,
  file1DurationSec: number | null,
  file2DurationSec: number | null,
): ResolvedTimelineMusic | null {
  const span = effectiveMusicSpanSeconds(project, timelineTotalSeconds);
  if (!musicActiveAtTime(globalSeconds, span)) return null;

  const music2Url = project.music2Url?.trim();
  const music2Start =
    music2Url && project.music2TimelineStartSeconds != null
      ? Math.max(0, project.music2TimelineStartSeconds)
      : null;

  if (music2Url && music2Start != null && globalSeconds >= music2Start - 0.02) {
    const local = globalSeconds - music2Start;
    const fileStart = normalizeMusicStartSeconds(project.music2FileStartSeconds ?? 0);
    const fileDur = file2DurationSec;
    const offset =
      fileDur != null && fileDur > 0
        ? fileStart + (local % fileDur)
        : fileStart + local;
    return { track: 2, url: music2Url, fileOffsetSeconds: offset, loop: true };
  }

  const musicUrl = project.musicUrl?.trim();
  if (!musicUrl) return null;

  const fileStart = normalizeMusicStartSeconds(project.musicStartSeconds);
  const useLoop = !music2Url;
  const offset = useLoop
    ? musicFileOffsetAtTime(fileStart, globalSeconds, file1DurationSec)
    : fileStart + globalSeconds;
  if (!useLoop && file1DurationSec != null && offset >= file1DurationSec - 0.02) {
    return null;
  }
  return {
    track: 1,
    url: musicUrl,
    fileOffsetSeconds: Math.max(0, offset),
    loop: useLoop,
  };
}
