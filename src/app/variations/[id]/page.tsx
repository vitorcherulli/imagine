import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { VariationSetDetail } from "@/components/VariationSetDetail";
import {
  getOwnedVariationSet,
  listVariationItems,
  resolveVariationModels,
} from "@/lib/variations-server";

export const dynamic = "force-dynamic";

export default async function VariationSetPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const set = await getOwnedVariationSet(params.id, userId);
  if (!set) notFound();

  const [projects, items] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    listVariationItems(set.id),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <VariationSetDetail
          initialSet={set}
          initialItems={items}
          initialModels={resolveVariationModels(set)}
        />
      </main>
    </div>
  );
}
