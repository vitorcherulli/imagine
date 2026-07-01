/** Video shorter than block → preview/export loops the clip. */
export const VIDEO_SHORT_LOOP_TOLERANCE_SEC = 0.25;

/** Max stretch via slow motion (e.g. 7s → 14s). Beyond this, loop is safer. */
export const MAX_VIDEO_SLOW_MOTION_STRETCH = 2;

export type VideoRefitMode = "loop" | "slow";

export interface BlockVideoDurationAlert {
  blockId: string;
  sourceDurationSec: number;
  blockDurationSec: number;
}

export function videoStretchRatio(sourceDurationSec: number, blockDurationSec: number): number {
  if (sourceDurationSec <= 0) return 1;
  return blockDurationSec / sourceDurationSec;
}

export function canStretchVideoWithSlowMotion(
  sourceDurationSec: number,
  blockDurationSec: number,
): boolean {
  if (!videoNeedsLoopForBlock(sourceDurationSec, blockDurationSec)) return false;
  return videoStretchRatio(sourceDurationSec, blockDurationSec) <= MAX_VIDEO_SLOW_MOTION_STRETCH;
}

export function slowMotionSpeedLabel(sourceDurationSec: number, blockDurationSec: number): string {
  const ratio = videoStretchRatio(sourceDurationSec, blockDurationSec);
  const speed = 1 / ratio;
  return `${(speed * 100).toFixed(0)}%`;
}

export function videoNeedsLoopForBlock(
  sourceDurationSec: number,
  blockDurationSec: number,
): boolean {
  if (!Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0) return false;
  if (!Number.isFinite(blockDurationSec) || blockDurationSec <= 0) return false;
  return sourceDurationSec + VIDEO_SHORT_LOOP_TOLERANCE_SEC < blockDurationSec;
}

export function formatVideoShortLabel(alert: BlockVideoDurationAlert): string {
  return `Vídeo ${alert.sourceDurationSec.toFixed(1)}s · bloco ${alert.blockDurationSec.toFixed(1)}s — repete em loop`;
}

export function videoShortTooltip(alert: BlockVideoDurationAlert): string {
  const slowOk = canStretchVideoWithSlowMotion(alert.sourceDurationSec, alert.blockDurationSec);
  return [
    `Clip de ${alert.sourceDurationSec.toFixed(1)}s para um bloco de ${alert.blockDurationSec.toFixed(1)}s.`,
    "Na preview o vídeo repete (loop) até a narração terminar.",
    slowOk
      ? `Use câmera lenta (~${slowMotionSpeedLabel(alert.sourceDurationSec, alert.blockDurationSec)}) no painel do bloco, repita em loop, encurte o bloco ou importe um clip mais longo.`
      : "Estenda o vídeo (loop) no painel do bloco, encurte o bloco ou importe um clip mais longo.",
  ].join(" ");
}
