import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { CreativesManager } from "@/components/creatives/CreativesManager";
import { loadCreativeLibrary } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, library] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    loadCreativeLibrary(userId),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <CreativesManager initial={library} />
      </main>
    </div>
  );
}
