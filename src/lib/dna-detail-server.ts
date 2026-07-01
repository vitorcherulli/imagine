import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Project, ProjectDna } from "@/lib/db/schema";
import { resolveProjectCoverUrl } from "@/lib/project-cover";

export async function loadProjectDnaForUser(
  dnaId: string,
  userId: string,
): Promise<ProjectDna | null> {
  const [row] = await db
    .select()
    .from(schema.projectDna)
    .where(and(eq(schema.projectDna.id, dnaId), eq(schema.projectDna.userId, userId)))
    .limit(1);
  return row ?? null;
}

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

export async function loadDnaLinkedProjects(
  userId: string,
  dnaId: string,
): Promise<{ projects: Project[]; coverByProjectId: Record<string, string | null> }> {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.userId, userId), eq(schema.projects.projectDnaId, dnaId)))
    .orderBy(desc(schema.projects.updatedAt));

  const projectIds = projects.map((p) => p.id);
  const { thumbnailByProject, keyframeByProject, socialSlideByProject } =
    await loadProjectCovers(projectIds);

  const coverByProjectId = Object.fromEntries(
    projects.map((project) => [
      project.id,
      resolveProjectCoverUrl({
        thumbnailUrl: thumbnailByProject[project.id],
        anchorImageUrl: project.anchorImageUrl,
        keyframeUrl: socialSlideByProject[project.id] ?? keyframeByProject[project.id],
      }),
    ]),
  );

  return { projects, coverByProjectId };
}
