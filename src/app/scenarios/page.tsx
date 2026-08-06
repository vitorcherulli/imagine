import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ScenariosManager } from "@/components/ScenariosManager";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, scenarios] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
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
        <ScenariosManager initial={scenarios} />
      </main>
    </div>
  );
}
