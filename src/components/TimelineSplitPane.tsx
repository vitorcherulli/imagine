"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, GripHorizontal, Pin, PictureInPicture2, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingPreview } from "@/components/FloatingPreview";
import {
  computeResponsiveTimelineHeight,
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  MIN_PREVIEW_RESERVE,
  readPreviewFloating,
  readTimelineCollapsed,
  readTimelineHeight,
  readTimelineLayoutMode,
  TIMELINE_COLLAPSED_HEIGHT,
  type TimelineLayoutMode,
  writePreviewFloating,
  writeTimelineCollapsed,
  writeTimelineHeight,
  writeTimelineLayoutMode,
} from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";

interface TimelineLayoutContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export const TimelineLayoutContext = React.createContext<TimelineLayoutContextValue | null>(
  null,
);

export function useTimelineLayout() {
  return React.useContext(TimelineLayoutContext);
}

interface Props {
  top: React.ReactNode;
  bottom: React.ReactNode;
  /** Rendered inside the draggable floating panel when floating preview is on. */
  floatingPreview?: React.ReactNode;
  previewFloating?: boolean;
  onPreviewFloatingChange?: (floating: boolean) => void;
  /** Minimum vertical space reserved for preview + project panel (responsive mode). */
  minPreviewReserve?: number;
}

