/**
 * @deprecated Preview proxy playback was removed — the player always plays the
 * full `video.mp4`. This client-side proxy resolution/cache is no longer wired
 * into playback (`resolvePreviewSettings` forces `useProxy=false`). Kept only so
 * existing imports keep compiling. Do not add new call sites.
 */
import {
  VIDEO_PREVIEW_FILENAME,
  previewVideoUrlFromFullVideoUrl,
} from "@/lib/video-preview";

/**
 * One in-memory slot per block. The slot stores the full `videoUrl` it was
 * resolved against — including the `?v=` cache buster — so a regenerated
 * block (new buster) invalidates the entry automatically.
 */
interface CacheSlot {
  sourceVideoUrl: string;
  url: string;
  /** Preview URLs are verified once per session unless the source video changes. */
  previewVerified: boolean;
}

const slots = new Map<string, CacheSlot>();
const inFlight = new Map<string, Promise<string>>();

function inflightKey(blockId: string, videoUrl: string): string {
  return `${blockId}:${videoUrl}`;
}

function isPreviewMediaUrl(url: string): boolean {
  const path = url.split("?")[0]?.split("#")[0] ?? "";
  return path.endsWith(`/${VIDEO_PREVIEW_FILENAME}`);
}

/** Strip query/cache-buster from a video URL to get a stable path. */
export function stableFullVideoUrl(videoUrl: string): string {
  return videoUrl.split("?")[0] ?? videoUrl;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function getCachedBlockPreviewUrl(blockId: string): string | undefined {
  return slots.get(blockId)?.url;
}

export function setCachedBlockPreviewUrl(
  blockId: string,
  url: string,
  sourceVideoUrl?: string,
): void {
  const existing = slots.get(blockId);
  slots.set(blockId, {
    sourceVideoUrl: sourceVideoUrl ?? existing?.sourceVideoUrl ?? url,
    url,
    previewVerified: isPreviewMediaUrl(url) ? true : (existing?.previewVerified ?? false),
  });
}

/** Drop cached preview URLs when block media URLs change (e.g. after regen). */
export function syncBlockPreviewCache(
  blocks: Array<{ id: string; videoUrl?: string | null; keyframeUrl?: string | null }>,
): void {
  const blockIds = new Set(blocks.map((b) => b.id));
  for (const blockId of slots.keys()) {
    if (!blockIds.has(blockId)) slots.delete(blockId);
  }
  for (const block of blocks) {
    const cached = slots.get(block.id);
    if (!cached) continue;
    const videoUrl = block.videoUrl?.trim();
    if (!videoUrl || cached.sourceVideoUrl !== videoUrl) {
      slots.delete(block.id);
      for (const key of inFlight.keys()) {
        if (key.startsWith(`${block.id}:`)) inFlight.delete(key);
      }
    }
  }
}

export function clearBlockPreviewCache(blockId?: string): void {
  if (blockId) {
    slots.delete(blockId);
    for (const key of inFlight.keys()) {
      if (key.startsWith(`${blockId}:`)) inFlight.delete(key);
    }
    return;
  }
  slots.clear();
  inFlight.clear();
}

/** Ask the server to encode `video_preview.mp4` — does not load media in the browser. */
export async function requestBlockPreviewGeneration(blockId: string): Promise<void> {
  try {
    await fetch(`/api/blocks/${blockId}/video-preview`);
  } catch {
    // ignore — playback falls back to full `video.mp4`
  }
}

/**
 * Resolve the best playback URL for the preview player.
 * Never returns an unverified preview URL — always falls back to full `video.mp4`
 * until a preview proxy is confirmed to exist.
 */
export async function resolveBlockPreviewUrl(
  blockId: string,
  videoUrl: string,
  opts: { allowGeneration?: boolean } = {},
): Promise<string> {
  const { allowGeneration = true } = opts;
  const fullFallback = stableFullVideoUrl(videoUrl);
  const taskKey = inflightKey(blockId, videoUrl);

  const existingTask = inFlight.get(taskKey);
  if (existingTask) return existingTask;

  const task = (async () => {
    const cached = slots.get(blockId);
    if (cached?.sourceVideoUrl === videoUrl) {
      if (!isPreviewMediaUrl(cached.url)) {
        return cached.url;
      }
      if (cached.previewVerified) {
        return cached.url;
      }
      if (await headOk(cached.url)) {
        slots.set(blockId, { ...cached, previewVerified: true });
        return cached.url;
      }
      slots.delete(blockId);
    } else if (cached) {
      slots.delete(blockId);
    }

    if (!(await headOk(fullFallback))) {
      slots.set(blockId, {
        sourceVideoUrl: videoUrl,
        url: fullFallback,
        previewVerified: false,
      });
      return fullFallback;
    }

    const previewCandidate = previewVideoUrlFromFullVideoUrl(videoUrl);
    if (await headOk(previewCandidate)) {
      slots.set(blockId, {
        sourceVideoUrl: videoUrl,
        url: previewCandidate,
        previewVerified: true,
      });
      return previewCandidate;
    }

    if (!allowGeneration) {
      slots.set(blockId, {
        sourceVideoUrl: videoUrl,
        url: fullFallback,
        previewVerified: false,
      });
      return fullFallback;
    }

    try {
      const res = await fetch(`/api/blocks/${blockId}/video-preview`);
      const data = (await res.json().catch(() => ({}))) as {
        previewUrl?: string | null;
      };
      const resolved = data.previewUrl?.trim();
      if (
        res.ok &&
        resolved &&
        resolved !== fullFallback &&
        isPreviewMediaUrl(resolved) &&
        (await headOk(resolved))
      ) {
        slots.set(blockId, {
          sourceVideoUrl: videoUrl,
          url: resolved,
          previewVerified: true,
        });
        return resolved;
      }
    } catch {
      // fall through to full video
    }

    slots.set(blockId, {
      sourceVideoUrl: videoUrl,
      url: fullFallback,
      previewVerified: false,
    });
    return fullFallback;
  })();

  inFlight.set(taskKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(taskKey);
  }
}
