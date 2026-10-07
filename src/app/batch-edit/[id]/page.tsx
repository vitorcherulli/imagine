import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { PhotoBatchEditor } from "@/components/photo-batch/PhotoBatchEditor";
import {
  getOwnedPhotoBatch,
  listPhotoBatchItems,
  resolvePhotoBatchModel,
} from "@/lib/photo-batch-server";

export const dynamic = "force-dynamic";

export default async function PhotoBatchPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) notFound();

  const [projects, items] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    listPhotoBatchItems(batch.id),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <PhotoBatchEditor
          initialBatch={batch}
          initialItems={items}
          initialImageModel={resolvePhotoBatchModel(batch)}
        />
      </main>
    </div>
  );
}
