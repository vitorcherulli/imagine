/**
 * Bulk-import existing ad creatives into the Creatives library from a JSON manifest.
 * Codes and versions come from the manifest; files already imported (same originalName) are skipped.
 *
 * Usage: npx tsx --env-file=.env.local scripts/import-creatives.ts path/to/manifest.json
 *
 * Manifest:
 * {
 *   "userId": "user_…",
 *   "baseDir": "/abs/dir/with/files",
 *   "items": [
 *     { "file": "a.png", "originalName": "A1 - Old name.png", "code": 1, "version": 1,
 *       "product": "OMNI", "angle": "AllChatsOnePlace", "hook": "…", "format": "IMG",
 *       "creator": "", "language": "PT" }
 *   ]
 * }
 */

import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { creativeCode, isCreativeFormat } from "../src/lib/creatives";
import { createCreativeFromBuffer, mimeFromName } from "../src/lib/creatives-server";

type ManifestItem = {
  file: string;
  originalName?: string;
  code: number;
  version?: number;
  product: string;
  angle: string;
  hook?: string;
  format: string;
  creator?: string;
  language?: string;
};

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: tsx --env-file=.env.local scripts/import-creatives.ts manifest.json");
    process.exit(1);
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    userId: string;
    baseDir?: string;
    items: ManifestItem[];
  };
  const baseDir = manifest.baseDir ?? path.dirname(path.resolve(manifestPath));

  let added = 0;
  for (const item of manifest.items) {
    const originalName = item.originalName ?? path.basename(item.file);
    const [existing] = await db
      .select({ id: schema.creatives.id })
      .from(schema.creatives)
      .where(
        and(eq(schema.creatives.userId, manifest.userId), eq(schema.creatives.originalName, originalName)),
      );
    if (existing) {
      console.log(`skip  ${originalName} (already imported)`);
      continue;
    }
    const mimeType = mimeFromName(item.file);
    if (!mimeType || !isCreativeFormat(item.format)) {
      console.warn(`skip  ${originalName} (unsupported file or format)`);
      continue;
    }
    const creative = await createCreativeFromBuffer({
      userId: manifest.userId,
      buffer: await fs.readFile(path.resolve(baseDir, item.file)),
      mimeType,
      originalName,
      placement: { mode: "size", code: item.code, version: item.version ?? 1 },
      source: "import",
      meta: {
        product: item.product,
        angle: item.angle,
        hook: item.hook,
        format: item.format,
        creator: item.creator,
        language: item.language,
      },
    });
    added += 1;
    console.log(
      `added ${creativeCode(creative.code)} v${creative.version} ${creative.aspectRatio}  ← ${originalName}`,
    );
  }
  console.log(`\n${added} added, ${manifest.items.length - added} skipped`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
