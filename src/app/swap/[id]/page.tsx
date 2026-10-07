import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { PersonSwapDetail } from "@/components/person-swap/PersonSwapDetail";
import { getOwnedSwap, listSwapItems } from "@/lib/person-swap-server";

export const dynamic = "force-dynamic";

export default async function PersonSwapDetailPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const swap = await getOwnedSwap(params.id, userId);
  if (!swap) notFound();

  const [projects, items, avatars, scenarios] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    listSwapItems(swap.id),
    db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId))
      .orderBy(desc(schema.avatars.updatedAt)),
    db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.userId, userId))
      .orderBy(desc(schema.scenarios.updatedAt)),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <PersonSwapDetail initialSwap={swap} initialItems={items} avatars={avatars} scenarios={scenarios} />
      </main>
    </div>
  );
}
