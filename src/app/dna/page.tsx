import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectDnaManager } from "@/components/ProjectDnaManager";

export const dynamic = "force-dynamic";

export default async function ProjectDnaPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, projectDna] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.projectDna)
      .where(eq(schema.projectDna.userId, userId))
      .orderBy(desc(schema.projectDna.updatedAt)),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <ProjectDnaManager initial={projectDna} />
      </main>
    </div>
  );
}
