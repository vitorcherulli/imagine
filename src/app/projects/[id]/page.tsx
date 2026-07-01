import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectEditor } from "@/components/ProjectEditor";
import { buildProjectExportItems } from "@/lib/export-history";
import { pruneBrokenBlocksMedia } from "@/lib/block-media-prune";
import { reconcileProjectStyleBible } from "@/lib/style-bible-prune";

export const dynamic = "force-dynamic";

async function loadProjectBlocks(projectId: string) {
  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, projectId))
    .orderBy(asc(schema.storyBlocks.position));

  const { blocks: prunedBlocks, prunedCount } = await pruneBrokenBlocksMedia(blocks);
  if (prunedCount === 0) return blocks;

  await Promise.all(
    prunedBlocks.map(async (block, index) => {
      const before = blocks[index];
      if (
        before.keyframeUrl === block.keyframeUrl &&
        before.videoUrl === block.videoUrl &&
        before.audioUrl === block.audioUrl &&
        before.sceneAudioUrl === block.sceneAudioUrl
      ) {
        return;
      }
      await db
        .update(schema.storyBlocks)
        .set({
          keyframeUrl: block.keyframeUrl,
          videoUrl: block.videoUrl,
          audioUrl: block.audioUrl,
          sceneAudioUrl: block.sceneAudioUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.storyBlocks.id, block.id));
    }),
  );

  return prunedBlocks;
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
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

  const blocks = await loadProjectBlocks(hydratedProject.id);

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

  const [yt] = await db
    .select({
      thumbnailUrl: schema.youtubeMetadata.thumbnailUrl,
      selectedTitle: schema.youtubeMetadata.selectedTitle,
      description: schema.youtubeMetadata.description,
    })
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);

  const initialExports = buildProjectExportItems(exportRows, project.title, project.videoFormat);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} activeProjectId={hydratedProject.id} />
      <ProjectEditor
        project={hydratedProject}
        initialBlocks={blocks}
        initialExports={initialExports}
        initialYoutubeMetadata={yt ?? null}
        avatars={avatars}
        projectDna={projectDna}
        initialAvatar={projectAvatar}
      />
    </div>
  );
}
