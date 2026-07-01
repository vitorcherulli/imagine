import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { reconcileBlockMedia } from "@/lib/block-media-reconcile";
import { reconcileProjectStyleBible } from "@/lib/style-bible-prune";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const styleReconcile = await reconcileProjectStyleBible(project);

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  let prunedCount = 0;
  let repairedCount = 0;
  const nextBlocks = [];

  for (const block of blocks) {
    const { block: reconciled, changed } = await reconcileBlockMedia(project.id, block);
    if (changed) {
      const hadPrune =
        reconciled.keyframeUrl !== block.keyframeUrl ||
        reconciled.videoUrl !== block.videoUrl ||
        reconciled.audioUrl !== block.audioUrl ||
        reconciled.sceneAudioUrl !== block.sceneAudioUrl;
      if (hadPrune) prunedCount += 1;
      if (
        reconciled.keyframeUrl &&
        reconciled.keyframeUrl !== block.keyframeUrl &&
        reconciled.videoUrl === block.videoUrl
      ) {
        repairedCount += 1;
      }
      await db
        .update(schema.storyBlocks)
        .set({
          keyframeUrl: reconciled.keyframeUrl,
          videoUrl: reconciled.videoUrl,
          audioUrl: reconciled.audioUrl,
          sceneAudioUrl: reconciled.sceneAudioUrl,
          status: reconciled.status,
          errorMessage: reconciled.errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(schema.storyBlocks.id, block.id));
    }
    nextBlocks.push(reconciled);
  }

  return NextResponse.json({
    ok: true,
    prunedCount,
    repairedCount,
    prunedStyleBibleImages: styleReconcile.prunedCount,
    blocks: prunedCount > 0 || repairedCount > 0 ? nextBlocks : blocks,
  });
}
