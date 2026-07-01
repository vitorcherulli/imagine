import { normalizeVideoFormat } from "./video-format";

/** Default number of stock video hits shown in the import picker. */
export const DEFAULT_VIDEO_SEARCH_LIMIT = 16;
/** Hard cap for a single Pexels search request. */
export const MAX_VIDEO_SEARCH_LIMIT = 24;

export type VideoSearchProvider = "pexels";

export type VideoSearchOrientation = "landscape" | "portrait";

export interface VideoSearchResult {
  id: string;
  previewUrl: string;
  downloadUrl: string;
  sourceUrl: string;
  sourceTitle?: string;
  provider: VideoSearchProvider;
  width?: number;
  height?: number;
  durationSeconds?: number;
  attribution?: string;
}

interface PexelsVideoFile {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
}

function pexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

export function videoSearchProviderLabel(): string {
  return pexelsConfigured() ? "Pexels" : "Pexels (API key not configured)";
}

export function orientationForVideoFormat(videoFormat?: string | null): VideoSearchOrientation {
  return normalizeVideoFormat(videoFormat) === "vertical" ? "portrait" : "landscape";
}

export function pickBestPexelsVideoFile(
  files: PexelsVideoFile[],
  orientation: VideoSearchOrientation = "landscape",
): PexelsVideoFile | null {
  const mp4 = files.filter(
    (file) => file.file_type === "video/mp4" && typeof file.link === "string" && file.link.trim(),
  );
  if (mp4.length === 0) return null;

  const score = (file: PexelsVideoFile) => {
    let s = 0;
    if (file.quality === "uhd") s += 30;
    else if (file.quality === "hd") s += 22;
    else if (file.quality === "sd") s += 10;

    const width = file.width ?? 0;
    const height = file.height ?? 0;
    if (orientation === "portrait") {
      if (height >= 720 && height <= 1920) s += 14;
      if (width > 0 && height > 0 && width <= height) s += 12;
    } else {
      if (width >= 1280 && width <= 1920) s += 14;
      if (width > 0 && height > 0 && width >= height) s += 12;
    }
    s += Math.min(18, (width * height) / 120_000);
    return s;
  };

  return [...mp4].sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function searchPexelsVideos(
  query: string,
  limit: number,
  orientation: VideoSearchOrientation,
): Promise<VideoSearchResult[]> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query: query.slice(0, 120),
    per_page: String(Math.min(limit, MAX_VIDEO_SEARCH_LIMIT)),
    orientation,
  });

  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pexels video search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    videos?: Array<{
      id?: number;
      url?: string;
      image?: string;
      width?: number;
      height?: number;
      duration?: number;
      user?: { name?: string };
      video_files?: PexelsVideoFile[];
    }>;
  };

  const out: VideoSearchResult[] = [];
  for (const video of json.videos ?? []) {
    if (video.id == null) continue;
    const best = pickBestPexelsVideoFile(video.video_files ?? [], orientation);
    if (!best?.link) continue;
    const photographer = video.user?.name?.trim();
    out.push({
      id: `pexels-video-${video.id}`,
      previewUrl: video.image ?? best.link,
      downloadUrl: best.link,
      sourceUrl: video.url ?? "https://www.pexels.com/videos/",
      sourceTitle: photographer ? `${photographer} on Pexels` : query,
      provider: "pexels",
      width: best.width ?? video.width,
      height: best.height ?? video.height,
      durationSeconds:
        typeof video.duration === "number" && video.duration > 0
          ? Math.round(video.duration)
          : undefined,
      attribution: photographer ? `Video by ${photographer} / Pexels` : "Pexels",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Search free stock videos — Pexels when configured. */
export async function searchVideos(
  query: string,
  limit = DEFAULT_VIDEO_SEARCH_LIMIT,
  orientation: VideoSearchOrientation = "landscape",
): Promise<VideoSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!pexelsConfigured()) {
    throw new Error("PEXELS_API_KEY is not configured — add it to enable stock video search.");
  }
  return searchPexelsVideos(q, limit, orientation);
}

export async function searchVideosWithFallback(
  query: string,
  limit = DEFAULT_VIDEO_SEARCH_LIMIT,
  orientation: VideoSearchOrientation = "landscape",
): Promise<VideoSearchResult[]> {
  let results = await searchVideos(query, limit, orientation);
  if (results.length === 0) {
    const shorter = query.split(/\s+/).slice(0, 2).join(" ").trim();
    if (shorter && shorter !== query) {
      results = await searchVideos(shorter, limit, orientation);
    }
  }
  if (results.length === 0) {
    const first = query.split(/\s+/)[0]?.trim();
    if (first && first.length > 3 && first !== query) {
      results = await searchVideos(first, limit, orientation);
    }
  }
  return results;
}
