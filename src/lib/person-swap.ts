export const PERSON_SWAP_GALLERY_FOLDER = "Person swap";

export const DEFAULT_SWAP_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/** Longest clip we keep from an upload; each model may cut it shorter. */
export const PERSON_SWAP_MAX_SECONDS = 30;
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
