import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mediaFileExists } from "@/lib/storage";
import { deleteMediaLibraryAsset } from "@/lib/media-library-server";

/** Remove gallery rows whose media file no longer exists on disk/S3. */
export async function pruneBrokenMediaLibraryAssets(userId: string): Promise<number> {
  const assets = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(eq(schema.mediaLibraryAssets.userId, userId));

  let prunedCount = 0;

  for (const asset of assets) {
    if (await mediaFileExists(asset.url)) continue;
    await deleteMediaLibraryAsset(asset.id, userId);
    prunedCount += 1;
  }

  return prunedCount;
}
