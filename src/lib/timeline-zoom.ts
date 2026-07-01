export const TIMELINE_MIN_PX_PER_SECOND = 4;
export const TIMELINE_MAX_PX_PER_SECOND = 120;

export function clampTimelinePxPerSecond(pxPerSecond: number): number {
  return Math.min(
    TIMELINE_MAX_PX_PER_SECOND,
    Math.max(TIMELINE_MIN_PX_PER_SECOND, pxPerSecond),
  );
}

/** Clip width on the timeline — always matches duration × zoom (no min-width drift). */
export function timelineClipWidthPx(
  durationSeconds: number,
  pxPerSecond: number,
): number {
  if (pxPerSecond <= 0 || durationSeconds <= 0) return 1;
  return Math.max(1, durationSeconds * pxPerSecond);
}

/** Scroll up zooms in; scroll down zooms out (Premiere-style, deltaY inverted). */
export function nextTimelinePxPerSecondFromWheel(
  currentPxPerSecond: number,
  deltaY: number,
): number {
  if (deltaY === 0) return currentPxPerSecond;
  const direction = deltaY > 0 ? -1 : 1;
  const step = Math.max(2, Math.round(currentPxPerSecond * 0.12));
  return clampTimelinePxPerSecond(currentPxPerSecond + direction * step);
}

export function scrollLeftForZoomAtCursor(opts: {
  timeAtMouseSeconds: number;
  mouseXInViewport: number;
  pxPerSecond: number;
}): number {
  return Math.max(
    0,
    opts.timeAtMouseSeconds * opts.pxPerSecond - opts.mouseXInViewport,
  );
}
