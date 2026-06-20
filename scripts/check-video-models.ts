import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

async function main() {
  const projects = await db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      videoModel: schema.projects.videoModel,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .orderBy(desc(schema.projects.createdAt));

  console.log("Projects video_model:");
  for (const p of projects) {
    console.log(`  ${p.title} | ${p.videoModel ?? "(null/default)"} | ${p.id}`);
  }

  const blocks = await db
    .select({
      id: schema.storyBlocks.id,
      projectId: schema.storyBlocks.projectId,
      status: schema.storyBlocks.status,
      videoUrl: schema.storyBlocks.videoUrl,
    })
    .from(schema.storyBlocks);

  const withVideo = blocks.filter((b) => b.videoUrl);
  console.log(`\nBlocks with video: ${withVideo.length} / ${blocks.length}`);
}

main().catch(console.error);
