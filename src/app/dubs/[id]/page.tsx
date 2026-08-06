import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { DubbingEditor } from "@/components/DubbingEditor";
import { isDubbingProject, projectEditorHref } from "@/lib/social-content";
import {
  getDubProjectForUser,
  getDubSource,
  listDubSegments,
} from "@/lib/dubbing/helpers";
import {
  ensureDubTracksMigrated,
  listDubSegmentLocales,
} from "@/lib/dubbing/tracks";

export const dynamic = "force-dynamic";

export default async function DubbingProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, project] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    getDubProjectForUser(params.id, userId),
  ]);

  if (!project) {
    const [candidate] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, params.id))
      .limit(1);
    if (candidate && !isDubbingProject(candidate)) {
      redirect(projectEditorHref(candidate));
    }
    notFound();
  }

  const segments = await listDubSegments(params.id);
  const [source, renders, tracks, locales] = await Promise.all([
    getDubSource(params.id),
    db
      .select()
      .from(schema.dubbingRenders)
      .where(eq(schema.dubbingRenders.projectId, params.id))
      .orderBy(desc(schema.dubbingRenders.createdAt)),
    ensureDubTracksMigrated(project, segments),
    listDubSegmentLocales(params.id),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} activeProjectId={params.id} />
      <main className="flex-1 overflow-auto">
        <DubbingEditor
          project={project}
          initialSource={source}
          initialSegments={segments}
          initialTracks={tracks}
          initialLocales={locales}
          initialRenders={renders}
        />
      </main>
    </div>
  );
}
