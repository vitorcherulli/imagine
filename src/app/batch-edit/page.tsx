import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { PhotoBatchManager, type PhotoBatchSummary } from "@/components/photo-batch/PhotoBatchManager";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";

export const dynamic = "force-dynamic";

export default async function BatchEditPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, batches, items] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.photoBatches)
      .where(eq(schema.photoBatches.userId, userId))
      .orderBy(desc(schema.photoBatches.updatedAt)),
    db
      .select({
        batchId: schema.photoBatchItems.batchId,
        sourceUrl: schema.photoBatchItems.sourceUrl,
        resultUrl: schema.photoBatchItems.resultUrl,
        status: schema.photoBatchItems.status,
        approved: schema.photoBatchItems.approved,
      })
      .from(schema.photoBatchItems)
      .where(eq(schema.photoBatchItems.userId, userId))
      .orderBy(asc(schema.photoBatchItems.position)),
  ]);

  const summaries = new Map<string, PhotoBatchSummary>(
    batches.map((batch) => [batch.id, { batch, coverUrl: null, photos: 0, edited: 0, approved: 0 }]),
  );
  for (const item of items) {
    const s = summaries.get(item.batchId);
    if (!s) continue;
    s.photos += 1;
    if (item.status === "ready") s.edited += 1;
    if (item.approved) s.approved += 1;
    if (!s.coverUrl) s.coverUrl = item.status === "ready" && item.resultUrl ? item.resultUrl : item.sourceUrl;
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <PhotoBatchManager initial={[...summaries.values()]} defaultImageModel={OPENROUTER_MODELS.image} />
      </main>
    </div>
  );
}
