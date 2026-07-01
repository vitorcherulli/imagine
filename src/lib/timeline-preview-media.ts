import type { StoryBlock } from "@/lib/db/schema";
import {
  findActiveVideoBlockAtTime,
  type ActiveTimelineBlock,
} from "@/lib/timeline-free-edit";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "@/lib/script-pause";
import { stableFullVideoUrl } from "@/lib/preview-video-cache";

export type TimelineVisualBlock = Pick<
  StoryBlock,
  "id" | "keyframeUrl" | "videoUrl" | "segmentType" | "position"
>;

export interface TimelineVisualAtTime extends ActiveTimelineBlock {
  visual: TimelineVisualBlock;
}

/** Single source of truth for which block + media the timeline and preview show at `t`. */
export function resolveTimelineVisualAtTime(
  blocks: StoryBlock[],
  currentTime: number,
): TimelineVisualAtTime | null {
  const hit = findActiveVideoBlockAtTime(blocks, currentTime);
  if (!hit) return null;
  const visual = isStoryBlockPause(hit.block)
    ? resolveNeighborVisualBlock(blocks, hit.block)
    : hit.block;
  return { ...hit, visual };
}

/** Ordered still URLs for timeline thumbs — only DB keyframe URLs, never guessed paths. */
export function timelineThumbCandidates(
  visual: TimelineVisualBlock | null | undefined,
): string[] {
  const keyframe = visual?.keyframeUrl?.trim();
  if (!keyframe) return [];

  const path = keyframe.split("?")[0]?.split("#")[0] ?? keyframe;
  const query = keyframe.includes("?") ? `?${keyframe.split("?", 2)[1]}` : "";
  const candidates = [keyframe];

  if (path.endsWith("/keyframe.jpg")) {
    candidates.push(`${path.replace(/\/keyframe\.jpg$/i, "/keyframe.png")}${query}`);
  } else if (path.endsWith("/keyframe.png")) {
    candidates.push(`${path.replace(/\/keyframe\.png$/i, "/keyframe.jpg")}${query}`);
  }

  return [...new Set(candidates)];
}

/** Thumbnail / paused preview — first candidate from {@link timelineThumbCandidates}. */
export function timelineStillUrl(visual: TimelineVisualBlock | null | undefined): string | null {
  return timelineThumbCandidates(visual)[0] ?? null;
}

/** In-player video — full `video.mp4` only (never the proxy; proxies caused drift vs keyframes). */
export function timelinePlaybackVideoUrl(
  visual: TimelineVisualBlock | null | undefined,
): string | null {
  const url = visual?.videoUrl?.trim();
  if (!url) return null;
  return stableFullVideoUrl(url);
}
