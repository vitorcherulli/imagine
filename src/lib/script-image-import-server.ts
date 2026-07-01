import { createId } from "@paralleldrive/cuid2";
import { fitImageBufferToVideoFormat } from "@/lib/ffmpeg";
import {
  downloadReferenceImageBuffer,
  referenceImageNeedsThrottle,
} from "@/lib/reference-image-download";
import { registerMediaLibraryAssetSafe, type MediaLibrarySource } from "@/lib/media-library-server";
import { deleteMediaByPublicUrl, saveBuffer, withCacheBuster } from "@/lib/storage";
import type { ScriptKeywordImageMatch } from "@/lib/script-studio";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function importScriptKeywordImageMatch(
  projectId: string,
  speechIndex: number,
  match: ScriptKeywordImageMatch,
  imageId?: string,
  options?: {
    delayBeforeMs?: number;
    videoFormat?: string | null;
    userId?: string;
    pauseIndex?: number;
  },
): Promise<ScriptKeywordImageMatch> {
  const selectedId = imageId ?? match.selectedId;
  const hit = match.results.find((r) => r.id === selectedId) ?? match.results[0];
  if (!hit) {
    throw new Error(`No image found for keyword "${match.keyword}".`);
  }

  const ext =
    hit.fullUrl.includes(".png") || hit.previewUrl.includes(".png") ? "png" : "jpg";
  const filename =
    options?.pauseIndex !== undefined
      ? `script-pause-p${options.pauseIndex + 1}-${slugify(match.keyword) || createId()}.${ext}`
      : `script-ref-p${speechIndex + 1}-${slugify(match.keyword) || createId()}.${ext}`;
  const buf = await downloadReferenceImageBuffer(
    {
      fullUrl: hit.fullUrl,
      previewUrl: hit.previewUrl,
      provider: hit.provider,
      sourceUrl: hit.sourceUrl,
    },
    { delayBeforeMs: options?.delayBeforeMs ?? 0 },
  );
  const framed = await fitImageBufferToVideoFormat(
    { buffer: buf, ext: `.${ext}` },
    options?.videoFormat,
  );

  if (match.importedUrl?.trim()) {
    await deleteMediaByPublicUrl(match.importedUrl).catch(() => {});
  }

  const importedUrl = await saveBuffer(projectId, null, filename, framed);
  const cachedUrl = withCacheBuster(importedUrl);
  if (options?.userId) {
    const source: MediaLibrarySource =
      hit.provider === "google" || hit.provider === "serper"
        ? "google"
        : hit.provider === "pexels"
          ? "pexels"
          : hit.provider === "wikimedia"
            ? "wikimedia"
            : "script_ref";
    registerMediaLibraryAssetSafe({
      userId: options.userId,
      url: cachedUrl,
      name: match.keyword,
      mimeType: ext === "png" ? "image/png" : "image/jpeg",
      kind: "image",
      source,
      projectId,
    });
  }
  return {
    ...match,
    selectedId: hit.id,
    importedUrl: cachedUrl,
    importedPreviewUrl: cachedUrl,
    importedAt: new Date().toISOString(),
  };
}

export async function importScriptKeywordImageMatches(
  projectId: string,
  speechIndex: number,
  keywords: ScriptKeywordImageMatch[],
  options?: { videoFormat?: string | null; userId?: string; pauseIndex?: number },
): Promise<{ keywords: ScriptKeywordImageMatch[]; importErrors: string[] }> {
  const nextKeywords: ScriptKeywordImageMatch[] = [];
  const importErrors: string[] = [];

  for (const kw of keywords) {
    if (kw.results.length === 0 || kw.importedUrl?.trim()) {
      nextKeywords.push(kw);
      continue;
    }
    const hit = kw.results.find((r) => r.id === kw.selectedId) ?? kw.results[0];
    const delay = hit && referenceImageNeedsThrottle(hit) ? 1400 : 400;
    try {
      nextKeywords.push(
        await importScriptKeywordImageMatch(projectId, speechIndex, kw, undefined, {
          delayBeforeMs: nextKeywords.length > 0 ? delay : 0,
          videoFormat: options?.videoFormat,
          userId: options?.userId,
          pauseIndex: options?.pauseIndex,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      importErrors.push(`${kw.keyword}: ${msg}`);
      nextKeywords.push(kw);
    }
  }

  return { keywords: nextKeywords, importErrors };
}
