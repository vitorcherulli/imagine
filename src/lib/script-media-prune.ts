import { mediaFileExists } from "@/lib/storage";
import type { ScriptDraftNotes, ScriptKeywordImageMatch } from "@/lib/script-studio";

function isLocalMediaUrl(url: string): boolean {
  const path = url.split("?")[0]?.split("#")[0] ?? "";
  return path.startsWith("/api/media/");
}

async function pruneKeywordMedia(
  keyword: ScriptKeywordImageMatch,
): Promise<{ keyword: ScriptKeywordImageMatch; pruned: boolean }> {
  let pruned = false;
  let importedUrl = keyword.importedUrl?.trim() || undefined;
  let importedPreviewUrl = keyword.importedPreviewUrl?.trim() || undefined;

  if (importedUrl && isLocalMediaUrl(importedUrl) && !(await mediaFileExists(importedUrl))) {
    importedUrl = undefined;
    pruned = true;
  }

  if (
    importedPreviewUrl &&
    isLocalMediaUrl(importedPreviewUrl) &&
    !(await mediaFileExists(importedPreviewUrl))
  ) {
    importedPreviewUrl = undefined;
    pruned = true;
  }

  if (!pruned) return { keyword, pruned: false };

  return {
    keyword: {
      ...keyword,
      importedUrl,
      importedPreviewUrl:
        importedPreviewUrl ??
        (importedUrl && !isLocalMediaUrl(importedUrl) ? importedUrl : undefined),
      importedAt: importedUrl || importedPreviewUrl ? keyword.importedAt : undefined,
    },
    pruned: true,
  };
}

/** Drop script media URLs that no longer exist on disk/S3 (stale imports after deploy). */
export async function pruneBrokenScriptMediaRefs(
  notes: ScriptDraftNotes,
): Promise<{ notes: ScriptDraftNotes; prunedCount: number }> {
  const entries = notes.paragraphImages;
  if (!entries?.length) return { notes, prunedCount: 0 };

  let prunedCount = 0;
  const paragraphImages = [];

  for (const entry of entries) {
    const keywords = [];
    for (const keyword of entry.keywords) {
      const { keyword: next, pruned } = await pruneKeywordMedia(keyword);
      if (pruned) prunedCount += 1;
      keywords.push(next);
    }
    paragraphImages.push({ ...entry, keywords });
  }

  if (prunedCount === 0) return { notes, prunedCount: 0 };

  return {
    notes: { ...notes, paragraphImages },
    prunedCount,
  };
}
