import Link from "next/link";
import { desc, eq, asc, inArray } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectsLibrary } from "@/components/ProjectsLibrary";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { resolveProjectCoverUrl } from "@/lib/project-cover";

export const dynamic = "force-dynamic";

async function loadProjectCovers(projectIds: string[]) {
  if (projectIds.length === 0) {
    return {
      thumbnailByProject: {} as Record<string, string | null | undefined>,
      keyframeByProject: {} as Record<string, string | null>,
      socialSlideByProject: {} as Record<string, string | null>,
    };
  }

  const [youtubeRows, blockRows, socialRows] = await Promise.all([
    db
      .select({
        projectId: schema.youtubeMetadata.projectId,
        thumbnailUrl: schema.youtubeMetadata.thumbnailUrl,
      })
      .from(schema.youtubeMetadata)
      .where(inArray(schema.youtubeMetadata.projectId, projectIds)),
    db
      .select({
        projectId: schema.storyBlocks.projectId,
        keyframeUrl: schema.storyBlocks.keyframeUrl,
        position: schema.storyBlocks.position,
      })
      .from(schema.storyBlocks)
      .where(inArray(schema.storyBlocks.projectId, projectIds))
      .orderBy(asc(schema.storyBlocks.position)),
    db
      .select({
        projectId: schema.socialSlides.projectId,
        imageUrl: schema.socialSlides.imageUrl,
        position: schema.socialSlides.position,
      })
      .from(schema.socialSlides)
      .where(inArray(schema.socialSlides.projectId, projectIds))
      .orderBy(asc(schema.socialSlides.position)),
  ]);

  const thumbnailByProject = Object.fromEntries(
    youtubeRows.map((row) => [row.projectId, row.thumbnailUrl]),
  );

  const keyframeByProject: Record<string, string | null> = {};
  for (const block of blockRows) {
    if (keyframeByProject[block.projectId] || !block.keyframeUrl) continue;
    keyframeByProject[block.projectId] = block.keyframeUrl;
  }

  const socialSlideByProject: Record<string, string | null> = {};
  for (const slide of socialRows) {
    if (socialSlideByProject[slide.projectId] || !slide.imageUrl) continue;
    socialSlideByProject[slide.projectId] = slide.imageUrl;
  }

  return { thumbnailByProject, keyframeByProject, socialSlideByProject };
}

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, folders] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.projectFolders)
      .where(eq(schema.projectFolders.userId, userId))
      .orderBy(asc(schema.projectFolders.position), asc(schema.projectFolders.name)),
  ]);

  const projectIds = projects.map((p) => p.id);
  const { thumbnailByProject, keyframeByProject, socialSlideByProject } =
    await loadProjectCovers(projectIds);

  const coverByProjectId = Object.fromEntries(
    projects.map((project) => [
      project.id,
      resolveProjectCoverUrl({
        thumbnailUrl: thumbnailByProject[project.id],
        anchorImageUrl: project.anchorImageUrl,
        keyframeUrl:
          socialSlideByProject[project.id] ?? keyframeByProject[project.id],
      }),
    ]),
  );

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div>
            <h1 className="text-base font-semibold">Your projects</h1>
            <p className="text-2xs text-muted-foreground">
              Organize by folder, duplicate templates, open recent work.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/projects/new">
              <Button variant="primary" size="md">
                <Plus className="h-3.5 w-3.5" />
                New video
              </Button>
            </Link>
            <Link href="/publications/new">
              <Button variant="outline" size="md">
                <Plus className="h-3.5 w-3.5" />
                New publication
              </Button>
            </Link>
          </div>
        </header>

        <section className="px-5 py-5">
          <ProjectsLibrary
            initialProjects={projects}
            initialFolders={folders}
            coverByProjectId={coverByProjectId}
          />
        </section>
      </main>
    </div>
  );
}
