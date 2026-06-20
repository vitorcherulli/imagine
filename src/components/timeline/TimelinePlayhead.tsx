"use client";

import * as React from "react";

interface Props {
  currentTime: number;
  pxPerSecond: number;
  height: number;
  onScrub?: (t: number) => void;
  totalSeconds: number;
  /** Optional ruler height — drag area covers ruler + small offset below. */
  rulerHeight?: number;
}

const HANDLE_WIDTH = 12;

export function TimelinePlayhead({
  currentTime,
  pxPerSecond,
  height,
  onScrub,
  totalSeconds,
  rulerHeight = 24,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const x = Math.max(0, currentTime * pxPerSecond);

  const scrubFromClientX = React.useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || !onScrub) return;
      const rect = el.getBoundingClientRect();
      const t = Math.min(
        totalSeconds,
        Math.max(0, (clientX - rect.left) / pxPerSecond),
      );
      onScrub(t);
    },
    [onScrub, pxPerSecond, totalSeconds],
  );

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      scrubFromClientX(e.clientX);
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scrubFromClientX]);

  function startDrag(e: React.PointerEvent) {
    if (!onScrub) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    scrubFromClientX(e.clientX);
  }

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40">
      {/* Visual line spans ruler + every track */}
      <div
        className="absolute top-0 w-px bg-sky-400/90"
        style={{ left: x, height }}
      />

      {/* Drag handle — only over ruler area, doesn't block clicks on tracks */}
      <div
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
        <div className="mx-auto mt-1 h-2.5 w-3 rounded-sm bg-sky-400 shadow ring-1 ring-sky-300/50" />
      </div>
    </div>
  );
}
