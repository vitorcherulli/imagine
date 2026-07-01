/** Continuous timeline value while dragging — snap only on commit. */
export function previewTimelineSeconds(value: number): number {
  return Math.max(0, value);
}

/** Keep the pointer near the viewport edge while scrubbing or dragging. */
export function autoPanTimelineForPointer(
  scrollEl: HTMLElement,
  clientX: number,
  edgePx = 56,
  maxStepPx = 28,
): void {
  const rect = scrollEl.getBoundingClientRect();
  const x = clientX - rect.left;
  if (x < edgePx) {
    const intensity = 1 - Math.max(0, x) / edgePx;
    scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft - maxStepPx * intensity);
  } else if (x > rect.width - edgePx) {
    const overflow = x - (rect.width - edgePx);
    const intensity = Math.min(1, overflow / edgePx);
    scrollEl.scrollLeft += maxStepPx * intensity;
  }
}
