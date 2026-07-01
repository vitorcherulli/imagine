import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { clampContinuousCutDuration } from "@/lib/cut-pace";
import { isStoryBlockPause } from "@/lib/script-pause";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  afterBlockId: z.string().min(1).optional(),
});

const DEFAULT_VISUAL_PROMPT =
  "New visual cut — edit the scene description in the block panel, then generate or upload a keyframe.";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  let insertAt = blocks.length;
  let anchor = blocks.length > 0 ? blocks[blocks.length - 1]! : null;

  if (parsed.data.afterBlockId) {
    const hit = blocks.find((block) => block.id === parsed.data.afterBlockId);
    if (!hit) {
      return NextResponse.json({ error: "Anchor block not found" }, { status: 404 });
    }
    anchor = hit;
    insertAt = hit.position + 1;
  }

  const durationSeconds = clampContinuousCutDuration(4, project.cutPace);
  const anchorGroup = anchor?.narrationGroupId?.trim() ?? null;
  const narrationGroupId =
    anchor &&
    anchorGroup &&
    !isStoryBlockPause(anchor) &&
    !anchorGroup.toLowerCase().startsWith("pause")
      ? anchorGroup
      : null;

  const now = new Date();
  for (const block of blocks) {
    if (block.position >= insertAt) {
      await db
        .update(schema.storyBlocks)
        .set({ position: block.position + 1, updatedAt: now })
        .where(eq(schema.storyBlocks.id, block.id));
    }
  }

  const row = {
    id: createId(),
    projectId: project.id,
    position: insertAt,
    segmentType: "development" as const,
    narrativeText: "",
    visualPrompt: anchor?.visualPrompt?.trim() || DEFAULT_VISUAL_PROMPT,
    locationTag: anchor?.locationTag ?? null,
    durationSeconds,
    narrationGroupId,
    keyframeUrl: null,
    videoUrl: null,
    videoJobId: null,
    videoPollingUrl: null,
    audioUrl: null,
    audioVolume: anchor?.audioVolume ?? 100,
    sceneAudioUrl: null,
    sceneAudioVolume: anchor?.sceneAudioVolume ?? 60,
    avatarId: anchor?.avatarId ?? null,
    characterName: anchor?.characterName ?? null,
    status: "draft" as const,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.storyBlocks).values(row);

  const nextBlocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  return NextResponse.json({ ok: true, block: row, blocks: nextBlocks });
}
