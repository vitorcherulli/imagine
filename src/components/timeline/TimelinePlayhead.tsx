"use client";

import * as React from "react";
import {
  runTimelineScrubFollowLoop,
  scrubTimelineAtClientX,
} from "@/lib/timeline-scrub";

interface Props {
  currentTime: number;
  pxPerSecond: number;
  height: number;
  onScrub?: (t: number) => void;
  totalSeconds: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Optional ruler height — drag area covers ruler + small offset below. */
  rulerHeight?: number;
}

const HANDLE_WIDTH = 16;

export function TimelinePlayhead({
  currentTime,
  pxPerSecond,
  height,
  onScrub,
  totalSeconds,
  scrollRef,
  rulerHeight = 24,
}: Props) {
  const handleRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const scrubClientXRef = React.useRef(0);
  const stopFollowRef = React.useRef<(() => void) | null>(null);
  const x = Math.max(0, currentTime * pxPerSecond);

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
    function onUp(e: PointerEvent) {
      dragging.current = false;
      stopFollow();
      handleRef.current?.releasePointerCapture(e.pointerId);
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

  function startDrag(e: React.PointerEvent) {
    if (!onScrub) return;
    if (e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    handleRef.current?.setPointerCapture(e.pointerId);
    scrubClientXRef.current = e.clientX;
    startFollow();
    scrubFromClientX(e.clientX);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div
        className="absolute top-0 w-px bg-sky-400/90 shadow-[0_0_6px_rgba(56,189,248,0.45)]"
        style={{ left: x, height }}
      />

      <div
        ref={handleRef}
        className="pointer-events-auto absolute top-0 z-50 cursor-ew-resize touch-none"
        style={{
          left: x,
          width: HANDLE_WIDTH,
          height: rulerHeight,
          transform: "translateX(-50%)",
        }}
        onPointerDown={startDrag}
        title="Drag to scrub"
      >
        <div className="mx-auto mt-0.5 h-3 w-3.5 rounded-sm bg-sky-400 shadow ring-1 ring-sky-300/50" />
      </div>
    </div>
  );
}
