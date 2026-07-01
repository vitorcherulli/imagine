"use client";

import * as React from "react";
import { GripHorizontal } from "lucide-react";
import {
  DEFAULT_FLOATING_PREVIEW_POSITION,
  readFloatingPreviewPosition,
  writeFloatingPreviewPosition,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function FloatingPreview({ children, className }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const [position, setPosition] = React.useState(DEFAULT_FLOATING_PREVIEW_POSITION);
  const positionRef = React.useRef(position);
  positionRef.current = position;

  const clampPosition = React.useCallback((x: number, y: number) => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return { x, y };

    const maxX = Math.max(8, container.clientWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, container.clientHeight - panel.offsetHeight - 8);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    };
  }, []);

  const layoutDefaultPosition = React.useCallback(() => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;

    const stored = positionRef.current;
    const next =
      stored.x < 0
        ? clampPosition(container.clientWidth - panel.offsetWidth - 12, stored.y)
        : clampPosition(stored.x, stored.y);

    positionRef.current = next;
    setPosition(next);
    writeFloatingPreviewPosition(next);
  }, [clampPosition]);

  React.useLayoutEffect(() => {
    const stored = readFloatingPreviewPosition();
    positionRef.current = stored;
    setPosition(stored);
    layoutDefaultPosition();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => layoutDefaultPosition());
    observer.observe(container);
    return () => observer.disconnect();
  }, [layoutDefaultPosition]);

  React.useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!dragRef.current.active) return;
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      const next = clampPosition(
        dragRef.current.originX + deltaX,
        dragRef.current.originY + deltaY,
      );
      positionRef.current = next;
      setPosition(next);
    }

    function onUp() {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      writeFloatingPreviewPosition(positionRef.current);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampPosition]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30">
      <div
        ref={panelRef}
        className={cn(
          "pointer-events-auto absolute overflow-hidden rounded-lg border border-border bg-background shadow-xl",
          className,
        )}
        style={{ left: position.x, top: position.y }}
      >
        <div
          role="button"
          tabIndex={0}
          onPointerDown={startDrag}
          className="flex h-6 cursor-grab items-center gap-1.5 border-b border-border bg-panel/95 px-2 text-[10px] text-muted-foreground active:cursor-grabbing"
          title="Drag preview"
        >
          <GripHorizontal className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium uppercase tracking-wide">Preview</span>
        </div>
        <div className="bg-black">{children}</div>
      </div>
    </div>
  );
}
