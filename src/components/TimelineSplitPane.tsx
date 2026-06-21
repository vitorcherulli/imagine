"use client";

import * as React from "react";
import { GripHorizontal } from "lucide-react";
import {
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  readTimelineHeight,
  writeTimelineHeight,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

interface Props {
  top: React.ReactNode;
  bottom: React.ReactNode;
}

export function TimelineSplitPane({ top, bottom }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = React.useState(DEFAULT_TIMELINE_HEIGHT);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    setTimelineHeight(readTimelineHeight());
  }, []);

  const clampHeight = React.useCallback((next: number) => {
    const container = containerRef.current;
    const max = container
      ? Math.max(MIN_TIMELINE_HEIGHT, container.clientHeight - 160)
      : 720;
    return Math.min(max, Math.max(MIN_TIMELINE_HEIGHT, next));
  }, []);

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = clampHeight(rect.bottom - e.clientY);
      setTimelineHeight(next);
    }

    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      setTimelineHeight((current) => {
        writeTimelineHeight(current);
        return current;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampHeight]);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">{top}</div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={timelineHeight}
        onPointerDown={startResize}
        className={cn(
          "group relative z-10 flex h-2 shrink-0 cursor-row-resize items-center justify-center",
          "border-y border-border bg-panel hover:bg-muted/60",
        )}
        title="Drag to resize timeline"
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-muted-foreground" />
      </div>

      <div
        className="flex min-h-0 shrink-0 flex-col overflow-hidden"
        style={{ height: timelineHeight }}
      >
        {bottom}
      </div>
    </div>
  );
}
