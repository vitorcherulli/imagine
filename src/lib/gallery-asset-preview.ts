import type { MediaLibraryAsset } from "@/lib/db/schema";

/** Suggested thumbnail URL for gallery grid — never returns a video URL for use in `<img>`. */
export function galleryAssetThumbnailUrl(asset: MediaLibraryAsset): string | null {
  const path = asset.url.split("?")[0]?.split("#")[0] ?? asset.url;

  if (asset.kind === "image" || asset.mimeType?.startsWith("image/")) {
    return asset.url;
  }

  if (asset.kind !== "video" && !asset.mimeType?.startsWith("video/")) {
    return asset.url;
  }

  if (path.includes("script-ref-v") && path.endsWith(".mp4")) {
    return asset.url.replace(/\.mp4(\?.*)?$/i, "-poster.jpg$1");
  }

  if (path.endsWith("/video.mp4")) {
    // Most generators save keyframe as .png (AI keyframe route) or .jpg
    // (stock-import / keyframe-repair / image-from-video). Prefer .jpg since
    // it covers the common stock-import path; the gallery component falls back
    // to .png when .jpg 404s.
    return asset.url.replace(/\/video\.mp4(\?.*)?$/i, "/keyframe.jpg$1");
  }

  if (path.endsWith(".mp4")) {
    return asset.url.replace(/\.mp4(\?.*)?$/i, "-poster.jpg$1");
  }

  return null;
}

/**
 * Alternate thumbnail candidate for a video asset — used when the preferred
 * URL 404s in the gallery grid. Returns null when there is no fallback.
 */
export function galleryAssetThumbnailFallback(
  asset: MediaLibraryAsset,
  primary: string | null,
): string | null {
  if (primary === null) return null;
  const path = primary.split("?")[0]?.split("#")[0] ?? primary;
  if (path.endsWith("/keyframe.jpg")) {
    return primary.replace(/\/keyframe\.jpg(\?.*)?$/i, "/keyframe.png$1");
  }
  if (path.endsWith("/keyframe.png")) {
    return primary.replace(/\/keyframe\.png(\?.*)?$/i, "/keyframe.jpg$1");
  }
  return null;
}

export function isVideoAsset(asset: MediaLibraryAsset): boolean {
  return asset.kind === "video" || (asset.mimeType?.startsWith("video/") ?? false);
}
