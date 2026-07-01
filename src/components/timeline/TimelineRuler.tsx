"use client";

import * as React from "react";
import {
  runTimelineScrubFollowLoop,
  scrubTimelineAtClientX,
} from "@/lib/timeline-scrub";

interface Props {
  totalSeconds: number;
  pxPerSecond: number;
  onScrub?: (t: number) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
}

export function TimelineRuler({ totalSeconds, pxPerSecond, onScrub, scrollRef }: Props) {
  const rulerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const scrubClientXRef = React.useRef(0);
  const stopFollowRef = React.useRef<(() => void) | null>(null);
  const width = Math.max(800, Math.ceil(totalSeconds * pxPerSecond));
  const majorEvery = pxPerSecond >= 30 ? 1 : pxPerSecond >= 15 ? 2 : pxPerSecond >= 8 ? 5 : 10;

  const scrubFromClientX = React.useCallback(
    (clientX: number) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl || !onScrub) return;
      scrubClientXRef.current = clientX;
      scrubTimelineAtClientX(clientX, scrollEl, pxPerSecond, totalSeconds, onScrub);
    },
    [onScrub, pxPerSecond, scrollRef, totalSeconds],
  );

  const stopFollow = React.useCallback(() => {
    stopFollowRef.current?.();
    stopFollowRef.current = null;
  }, []);

  const startFollow = React.useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !onScrub) return;
    stopFollow();
    stopFollowRef.current = runTimelineScrubFollowLoop(
      () => scrubClientXRef.current,
      scrollEl,
      pxPerSecond,
      totalSeconds,
      onScrub,
      () => dragging.current,
    );
  }, [onScrub, pxPerSecond, scrollRef, stopFollow, totalSeconds]);

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      scrubFromClientX(e.clientX);
    }
    function onUp() {
      dragging.current = false;
      stopFollow();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopFollow();
    };
  }, [scrubFromClientX, stopFollow]);

  function startScrub(e: React.PointerEvent) {
    if (!onScrub) return;
    if (e.altKey) return;
    e.preventDefault();
    dragging.current = true;
    rulerRef.current?.setPointerCapture(e.pointerId);
    scrubClientXRef.current = e.clientX;
    startFollow();
    scrubFromClientX(e.clientX);
  }

  const ticks: React.ReactElement[] = [];
  for (let s = 0; s <= Math.ceil(totalSeconds); s++) {
    const x = s * pxPerSecond;
    const major = s % majorEvery === 0;
    ticks.push(
      <div key={s} className="absolute top-0 h-full" style={{ left: x }}>
        <div
          className={
            major ? "h-2 w-px bg-timeline-muted/60" : "h-1 w-px bg-timeline-muted/35"
          }
        />
        {major && (
          <div className="absolute left-1 top-2 text-[9px] font-mono text-timeline-muted">
            {formatSec(s)}
          </div>
        )}
      </div>,
    );
  }

  return (
    <div
      ref={rulerRef}
      className={`relative h-6 border-b border-timeline-border bg-timeline-ruler select-none ${
        onScrub ? "cursor-ew-resize" : ""
      }`}
      style={{ width }}
      onPointerDown={startScrub}
    >
      {ticks}
    </div>
  );
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
