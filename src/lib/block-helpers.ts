import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Project, StoryBlock } from "./db/schema";

export async function getLatestBlock(blockId: string): Promise<StoryBlock | null> {
  const [b] = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.id, blockId))
    .limit(1);
  return b ?? null;
}

export async function getBlockForUser(
  blockId: string,
  userId: string,
): Promise<{ block: StoryBlock; project: Project } | null> {
  const rows = await db
    .select({ block: schema.storyBlocks, project: schema.projects })
    .from(schema.storyBlocks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.storyBlocks.projectId))
    .where(
      and(eq(schema.storyBlocks.id, blockId), eq(schema.projects.userId, userId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { block: row.block, project: row.project };
}

export async function setBlockStatus(
  blockId: string,
  patch: Partial<StoryBlock>,
): Promise<void> {
  await db
    .update(schema.storyBlocks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.storyBlocks.id, blockId));
}
