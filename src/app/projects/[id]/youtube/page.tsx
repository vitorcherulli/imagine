import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { getVideoFormatSpec } from "@/lib/video-format";
import { YoutubeEditor } from "@/components/YoutubeEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { reconcileProjectStyleBible } from "@/lib/style-bible-prune";

export const dynamic = "force-dynamic";

export default async function YoutubePage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) notFound();

  const reconciledStyle = await reconcileProjectStyleBible(project);
  const hydratedProject =
    reconciledStyle.prunedCount > 0
      ? {
          ...project,
          styleBible: reconciledStyle.styleBible,
          anchorImageUrl: reconciledStyle.anchorImageUrl,
        }
      : project;

  const [yt, userAvatars] = await Promise.all([
    db
      .select()
      .from(schema.youtubeMetadata)
      .where(eq(schema.youtubeMetadata.projectId, project.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db.select().from(schema.avatars).where(eq(schema.avatars.userId, userId)),
  ]);

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));

  const formatSpec = getVideoFormatSpec(project.videoFormat);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} activeProjectId={project.id} />
      <main className="flex-1 overflow-auto">
        <header className="flex h-12 items-center gap-3 border-b border-border bg-background px-4">
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">
              {project.title} — {formatSpec.id === "vertical" ? "Reels cover" : "YouTube thumbnail"}
            </h1>
            <p className="truncate text-2xs text-muted-foreground">
              Cover ({formatSpec.thumbnailSizeLabel}), titles, description & tags ·{" "}
              {formatSpec.platformHint}
            </p>
          </div>
        </header>
        <section className="px-5 py-5">
          <YoutubeEditor project={hydratedProject} initial={yt ?? null} avatars={userAvatars} />
        </section>
      </main>
    </div>
  );
}
