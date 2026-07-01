import type { StoryBlock } from "@/lib/db/schema";

/** Default breath when the script line is only `[pause]` or `---`. */
export const DEFAULT_SCRIPT_PAUSE_SECONDS = 2;
/** Max pause length in script or on the timeline (documentary music beds). */
export const MAX_SCRIPT_PAUSE_SECONDS = 20;
export const MIN_SCRIPT_PAUSE_SECONDS = 1;

export const SCRIPT_PAUSE_LINE_RE = /^\[pause(?:\s+(\d+(?:\.\d+)?)\s*s)?\]$/i;
export const SCRIPT_PAUSE_DASH_RE = /^-{3,}$/;

export function clampPauseSeconds(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_SCRIPT_PAUSE_SECONDS;
  return Math.min(
    MAX_SCRIPT_PAUSE_SECONDS,
    Math.max(MIN_SCRIPT_PAUSE_SECONDS, Math.round(raw)),
  );
}

export function parsePauseSecondsFromBlock(block: string): number | null {
  const trimmed = block.trim();
  if (!trimmed) return null;
  const tagged = SCRIPT_PAUSE_LINE_RE.exec(trimmed);
  if (tagged) {
    const raw = tagged[1]
      ? Number.parseFloat(tagged[1])
      : DEFAULT_SCRIPT_PAUSE_SECONDS;
    return clampPauseSeconds(raw);
  }
  if (SCRIPT_PAUSE_DASH_RE.test(trimmed)) {
    return DEFAULT_SCRIPT_PAUSE_SECONDS;
  }
  return null;
}

export function formatPauseLine(seconds: number = DEFAULT_SCRIPT_PAUSE_SECONDS): string {
  const clamped = clampPauseSeconds(seconds);
  return `[pause ${clamped}s]`;
}

export function isPauseNarrationGroupId(groupId: string | null | undefined): boolean {
  const id = groupId?.trim().toLowerCase();
  return Boolean(id && id.startsWith("pause"));
}

export function isStoryBlockPause(
  block: Pick<StoryBlock, "narrationGroupId" | "narrativeText">,
): boolean {
  if (block.narrativeText.trim()) return false;
  return isPauseNarrationGroupId(block.narrationGroupId);
}

export type BlockVisualMedia = Pick<
  StoryBlock,
  "id" | "keyframeUrl" | "videoUrl" | "videoJobId" | "videoPollingUrl" | "locationTag" | "status"
>;

/** When a music-moment block has no media, hold the nearest neighbor image/video. */
export function resolveNeighborVisualBlock<T extends BlockVisualMedia>(
  blocks: T[],
  block: T,
): T {
  if (block.keyframeUrl || block.videoUrl) return block;
  const idx = blocks.findIndex((item) => item.id === block.id);
  if (idx < 0) return block;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const neighbor = blocks[i]!;
    if (neighbor.keyframeUrl || neighbor.videoUrl) return neighbor;
  }
  for (let i = idx + 1; i < blocks.length; i += 1) {
    const neighbor = blocks[i]!;
    if (neighbor.keyframeUrl || neighbor.videoUrl) return neighbor;
  }
  return block;
}

/** Copy visual media from a neighbor block into a new pause row. */
export function inheritPauseBlockVisualFields(
  source: BlockVisualMedia | null | undefined,
): Pick<
  StoryBlock,
  "keyframeUrl" | "videoUrl" | "videoJobId" | "videoPollingUrl" | "locationTag" | "status"
> {
  if (!source?.keyframeUrl && !source?.videoUrl) {
    return {
      keyframeUrl: null,
      videoUrl: null,
      videoJobId: null,
      videoPollingUrl: null,
      locationTag: null,
      status: "draft",
    };
  }
  return {
    keyframeUrl: source.keyframeUrl ?? null,
    videoUrl: source.videoUrl ?? null,
    videoJobId: source.videoUrl ? (source.videoJobId ?? null) : null,
    videoPollingUrl: source.videoUrl ? (source.videoPollingUrl ?? null) : null,
    locationTag: source.locationTag ?? null,
    status: source.videoUrl ? source.status : source.keyframeUrl ? "image_ready" : "draft",
  };
}

/** Append a pause line to the script (blank line separated). */
export function appendPauseToScript(
  script: string,
  seconds: number = DEFAULT_SCRIPT_PAUSE_SECONDS,
): string {
  const line = formatPauseLine(seconds);
  const normalized = script.trimEnd();
  if (!normalized) return line;
  return `${normalized}\n\n${line}`;
}

/** Insert a pause after a display block index (0-based paragraph blocks). */
export function insertPauseAfterDisplayBlock(
  script: string,
  blockIndex: number,
  seconds: number = DEFAULT_SCRIPT_PAUSE_SECONDS,
): string {
  const blocks = script.trim() ? script.replace(/\r\n?/g, "\n").split(/\n\s*\n/) : [];
  if (blocks.length === 0) return formatPauseLine(seconds);
  const line = formatPauseLine(seconds);
  const index = Math.max(0, Math.min(blockIndex, blocks.length - 1));
  const next = [...blocks.slice(0, index + 1), line, ...blocks.slice(index + 1)];
  return next.join("\n\n");
}

export const PAUSE_VISUAL_PROMPT =
  "Atmospheric visual hold — slow gentle motion, let the image breathe. Music swells; narration resumes on the next cut.";

export const PAUSE_PRESET_SECONDS = [2, 3, 5, 8] as const;
