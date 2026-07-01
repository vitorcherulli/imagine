import { createId } from "@paralleldrive/cuid2";
import { extractFirstFrameFromVideoBuffer } from "@/lib/ffmpeg";
import { downloadStockVideoBuffer } from "@/lib/stock-video-import-server";
import { registerMediaLibraryAssetSafe } from "@/lib/media-library-server";
import { saveBuffer, withCacheBuster } from "@/lib/storage";
import type { ScriptKeywordImageMatch } from "@/lib/script-studio";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function importScriptKeywordVideoMatch(
  projectId: string,
  speechIndex: number,
  match: ScriptKeywordImageMatch,
  imageId?: string,
  options?: { userId?: string },
): Promise<ScriptKeywordImageMatch> {
  const selectedId = imageId ?? match.selectedId;
  const hit = match.results.find((r) => r.id === selectedId) ?? match.results[0];
  if (!hit) {
    throw new Error(`No video found for "${match.keyword}".`);
  }

  const buf = await downloadStockVideoBuffer(hit.fullUrl);
  const slug = slugify(match.keyword) || createId();
  const filename = `script-ref-v${speechIndex + 1}-${slug}.mp4`;
  const importedUrl = await saveBuffer(projectId, null, filename, buf);
  const cachedUrl = withCacheBuster(importedUrl);

  let importedPreviewUrl = hit.previewUrl?.trim() || "";
  const isMp4Url = (url: string) => /\.mp4(\?|#|$)/i.test(url.split("?")[0] ?? url);
  if (!importedPreviewUrl || isMp4Url(importedPreviewUrl)) {
    importedPreviewUrl = "";
  }

  try {
    const poster = await extractFirstFrameFromVideoBuffer(buf);
    const posterUrl = withCacheBuster(
      await saveBuffer(projectId, null, `script-ref-v${speechIndex + 1}-${slug}-poster.jpg`, poster),
    );
    importedPreviewUrl = posterUrl;
  } catch {
    if (!importedPreviewUrl) {
      importedPreviewUrl = cachedUrl;
    }
  }

  if (options?.userId) {
    registerMediaLibraryAssetSafe({
      userId: options.userId,
      url: cachedUrl,
      name: match.keyword,
      mimeType: "video/mp4",
      kind: "video",
      source: hit.provider === "pexels" ? "pexels" : "script_ref",
      projectId,
    });
  }

  return {
    ...match,
    mediaKind: "video",
    selectedId: hit.id,
    importedUrl: cachedUrl,
    importedPreviewUrl,
    importedAt: new Date().toISOString(),
  };
}

export async function importScriptKeywordVideoMatches(
  projectId: string,
  speechIndex: number,
  keywords: ScriptKeywordImageMatch[],
  options?: { userId?: string },
): Promise<{ keywords: ScriptKeywordImageMatch[]; importErrors: string[] }> {
  const nextKeywords: ScriptKeywordImageMatch[] = [];
  const importErrors: string[] = [];

  for (const kw of keywords) {
    if (kw.mediaKind !== "video" || kw.results.length === 0 || kw.importedUrl?.trim()) {
      nextKeywords.push(kw);
      continue;
    }
    try {
      nextKeywords.push(
        await importScriptKeywordVideoMatch(projectId, speechIndex, kw, undefined, options),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      importErrors.push(`${kw.keyword}: ${msg}`);
      nextKeywords.push(kw);
    }
  }

  return { keywords: nextKeywords, importErrors };
}
