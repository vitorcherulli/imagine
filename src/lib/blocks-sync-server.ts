import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { StoryBlock } from "@/lib/db/schema";
import { pickBlockSyncFields, serializeBlocksForSync } from "@/lib/blocks-history";
import { deleteBlockMedia } from "@/lib/storage";

export async function syncProjectBlocksFromSnapshot(
  projectId: string,
  incoming: StoryBlock[],
): Promise<StoryBlock[]> {
  const normalized = serializeBlocksForSync(incoming);
  const targetIds = new Set(normalized.map((block) => block.id));
  const now = new Date();

  const current = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, projectId))
    .orderBy(asc(schema.storyBlocks.position));

  for (const block of current) {
    if (targetIds.has(block.id)) continue;
    await deleteBlockMedia(projectId, block.id);
    await db.delete(schema.storyBlocks).where(eq(schema.storyBlocks.id, block.id));
  }

  for (const block of normalized) {
    const existing = current.find((item) => item.id === block.id);
    const syncFields = pickBlockSyncFields(block);

    if (existing) {
      await db
        .update(schema.storyBlocks)
        .set({ ...syncFields, updatedAt: now })
        .where(eq(schema.storyBlocks.id, block.id));
      continue;
    }

    await db.insert(schema.storyBlocks).values({
      id: block.id,
      projectId,
      ...syncFields,
      createdAt: block.createdAt ?? now,
      updatedAt: now,
    });
  }

  return db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, projectId))
    .orderBy(asc(schema.storyBlocks.position));
}

export async function getOwnedProjectBlocks(
  projectId: string,
  userId: string,
): Promise<StoryBlock[] | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  return db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, projectId))
    .orderBy(asc(schema.storyBlocks.position));
}