export function TimelineSplitPane({
  top,
  bottom,
  floatingPreview,
  previewFloating: previewFloatingProp,
  onPreviewFloatingChange,
  minPreviewReserve = MIN_PREVIEW_RESERVE,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = React.useState(DEFAULT_TIMELINE_HEIGHT);
  const [layoutMode, setLayoutMode] = React.useState<TimelineLayoutMode>("responsive");
  const [collapsed, setCollapsed] = React.useState(false);
  const [previewFloatingInternal, setPreviewFloatingInternal] = React.useState(false);
  const previewFloating = previewFloatingProp ?? previewFloatingInternal;
  const [prefsReady, setPrefsReady] = React.useState(false);
  const dragging = React.useRef(false);
  const layoutModeRef = React.useRef(layoutMode);
  const collapsedRef = React.useRef(collapsed);
  const timelineHeightRef = React.useRef(timelineHeight);
  const pinnedHeightRef = React.useRef(DEFAULT_TIMELINE_HEIGHT);
  const previewFloatingRef = React.useRef(previewFloating);
  layoutModeRef.current = layoutMode;
  collapsedRef.current = collapsed;
  timelineHeightRef.current = timelineHeight;
  previewFloatingRef.current = previewFloating;

  const clampToViewport = React.useCallback(
    (height: number) => {
      const container = containerRef.current;
      const reserve = previewFloatingRef.current ? 0 : minPreviewReserve;
      const max = container
        ? Math.max(MIN_TIMELINE_HEIGHT, container.clientHeight - reserve - 8)
        : height;
      return Math.min(max, Math.max(MIN_TIMELINE_HEIGHT, height));
    },
    [minPreviewReserve],
  );

  const applyResponsiveHeight = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (previewFloatingRef.current) {
      const next = clampToViewport(container.clientHeight - TIMELINE_COLLAPSED_HEIGHT);
      timelineHeightRef.current = next;
      setTimelineHeight(next);
      return;
    }
    if (container.clientHeight < minPreviewReserve + MIN_TIMELINE_HEIGHT) return;
    const next = computeResponsiveTimelineHeight(container.clientHeight, minPreviewReserve);
    timelineHeightRef.current = next;
    setTimelineHeight(next);
  }, [clampToViewport, minPreviewReserve]);

  const persistPinnedHeight = React.useCallback((height: number) => {
    const rounded = Math.round(height);
    pinnedHeightRef.current = rounded;
    layoutModeRef.current = "manual";
    setLayoutMode("manual");
    writeTimelineLayoutMode("manual");
    writeTimelineHeight(rounded);
  }, []);

  React.useEffect(() => {
    previewFloatingRef.current = previewFloating;
  }, [previewFloating]);

  const applyFloatingSideEffects = React.useCallback(
    (next: boolean) => {
      if (next) {
        if (!collapsedRef.current) {
          persistPinnedHeight(timelineHeightRef.current);
        }
        collapsedRef.current = false;
        setCollapsed(false);
        writeTimelineCollapsed(false);
        layoutModeRef.current = "manual";
        setLayoutMode("manual");
        writeTimelineLayoutMode("manual");
        applyResponsiveHeight();
        return;
      }

      if (layoutModeRef.current === "manual") {
        const display = clampToViewport(pinnedHeightRef.current);
        timelineHeightRef.current = display;
        setTimelineHeight(display);
        return;
      }
      applyResponsiveHeight();
    },
    [applyResponsiveHeight, clampToViewport, persistPinnedHeight],
  );

  const prevPreviewFloatingRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (!prefsReady) return;
    previewFloatingRef.current = previewFloating;
    if (previewFloating) {
      applyFloatingSideEffects(true);
    } else if (prevPreviewFloatingRef.current === true) {
      applyFloatingSideEffects(false);
    }
    prevPreviewFloatingRef.current = previewFloating;
  }, [previewFloating, prefsReady, applyFloatingSideEffects]);

  // Load saved prefs once — never overwrite storage during init.
  React.useLayoutEffect(() => {
    const isCollapsed = readTimelineCollapsed();
    const mode = readTimelineLayoutMode();
    const stored = readTimelineHeight();
    const isFloating = readPreviewFloating();

    collapsedRef.current = isCollapsed;
    layoutModeRef.current = mode;
    pinnedHeightRef.current = stored;
    previewFloatingRef.current = isFloating;
    setPreviewFloatingInternal(isFloating);
    setCollapsed(isCollapsed);
    setLayoutMode(mode);

    if (isCollapsed) {
      timelineHeightRef.current = TIMELINE_COLLAPSED_HEIGHT;
      setTimelineHeight(TIMELINE_COLLAPSED_HEIGHT);
    } else if (mode === "manual") {
      timelineHeightRef.current = stored;
      setTimelineHeight(stored);
    }

    setPrefsReady(true);
  }, []);

  // Apply height after container is measured (manual = pinned height, responsive = auto).
  React.useEffect(() => {
    if (!prefsReady || collapsed) return;

    const container = containerRef.current;
    if (!container) return;

    function syncHeight() {
      if (collapsedRef.current) return;
      if (layoutModeRef.current === "manual") {
        const display = clampToViewport(pinnedHeightRef.current);
        timelineHeightRef.current = display;
        setTimelineHeight(display);
        return;
      }
      applyResponsiveHeight();
    }

    syncHeight();
    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(container);
    return () => observer.disconnect();
  }, [prefsReady, collapsed, layoutMode, previewFloating, clampToViewport, applyResponsiveHeight]);

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = clampToViewport(rect.bottom - e.clientY);
      timelineHeightRef.current = next;
      setTimelineHeight(next);
    }

    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      if (collapsedRef.current) return;
      persistPinnedHeight(timelineHeightRef.current);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampToViewport, persistPinnedHeight]);

  function expandFromCollapsed() {
    collapsedRef.current = false;
    setCollapsed(false);
    writeTimelineCollapsed(false);
    const restored = clampToViewport(pinnedHeightRef.current);
    timelineHeightRef.current = restored;
    setTimelineHeight(restored);
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();

    if (collapsedRef.current) {
      expandFromCollapsed();
    }

    layoutModeRef.current = "manual";
    setLayoutMode("manual");

    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const next = clampToViewport(rect.bottom - e.clientY);
      timelineHeightRef.current = next;
      setTimelineHeight(next);
    }
  }

  function setMode(next: TimelineLayoutMode) {
    if (collapsed) {
      expandFromCollapsed();
    }
    layoutModeRef.current = next;
    setLayoutMode(next);
    writeTimelineLayoutMode(next);
    if (next === "responsive") {
      applyResponsiveHeight();
      return;
    }
    const display = clampToViewport(pinnedHeightRef.current);
    timelineHeightRef.current = display;
    setTimelineHeight(display);
  }

  function toggleCollapsed() {
    if (collapsed) {
      expandFromCollapsed();
      return;
    }
    persistPinnedHeight(timelineHeightRef.current);
    collapsedRef.current = true;
    setCollapsed(true);
    writeTimelineCollapsed(true);
    timelineHeightRef.current = TIMELINE_COLLAPSED_HEIGHT;
    setTimelineHeight(TIMELINE_COLLAPSED_HEIGHT);
  }

  function togglePreviewFloating() {
    const next = !previewFloatingRef.current;
    if (onPreviewFloatingChange) {
      onPreviewFloatingChange(next);
      return;
    }
    previewFloatingRef.current = next;
    setPreviewFloatingInternal(next);
    writePreviewFloating(next);
    applyFloatingSideEffects(next);
  }

  const effectiveHeight = collapsed
    ? TIMELINE_COLLAPSED_HEIGHT
    : previewFloating
      ? undefined
      : timelineHeight;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      {!previewFloating ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{top}</div>
      ) : null}

      {!previewFloating ? (
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={effectiveHeight ?? timelineHeight}
        onPointerDown={startResize}
        className={cn(
          "group relative z-10 flex h-2 shrink-0 cursor-row-resize items-center justify-center gap-2",
          "border-y border-border bg-panel hover:bg-muted/60",
        )}
        title={collapsed ? "Drag up to expand timeline" : "Drag to resize timeline"}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-muted-foreground" />
        <div className="absolute left-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 gap-1 px-1.5 text-[10px]"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed();
            }}
            title={collapsed ? "Expand timeline tracks" : "Collapse timeline — toolbar only"}
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Expand
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Collapse
              </>
            )}
          </Button>
        </div>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 gap-1 px-1.5 text-[10px]"
            onClick={(e) => {
              e.stopPropagation();
              togglePreviewFloating();
            }}
            title="Float a small draggable preview — timeline uses full height"
          >
            <PictureInPicture2 className="h-3 w-3" />
            Full timeline
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="absolute right-2 h-5 gap-1 px-1.5 text-[10px]"
          onClick={(e) => {
            e.stopPropagation();
            setMode(layoutMode === "responsive" ? "manual" : "responsive");
          }}
          title={
            layoutMode === "responsive"
              ? "Pin timeline height — drag the bar to resize"
              : "Auto-fit height — keep preview fully visible"
          }
        >
          {layoutMode === "responsive" ? (
            <>
              <Rows3 className="h-3 w-3" />
              Auto
            </>
          ) : (
            <>
              <Pin className="h-3 w-3" />
              Fixed
            </>
          )}
        </Button>
      </div>
      ) : null}

      <div
        className={cn(
          "relative flex min-h-0 flex-col overflow-hidden",
          previewFloating ? "min-h-0 flex-1" : "shrink-0",
        )}
        style={effectiveHeight != null ? { height: effectiveHeight } : undefined}
      >
        {previewFloating && floatingPreview ? (
          <FloatingPreview>{floatingPreview}</FloatingPreview>
        ) : null}
        <TimelineLayoutContext.Provider value={{ collapsed, toggleCollapsed }}>
          {bottom}
        </TimelineLayoutContext.Provider>
      </div>
    </div>
  );
}
