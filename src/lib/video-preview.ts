export const VIDEO_PREVIEW_FILENAME = "video_preview.mp4";

/** Preview playback — very low quality is fine; export uses `video.mp4`. */
export const PREVIEW_VIDEO_MAX_HEIGHT = 360;
export const PREVIEW_VIDEO_CRF = 34;

export function previewVideoStorageKey(projectId: string, blockId: string): string {
  return `generated/${projectId}/${blockId}/${VIDEO_PREVIEW_FILENAME}`;
}

export function previewVideoUrlFromFullVideoUrl(videoUrl: string): string {
  const [pathPart, query = ""] = videoUrl.split("?", 2);
  const previewPath = pathPart.replace(/\/video\.mp4$/, `/${VIDEO_PREVIEW_FILENAME}`);
  /**
   * Carry the source `?v=` cache buster onto the preview URL so that when the
   * block video is regenerated (new buster), the preview URL also changes —
   * which invalidates the browser's HTTP cache and the client preview cache.
   * Without this, a regenerated proxy served from the same path would be
   * served stale because the media route advertises `immutable` caching.
   */
  const params = new URLSearchParams(query);
  const buster = params.get("v");
  if (!buster) return previewPath;
  const previewParams = new URLSearchParams();
  previewParams.set("v", buster);
  return `${previewPath}?${previewParams.toString()}`;
}
