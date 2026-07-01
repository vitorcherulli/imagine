import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { SocialPublicationEditor } from "@/components/SocialPublicationEditor";
import { isSocialProject } from "@/lib/social-content";
import { getSocialPublicationForUser } from "@/lib/publication-server";

export const dynamic = "force-dynamic";

export default async function PublicationPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, data] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    getSocialPublicationForUser(params.id, userId),
  ]);

  if (!data) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, params.id))
      .limit(1);
    if (project && !isSocialProject(project)) {
      redirect(`/projects/${params.id}`);
    }
    notFound();
  }

  let dnaName: string | null = null;
  if (data.project.projectDnaId) {
    const [dna] = await db
      .select({ name: schema.projectDna.name })
      .from(schema.projectDna)
      .where(eq(schema.projectDna.id, data.project.projectDnaId))
      .limit(1);
    dnaName = dna?.name ?? null;
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} activeProjectId={params.id} />
      <main className="flex-1 overflow-auto">
        <section className="px-5 py-5">
          <SocialPublicationEditor
            project={data.project}
            initialSlides={data.slides}
            initialMetadata={data.metadata}
            dnaName={dnaName}
          />
        </section>
      </main>
    </div>
  );
}
