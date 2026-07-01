/** Music file shorter than timeline span → preview/export loops the track. */
export const MUSIC_SHORT_LOOP_TOLERANCE_SEC = 0.25;

export interface MusicDurationAlert {
  fileDurationSec: number;
  timelineSpanSec: number;
}

export function musicNeedsLoopForTimeline(
  fileDurationSec: number,
  timelineSpanSec: number,
): boolean {
  if (!Number.isFinite(fileDurationSec) || fileDurationSec <= 0) return false;
  if (!Number.isFinite(timelineSpanSec) || timelineSpanSec <= 0) return false;
  return fileDurationSec + MUSIC_SHORT_LOOP_TOLERANCE_SEC < timelineSpanSec;
}

export function musicPlayableSeconds(
  fileDurationSec: number,
  fileStartSeconds: number,
): number {
  return Math.max(0, fileDurationSec - Math.max(0, fileStartSeconds));
}

/** Timeline second where track 2 should begin (after track 1 plays once). */
export function defaultMusic2TimelineStartSeconds(
  fileDurationSec: number,
  fileStartSeconds: number,
): number {
  return Math.max(0, musicPlayableSeconds(fileDurationSec, fileStartSeconds));
}

export function formatMusicShortLabel(alert: MusicDurationAlert): string {
  return `Música ${alert.fileDurationSec.toFixed(1)}s · timeline ${alert.timelineSpanSec.toFixed(1)}s — repete em loop`;
}

export function musicShortTooltip(alert: MusicDurationAlert, hasSecondTrack: boolean): string {
  return [
    `Arquivo de ${alert.fileDurationSec.toFixed(1)}s para ${alert.timelineSpanSec.toFixed(1)}s na timeline.`,
    hasSecondTrack
      ? "A 1ª trilha toca uma vez; a 2ª cobre o restante."
      : "Na preview a música repete (loop) até o vídeo terminar.",
    "No painel de música: loop, upload de trilha mais longa, regerar ou adicionar 2ª trilha.",
  ].join(" ");
}
