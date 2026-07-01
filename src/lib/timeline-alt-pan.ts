/** Scroll wheel — pan the timeline horizontally (uses deltaY, or deltaX on trackpads). */
export function applyTimelineAltWheelPan(scrollEl: HTMLElement, event: WheelEvent): void {
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (delta === 0) return;
  const maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
  scrollEl.scrollLeft = Math.min(maxScroll, Math.max(0, scrollEl.scrollLeft + delta));
}
