import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectDnaDetail } from "@/components/ProjectDnaDetail";
import { loadDnaLinkedProjects, loadProjectDnaForUser } from "@/lib/dna-detail-server";

export const dynamic = "force-dynamic";

export default async function ProjectDnaDetailPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, dna, linked] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    loadProjectDnaForUser(params.id, userId),
    loadDnaLinkedProjects(userId, params.id),
  ]);

  if (!dna) notFound();

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <ProjectDnaDetail
          initialDna={dna}
          linkedProjects={linked.projects}
          coverByProjectId={linked.coverByProjectId}
        />
      </main>
    </div>
  );
}
