import type { StoryBlock } from "@/lib/db/schema";
import { isStoryBlockPause } from "@/lib/script-pause";

/** Minimal block fields for swell timing on the linked (sequential) timeline. */
export type MusicSwellTimelineBlock = Pick<
  StoryBlock,
  "id" | "position" | "durationSeconds" | "narrationGroupId" | "narrativeText"
>;

function blockStartSeconds(
  block: MusicSwellTimelineBlock,
  blocks: MusicSwellTimelineBlock[],
): number {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  let elapsed = 0;
  for (const b of sorted) {
    if (b.id === block.id) return elapsed;
    const dur = Number(b.durationSeconds);
    elapsed += Number.isFinite(dur) && dur > 0 ? dur : 0;
  }
  return elapsed;
}

/** Boost at the peak of a music-moment (pause) block. */
export const MUSIC_SWELL_VOLUME_MULTIPLIER = 2.5;

/** Fade in/out before and after pause blocks (seconds). */
export const MUSIC_SWELL_FADE_SECONDS = 2;

export interface MusicSwellZone {
  /** Includes fade ramps — music starts rising here. */
  fadeStartSeconds: number;
  /** Includes fade ramps — music back to normal here. */
  fadeEndSeconds: number;
  /** Core pause (no narration). */
  pauseStartSeconds: number;
  pauseEndSeconds: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function swellMultiplierForPause(
  globalTime: number,
  pauseStart: number,
  pauseEnd: number,
  fadeSeconds: number,
): number {
  const fadeInStart = pauseStart - fadeSeconds;
  const fadeOutEnd = pauseEnd + fadeSeconds;
  if (globalTime < fadeInStart || globalTime > fadeOutEnd) return 1;

  if (globalTime < pauseStart) {
    const u = smoothstep(fadeInStart, pauseStart, globalTime);
    return 1 + u * (MUSIC_SWELL_VOLUME_MULTIPLIER - 1);
  }
  if (globalTime <= pauseEnd) {
    return MUSIC_SWELL_VOLUME_MULTIPLIER;
  }
  const u = 1 - smoothstep(pauseEnd, fadeOutEnd, globalTime);
  return 1 + u * (MUSIC_SWELL_VOLUME_MULTIPLIER - 1);
}

export function listMusicSwellZones(
  blocks: MusicSwellTimelineBlock[],
  fadeSeconds = MUSIC_SWELL_FADE_SECONDS,
): MusicSwellZone[] {
  const zones: MusicSwellZone[] = [];
  for (const block of blocks) {
    if (!isStoryBlockPause(block)) continue;
    const pauseStart = blockStartSeconds(block, blocks);
    const rawDur = Number(block.durationSeconds);
    const pauseDur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
    const pauseEnd = pauseStart + pauseDur;
    zones.push({
      fadeStartSeconds: Math.max(0, pauseStart - fadeSeconds),
      fadeEndSeconds: pauseEnd + fadeSeconds,
      pauseStartSeconds: pauseStart,
      pauseEndSeconds: pauseEnd,
    });
  }
  return zones;
}

/** Smooth music gain multiplier at a point on the timeline (1 = normal, up to 2.5 at peak). */
export function musicSwellMultiplierAtTime(
  blocks: MusicSwellTimelineBlock[],
  globalTime: number,
  fadeSeconds = MUSIC_SWELL_FADE_SECONDS,
): number {
  let multiplier = 1;
  for (const block of blocks) {
    if (!isStoryBlockPause(block)) continue;
    const pauseStart = blockStartSeconds(block, blocks);
    const rawDur = Number(block.durationSeconds);
    const pauseDur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
    const pauseEnd = pauseStart + pauseDur;
    multiplier = Math.max(
      multiplier,
      swellMultiplierForPause(globalTime, pauseStart, pauseEnd, fadeSeconds),
    );
  }
  return multiplier;
}
