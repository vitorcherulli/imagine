/** Clamp 0–100 and convert to Web Audio / ffmpeg gain 0–1 */
export function percentToGain(percent: number): number {
  return Math.max(0, Math.min(1, percent / 100));
}

export function effectiveNarrationGain(opts: {
  blockVolume?: number | null;
  trackVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const block = percentToGain(opts.blockVolume ?? 100);
  const track = percentToGain(opts.trackVolume ?? 100);
  const master = percentToGain(opts.masterVolume ?? 100);
  return block * track * master;
}

export function effectiveMusicGain(opts: {
  musicVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const music = percentToGain(opts.musicVolume ?? 30);
  const master = percentToGain(opts.masterVolume ?? 100);
  return music * master;
}

export function effectiveSceneGain(opts: {
  blockVolume?: number | null;
  trackVolume?: number | null;
  masterVolume?: number | null;
}): number {
  const block = percentToGain(opts.blockVolume ?? 60);
  const track = percentToGain(opts.trackVolume ?? 60);
  const master = percentToGain(opts.masterVolume ?? 100);
  return block * track * master;
}
