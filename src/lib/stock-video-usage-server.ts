import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export interface StockVideoUsageEntry {
  blockId: string;
  position: number;
}

export type StockVideoUsageMap = Record<string, StockVideoUsageEntry>;

export async function listProjectStockVideoUsage(projectId: string): Promise<StockVideoUsageMap> {
  const rows = await db
    .select({
      stockVideoId: schema.storyBlocks.stockVideoId,
      blockId: schema.storyBlocks.id,
      position: schema.storyBlocks.position,
    })
    .from(schema.storyBlocks)
    .where(
      and(
        eq(schema.storyBlocks.projectId, projectId),
        isNotNull(schema.storyBlocks.stockVideoId),
      ),
    );

  const usage: StockVideoUsageMap = {};
  for (const row of rows) {
    const id = row.stockVideoId?.trim();
    if (!id) continue;
    usage[id] = { blockId: row.blockId, position: row.position };
  }
  return usage;
}
