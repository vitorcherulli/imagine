import {
  detectImageExt,
  isJpegBuffer,
  isPngBuffer,
  isVideoMp4Buffer,
} from "@/lib/ffmpeg";

const IMAGE_USER_AGENT =
  "ImagineStoryStudio/1.0 (documentary script tool; +https://imagine.papo.global)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWikimediaHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org");
  } catch {
    return false;
  }
}

/** Prefer scaled Commons URLs — smaller files, fewer 429s from upload.wikimedia.org */
export function wikimediaFilePathUrl(fileTitle: string, width = 1280): string {
  const name = fileTitle.replace(/^File:/i, "").trim();
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

/** Convert direct upload URL to scaled thumb (avoids 429 on full-size files). */
export function wikimediaUploadToThumbUrl(url: string, width: number): string | null {
  try {
    const pathname = new URL(url).pathname;
    if (pathname.includes("/thumb/")) {
      return wikimediaResizeThumbUrl(url, width);
    }
    const match = pathname.match(/^\/wikipedia\/commons\/([a-f0-9]\/[a-f0-9]{2}\/.+)$/i);
    if (!match) return null;
    const rest = match[1]!;
    const filename = rest.split("/").pop()!;
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${rest}/${width}px-${filename}`;
  } catch {
    return null;
  }
}

export function wikimediaResizeThumbUrl(url: string, width: number): string | null {
  const match = url.match(/^(.*\/thumb\/.*\/)(\d+)px-(.+)$/);
  if (!match) return null;
  return `${match[1]}${width}px-${match[3]}`;
}

export function wikimediaFilenameFromUploadUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const filename = parts[parts.length - 1];
    return filename ? decodeURIComponent(filename) : null;
  } catch {
    return null;
  }
}

/** Ordered URLs to try — thumb/scaled first for Wikimedia. */
export function referenceImageDownloadUrls(hit: {
  fullUrl: string;
  previewUrl: string;
  provider?: string;
}): string[] {
  const seen = new Set<string>();
  const add = (value: string | undefined | null) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const out: string[] = [];
  const wiki = hit.provider === "wikimedia" || isWikimediaHost(hit.fullUrl);

  if (wiki) {
    add(wikimediaUploadToThumbUrl(hit.previewUrl, 1280));
    add(wikimediaUploadToThumbUrl(hit.fullUrl, 1280));
    add(wikimediaUploadToThumbUrl(hit.previewUrl, 800));
    add(wikimediaUploadToThumbUrl(hit.fullUrl, 800));
    add(wikimediaResizeThumbUrl(hit.previewUrl, 1280));
    add(wikimediaResizeThumbUrl(hit.fullUrl, 1280));
    add(hit.previewUrl);
    const fromFull = wikimediaFilenameFromUploadUrl(hit.fullUrl);
    const fromPreview = wikimediaFilenameFromUploadUrl(hit.previewUrl);
    const filename = fromFull ?? fromPreview;
    if (filename) {
      add(wikimediaFilePathUrl(filename, 1280));
    }
    add(hit.fullUrl);
  } else {
    add(hit.fullUrl);
    add(hit.previewUrl);
  }

  return out;
}

export async function downloadReferenceImageBuffer(
  hit: {
    fullUrl: string;
    previewUrl: string;
    provider?: string;
    sourceUrl?: string;
  },
  opts?: { delayBeforeMs?: number },
): Promise<Buffer> {
  if (opts?.delayBeforeMs && opts.delayBeforeMs > 0) {
    await sleep(opts.delayBeforeMs);
  }

  const urls = referenceImageDownloadUrls(hit);
  let lastError: Error | null = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        await sleep(1500 * 2 ** (attempt - 1));
      }

      try {
        const headers: Record<string, string> = {
          "User-Agent": IMAGE_USER_AGENT,
          Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
        };
        if ((hit.provider === "google" || hit.provider === "serper") && hit.sourceUrl?.trim()) {
          headers.Referer = hit.sourceUrl.trim();
        }

        const res = await fetch(url, {
          headers,
          redirect: "follow",
        });

        if (res.status === 429) {
          lastError = new Error(
            "Wikimedia rate limit (429) — wait a few seconds and try again.",
          );
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`Download failed ${res.status}`);
          break;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          lastError = new Error("Received HTML instead of image");
          break;
        }
        if (contentType.startsWith("video/")) {
          lastError = new Error("Received a video file instead of a photo");
          break;
        }

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 256) {
          lastError = new Error("Downloaded file too small");
          break;
        }

        if (isVideoMp4Buffer(buf)) {
          lastError = new Error("Downloaded file is a video, not a photo");
          break;
        }
        if (!isJpegBuffer(buf) && !isPngBuffer(buf) && !detectImageExt(buf)) {
          lastError = new Error("Downloaded file is not a recognized image");
          break;
        }

        return buf;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError ?? new Error("Could not download reference image");
}

export function referenceImageNeedsThrottle(hit: {
  fullUrl: string;
  previewUrl: string;
  provider?: string;
}): boolean {
  return (
    hit.provider === "wikimedia" ||
    isWikimediaHost(hit.fullUrl) ||
    isWikimediaHost(hit.previewUrl)
  );
}
