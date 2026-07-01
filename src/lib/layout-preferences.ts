const SIDEBAR_COLLAPSED_KEY = "imagine-sidebar-collapsed";
const BLOCK_PANEL_COLLAPSED_KEY = "imagine-block-panel-collapsed";
const PROJECT_SUMMARY_COLLAPSED_KEY = "imagine-project-summary-collapsed";
const TIMELINE_HEIGHT_KEY = "imagine-timeline-height";
const TIMELINE_LAYOUT_MODE_KEY = "imagine-timeline-layout-mode";
const TIMELINE_COLLAPSED_KEY = "imagine-timeline-collapsed";
const PREVIEW_FLOATING_KEY = "imagine-preview-floating";
const FLOATING_PREVIEW_POS_KEY = "imagine-floating-preview-pos";

export type TimelineLayoutMode = "responsive" | "manual";

export interface FloatingPreviewPosition {
  x: number;
  y: number;
}

export const DEFAULT_FLOATING_PREVIEW_POSITION: FloatingPreviewPosition = { x: -1, y: 12 };
/** -1 x means anchor to the right edge on first layout */

export const DEFAULT_TIMELINE_HEIGHT = 380;
export const MIN_TIMELINE_HEIGHT = 200;
/** Upper bound when rendering; stored values may be higher and are clamped per viewport. */
export const MAX_TIMELINE_HEIGHT = 720;
export const MAX_STORED_TIMELINE_HEIGHT = 2000;
/** Toolbar-only height when the timeline tracks are collapsed. */
export const TIMELINE_COLLAPSED_HEIGHT = 36;
/** Share of the editor column given to the timeline in responsive mode. */
export const RESPONSIVE_TIMELINE_RATIO = 0.36;
export const MIN_PREVIEW_RESERVE = 280;
export const VERTICAL_PREVIEW_RESERVE = 360;

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function readSidebarCollapsed(): boolean {
  return readStorage(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  writeStorage(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : null);
}

export function readBlockPanelCollapsed(): boolean {
  return readStorage(BLOCK_PANEL_COLLAPSED_KEY) === "1";
}

export function writeBlockPanelCollapsed(collapsed: boolean): void {
  writeStorage(BLOCK_PANEL_COLLAPSED_KEY, collapsed ? "1" : null);
}

export function readProjectSummaryCollapsed(): boolean {
  return readStorage(PROJECT_SUMMARY_COLLAPSED_KEY) === "1";
}

export function writeProjectSummaryCollapsed(collapsed: boolean): void {
  writeStorage(PROJECT_SUMMARY_COLLAPSED_KEY, collapsed ? "1" : null);
}

export function readTimelineHeight(): number {
  const raw = readStorage(TIMELINE_HEIGHT_KEY);
  if (!raw) return DEFAULT_TIMELINE_HEIGHT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMELINE_HEIGHT;
  return Math.min(MAX_STORED_TIMELINE_HEIGHT, Math.max(MIN_TIMELINE_HEIGHT, parsed));
}

export function writeTimelineHeight(height: number): void {
  const clamped = Math.min(
    MAX_STORED_TIMELINE_HEIGHT,
    Math.max(MIN_TIMELINE_HEIGHT, Math.round(height)),
  );
  writeStorage(TIMELINE_HEIGHT_KEY, String(clamped));
}

export function readTimelineLayoutMode(): TimelineLayoutMode {
  const raw = readStorage(TIMELINE_LAYOUT_MODE_KEY);
  if (raw === "responsive") return "responsive";
  if (raw === "manual") return "manual";
  if (readStorage(TIMELINE_HEIGHT_KEY)) return "manual";
  return "responsive";
}

export function writeTimelineLayoutMode(mode: TimelineLayoutMode): void {
  writeStorage(TIMELINE_LAYOUT_MODE_KEY, mode);
}

export function readTimelineCollapsed(): boolean {
  return readStorage(TIMELINE_COLLAPSED_KEY) === "1";
}

export function writeTimelineCollapsed(collapsed: boolean): void {
  writeStorage(TIMELINE_COLLAPSED_KEY, collapsed ? "1" : null);
}

export function readPreviewFloating(): boolean {
  return readStorage(PREVIEW_FLOATING_KEY) === "1";
}

export function writePreviewFloating(floating: boolean): void {
  writeStorage(PREVIEW_FLOATING_KEY, floating ? "1" : null);
}

export function readFloatingPreviewPosition(): FloatingPreviewPosition {
  const raw = readStorage(FLOATING_PREVIEW_POS_KEY);
  if (!raw) return DEFAULT_FLOATING_PREVIEW_POSITION;
  try {
    const parsed = JSON.parse(raw) as Partial<FloatingPreviewPosition>;
    const x = typeof parsed.x === "number" && Number.isFinite(parsed.x) ? parsed.x : -1;
    const y = typeof parsed.y === "number" && Number.isFinite(parsed.y) ? parsed.y : 12;
    return { x, y };
  } catch {
    return DEFAULT_FLOATING_PREVIEW_POSITION;
  }
}

export function writeFloatingPreviewPosition(pos: FloatingPreviewPosition): void {
  writeStorage(
    FLOATING_PREVIEW_POS_KEY,
    JSON.stringify({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
    }),
  );
}

export function computeResponsiveTimelineHeight(
  containerHeight: number,
  minPreviewReserve: number,
): number {
  const separator = 8;
  const maxForPreview = containerHeight - minPreviewReserve - separator;
  const preferred = Math.round(containerHeight * RESPONSIVE_TIMELINE_RATIO);
  const next = Math.min(preferred, maxForPreview);
  return Math.min(MAX_TIMELINE_HEIGHT, Math.max(MIN_TIMELINE_HEIGHT, next));
}
