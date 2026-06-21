import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectEditor } from "@/components/ProjectEditor";
import { buildProjectExportItems } from "@/lib/export-history";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) notFound();

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  const [projects, avatars, projectAvatar, projectDna, exportRows] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId))
      .orderBy(desc(schema.avatars.updatedAt)),
    project.avatarId
      ? db
          .select()
          .from(schema.avatars)
          .where(eq(schema.avatars.id, project.avatarId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(schema.projectDna)
      .where(eq(schema.projectDna.userId, userId))
      .orderBy(desc(schema.projectDna.updatedAt)),
    db
      .select()
      .from(schema.exports)
      .where(eq(schema.exports.projectId, project.id))
      .orderBy(asc(schema.exports.createdAt)),
  ]);

  const initialExports = buildProjectExportItems(exportRows, project.title, project.videoFormat);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} activeProjectId={project.id} />
      <ProjectEditor
        project={project}
        initialBlocks={blocks}
        initialExports={initialExports}
        avatars={avatars}
        projectDna={projectDna}
        initialAvatar={projectAvatar}
      />
    </div>
  );
}
