export const NARRATION_SPEED_OPTIONS = [
  { id: "slow", label: "Slow", speed: 0.85 },
  { id: "normal", label: "Normal", speed: 1.0 },
  { id: "fast", label: "Fast", speed: 1.15 },
  { id: "faster", label: "Very fast", speed: 1.25 },
] as const;

export type NarrationSpeedId = (typeof NARRATION_SPEED_OPTIONS)[number]["id"];

const MIN_TTS_SPEED = 0.75;
const MAX_TTS_SPEED = 1.35;

export function normalizeTtsSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "1"));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, Math.round(n * 100) / 100));
}

export function narrationSpeedIdForValue(speed: number): NarrationSpeedId {
  let best: NarrationSpeedId = "normal";
  let bestDelta = Infinity;
  for (const opt of NARRATION_SPEED_OPTIONS) {
    const delta = Math.abs(opt.speed - speed);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = opt.id;
    }
  }
  return best;
}

export function ttsSpeedForId(id: string | null | undefined): number {
  const found = NARRATION_SPEED_OPTIONS.find((o) => o.id === id);
  return found?.speed ?? 1;
}

export function narrationSpeedLabel(speed: number): string {
  const id = narrationSpeedIdForValue(normalizeTtsSpeed(speed));
  return NARRATION_SPEED_OPTIONS.find((o) => o.id === id)?.label ?? "Normal";
}
