import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { PersonSwapManager } from "@/components/person-swap/PersonSwapManager";
import { listSwaps } from "@/lib/person-swap-server";
import { hasPublicMediaUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function PersonSwapPage({
  searchParams,
}: {
  searchParams: { source?: string; name?: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, swaps, avatars, scenarios] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    listSwaps(userId),
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

  const source = searchParams.source?.startsWith("/api/media/")
    ? { url: searchParams.source, name: searchParams.name?.slice(0, 80) ?? "" }
    : null;

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <PersonSwapManager
          initial={swaps}
          avatars={avatars}
          scenarios={scenarios}
          initialSource={source}
          publicMedia={hasPublicMediaUrl()}
        />
      </main>
    </div>
  );
}
