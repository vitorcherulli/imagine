export const PERSON_SWAP_GALLERY_FOLDER = "Person swap";

export const DEFAULT_SWAP_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/** Longest clip we keep from an upload; longer than the video AI accepts is rendered in parts. */
export const PERSON_SWAP_MAX_SECONDS = 120;
export const PERSON_SWAP_MIN_SECONDS = 2;
export const PERSON_SWAP_MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
export const PERSON_SWAP_MAX_PEOPLE = 6;

export const PUBLIC_MEDIA_REQUIRED =
  "Video AIs download the clip from a public https address. Set NEXT_PUBLIC_APP_URL to the site's https domain (production already has it).";

export type PersonSwapMode = "person" | "scene";
export type PersonSwapVoiceMode = "original" | "voice";
export type PersonSwapStatus = "frame" | "video" | "voice" | "ready" | "error";

export const PERSON_SWAP_STATUS_LABELS: Record<PersonSwapStatus, string> = {
  frame: "Casting the new person…",
  video: "Rendering the video…",
  voice: "Changing the voice…",
  ready: "Ready",
  error: "Failed",
};

export function isPersonSwapMode(v: unknown): v is PersonSwapMode {
  return v === "person" || v === "scene";
}

export function isPersonSwapVoiceMode(v: unknown): v is PersonSwapVoiceMode {
  return v === "original" || v === "voice";
}

export function isSwapWorking(status: string): boolean {
  return status === "frame" || status === "video" || status === "voice";
}

/** Closest standard ratio for a pixel size (what video models accept). */
export function aspectRatioFor(width: number, height: number): string {
  const options: Array<[string, number]> = [
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
  ];
  const r = width / Math.max(1, height);
  return options.reduce((best, o) => (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r)) ? o : best))[0];
}

export function parseUrlList(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === "string" && !!u) : [];
  } catch {
    return [];
  }
}

/** One part of a video rendered in pieces. */
export type SwapSegment = {
  start: number;
  seconds: number;
  keyframeUrl: string | null;
  rawVideoUrl: string | null;
};

export function parseSwapSegments(raw: string | null | undefined): SwapSegment[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.start === "number" && typeof s.seconds === "number")
      .map((s) => ({
        start: s.start,
        seconds: s.seconds,
        keyframeUrl: typeof s.keyframeUrl === "string" ? s.keyframeUrl : null,
        rawVideoUrl: typeof s.rawVideoUrl === "string" ? s.rawVideoUrl : null,
      }));
  } catch {
    return [];
  }
}

/** Overshoot that is cut off instead of costing an extra part. */
const SEGMENT_SLACK_SECONDS = 0.5;

/**
 * Even parts of at most `maxSeconds` (whole seconds except the last), so no part is
 * too short for the video AI.
 */
export function planSwapSegments(
  durationSeconds: number,
  maxSeconds: number,
): Array<{ start: number; seconds: number }> {
  if (durationSeconds <= maxSeconds + SEGMENT_SLACK_SECONDS) {
    return [{ start: 0, seconds: Math.min(durationSeconds, maxSeconds) }];
  }
  const count = Math.ceil(durationSeconds / maxSeconds);
  const piece = Math.ceil(durationSeconds / count);
  return Array.from({ length: count }, (_, i) => ({
    start: i * piece,
    seconds: i === count - 1 ? durationSeconds - piece * (count - 1) : piece,
  }));
}
