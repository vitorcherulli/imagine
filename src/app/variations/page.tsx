import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { VariationsManager } from "@/components/VariationsManager";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";

export const dynamic = "force-dynamic";

export default async function VariationsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, sets] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.variationSets)
      .where(eq(schema.variationSets.userId, userId))
      .orderBy(desc(schema.variationSets.updatedAt)),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <VariationsManager
          initial={sets}
          defaults={{ imageModel: OPENROUTER_MODELS.image, videoModel: OPENROUTER_MODELS.video }}
        />
      </main>
    </div>
  );
}
