import { autoPanTimelineForPointer } from "@/lib/timeline-interaction";

/** Map a viewport X coordinate to timeline seconds inside a horizontally scrollable lane. */
export function clientXToTimelineSeconds(
  clientX: number,
  scrollEl: HTMLElement,
  pxPerSecond: number,
  totalSeconds: number,
): number {
  const rect = scrollEl.getBoundingClientRect();
  const x = scrollEl.scrollLeft + (clientX - rect.left);
  return Math.min(totalSeconds, Math.max(0, x / pxPerSecond));
}

export function scrubTimelineAtClientX(
  clientX: number,
  scrollEl: HTMLElement,
  pxPerSecond: number,
  totalSeconds: number,
  onScrub: (seconds: number) => void,
): void {
  autoPanTimelineForPointer(scrollEl, clientX);
  onScrub(clientXToTimelineSeconds(clientX, scrollEl, pxPerSecond, totalSeconds));
}

/** Pan the lane while the pointer rests on an edge during an active scrub drag. */
export function runTimelineScrubFollowLoop(
  getClientX: () => number,
  scrollEl: HTMLElement,
  pxPerSecond: number,
  totalSeconds: number,
  onScrub: (seconds: number) => void,
  isActive: () => boolean,
): () => void {
  let frame = 0;
  function tick() {
    if (!isActive()) return;
    const clientX = getClientX();
    scrubTimelineAtClientX(clientX, scrollEl, pxPerSecond, totalSeconds, onScrub);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
