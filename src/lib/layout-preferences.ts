const SIDEBAR_COLLAPSED_KEY = "imagine-sidebar-collapsed";
const BLOCK_PANEL_COLLAPSED_KEY = "imagine-block-panel-collapsed";
const TIMELINE_HEIGHT_KEY = "imagine-timeline-height";

export const DEFAULT_TIMELINE_HEIGHT = 380;
export const MIN_TIMELINE_HEIGHT = 280;
export const MAX_TIMELINE_HEIGHT = 720;

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

export function readTimelineHeight(): number {
  const raw = readStorage(TIMELINE_HEIGHT_KEY);
  if (!raw) return DEFAULT_TIMELINE_HEIGHT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMELINE_HEIGHT;
  return Math.min(MAX_TIMELINE_HEIGHT, Math.max(MIN_TIMELINE_HEIGHT, parsed));
}

export function writeTimelineHeight(height: number): void {
  const clamped = Math.min(
    MAX_TIMELINE_HEIGHT,
    Math.max(MIN_TIMELINE_HEIGHT, Math.round(height)),
  );
  writeStorage(TIMELINE_HEIGHT_KEY, String(clamped));
}
