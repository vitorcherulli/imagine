import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getBlockForUser } from "@/lib/block-helpers";
import { buildDuplicateStoryBlock } from "@/lib/block-duplicate-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, owned.project.id))
    .orderBy(asc(schema.storyBlocks.position));

  const insertAt = owned.block.position + 1;
  const now = new Date();

  for (const block of blocks) {
    if (block.position >= insertAt) {
      await db
        .update(schema.storyBlocks)
        .set({ position: block.position + 1, updatedAt: now })
        .where(eq(schema.storyBlocks.id, block.id));
    }
  }

  const row = await buildDuplicateStoryBlock({
    projectId: owned.project.id,
    source: owned.block,
    insertAt,
    allBlocks: blocks,
  });

  await db.insert(schema.storyBlocks).values(row);

  const nextBlocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, owned.project.id))
    .orderBy(asc(schema.storyBlocks.position));

  return NextResponse.json({ ok: true, block: row, blocks: nextBlocks });
}
