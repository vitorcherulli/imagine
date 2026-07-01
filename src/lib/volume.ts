/** Clamp 0–100 and convert to Web Audio / ffmpeg gain 0–1 */
import { MUSIC_SWELL_VOLUME_MULTIPLIER } from "@/lib/music-swell";

export { MUSIC_SWELL_VOLUME_MULTIPLIER } from "@/lib/music-swell";

/** Coerce UI/DB percent to a finite 0–100 value. */
export function sanitizePercent(
  percent: number | null | undefined,
  fallback: number,
): number {
  const n = Number(percent);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

/** Finite ffmpeg/Web Audio gain in 0–1. */
export function sanitizeGain(gain: number): number {
  const n = Number(gain);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function percentToGain(percent: number): number {
  return sanitizeGain(sanitizePercent(percent, 100) / 100);
}

export function effectiveNarrationGain(opts: {
  blockVolume?: number | null;
  trackVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const block = percentToGain(sanitizePercent(opts.blockVolume, 100));
  const track = percentToGain(sanitizePercent(opts.trackVolume, 100));
  const master = percentToGain(sanitizePercent(opts.masterVolume, 100));
  return sanitizeGain(block * track * master);
}

export function effectiveMusicGain(opts: {
  musicVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const music = percentToGain(sanitizePercent(opts.musicVolume, 30));
  const master = percentToGain(sanitizePercent(opts.masterVolume, 100));
  return sanitizeGain(music * master);
}

export function effectiveMusicGainForBlock(opts: {
  musicVolume?: number | null;
  masterVolume?: number | null;
  musicSwell?: boolean;
}): number {
  const base = effectiveMusicGain(opts);
  if (!opts.musicSwell) return base;
  return sanitizeGain(base * MUSIC_SWELL_VOLUME_MULTIPLIER);
}

export function effectiveMusicGainAtTime(opts: {
  musicVolume?: number | null;
  masterVolume?: number | null;
  swellMultiplier?: number;
}): number {
  const base = effectiveMusicGain(opts);
  const mult = Number.isFinite(Number(opts.swellMultiplier))
    ? Number(opts.swellMultiplier)
    : 1;
  return sanitizeGain(base * mult);
}

export function effectiveSceneGain(opts: {
  blockVolume?: number | null;
  trackVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const block = percentToGain(sanitizePercent(opts.blockVolume, 60));
  const track = percentToGain(sanitizePercent(opts.trackVolume, 60));
  const master = percentToGain(sanitizePercent(opts.masterVolume, 100));
  return sanitizeGain(block * track * master);
}

/** Build an ffmpeg volume filter — never emits NaN. */
export function ffmpegVolumeFilter(
  gainStart: number,
  gainEnd: number,
  segmentDurationSeconds: number,
): string {
  const start = sanitizeGain(gainStart);
  const end = sanitizeGain(gainEnd);
  const dur =
    Number.isFinite(segmentDurationSeconds) && segmentDurationSeconds > 0.05
      ? segmentDurationSeconds
      : 0;
  if (dur <= 0.05 || Math.abs(start - end) <= 0.0005) {
    return `volume=${start.toFixed(4)}`;
  }
  return `volume=volume='${start.toFixed(6)}+(${end.toFixed(6)}-${start.toFixed(6)})*t/${dur.toFixed(6)}'`;
}
