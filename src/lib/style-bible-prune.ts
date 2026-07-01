import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mediaFileExists } from "@/lib/storage";
import {
  parseStyleBibleDocument,
  serializeStyleBibleDocument,
  STYLE_BIBLE_FIELD_KEYS,
  type StyleBibleBlockImages,
  type StyleBibleDocument,
} from "@/lib/style-bible";
import type { Project } from "@/lib/db/schema";

function isLocalMediaUrl(url: string): boolean {
  const path = url.split("?")[0]?.split("#")[0] ?? "";
  return path.startsWith("/api/media/");
}

async function pruneMediaUrl(
  url: string | null | undefined,
): Promise<{ url: string | null | undefined; pruned: boolean }> {
  const trimmed = url?.trim();
  if (!trimmed || !isLocalMediaUrl(trimmed)) {
    return { url: trimmed || url, pruned: false };
  }
  if (await mediaFileExists(trimmed)) {
    return { url: trimmed, pruned: false };
  }
  return { url: null, pruned: true };
}

/** Drop editorial block image URLs that no longer exist on disk/S3. */
export async function pruneStyleBibleDocument(
  doc: StyleBibleDocument,
): Promise<{ doc: StyleBibleDocument; prunedCount: number }> {
  let prunedCount = 0;
  const blockImages: StyleBibleBlockImages = { ...doc.blockImages };

  for (const key of STYLE_BIBLE_FIELD_KEYS) {
    const raw = blockImages[key];
    if (!raw) continue;
    const { url, pruned } = await pruneMediaUrl(raw);
    if (!pruned) continue;
    prunedCount += 1;
    if (url) blockImages[key] = url;
    else delete blockImages[key];
  }

  return {
    doc: { fields: doc.fields, blockImages },
    prunedCount,
  };
}

/** Prune stale style-bible block images and legacy anchor URL; persist when changed. */
export async function reconcileProjectStyleBible(
  project: Pick<Project, "id" | "styleBible" | "anchorImageUrl">,
): Promise<{
  styleBible: string | null;
  anchorImageUrl: string | null;
  prunedCount: number;
}> {
  const parsed = parseStyleBibleDocument(project.styleBible);
  let prunedCount = 0;
  let nextStyleBible = project.styleBible;
  let nextAnchor = project.anchorImageUrl;

  if (parsed) {
    const { doc, prunedCount: docPruned } = await pruneStyleBibleDocument(parsed);
    if (docPruned > 0) {
      prunedCount += docPruned;
      nextStyleBible = serializeStyleBibleDocument(doc);
    }
  }

  const { url: anchor, pruned: anchorPruned } = await pruneMediaUrl(project.anchorImageUrl);
  if (anchorPruned) {
    prunedCount += 1;
    nextAnchor = anchor ?? null;
  }

  if (prunedCount > 0) {
    await db
      .update(schema.projects)
      .set({
        styleBible: nextStyleBible,
        anchorImageUrl: nextAnchor,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));
  }

  return {
    styleBible: nextStyleBible,
    anchorImageUrl: nextAnchor,
    prunedCount,
  };
}
