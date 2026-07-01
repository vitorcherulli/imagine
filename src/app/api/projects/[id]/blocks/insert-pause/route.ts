import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  clampPauseSeconds,
  inheritPauseBlockVisualFields,
  PAUSE_VISUAL_PROMPT,
} from "@/lib/script-pause";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  afterBlockId: z.string().min(1).optional(),
  durationSeconds: z.number().int().min(1).max(20).optional().default(3),
});

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

  const durationSeconds = clampPauseSeconds(parsed.data.durationSeconds ?? 3);
  let insertAt = blocks.length;
  let visualSource = blocks.length > 0 ? blocks[blocks.length - 1]! : null;

  if (parsed.data.afterBlockId) {
    const anchor = blocks.find((block) => block.id === parsed.data.afterBlockId);
    if (!anchor) {
      return NextResponse.json({ error: "Anchor block not found" }, { status: 404 });
    }
    visualSource = anchor;
    insertAt = anchor.position + 1;
  }

  const inheritedVisual = inheritPauseBlockVisualFields(visualSource);

  const now = new Date();
  const pauseCount =
    blocks.filter((block) => block.narrationGroupId?.toLowerCase().startsWith("pause")).length + 1;

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
    visualPrompt: PAUSE_VISUAL_PROMPT,
    locationTag: inheritedVisual.locationTag,
    durationSeconds,
    narrationGroupId: `pause${pauseCount}`,
    keyframeUrl: inheritedVisual.keyframeUrl,
    videoUrl: inheritedVisual.videoUrl,
    videoJobId: inheritedVisual.videoJobId,
    videoPollingUrl: inheritedVisual.videoPollingUrl,
    audioUrl: null,
    audioVolume: 100,
    sceneAudioUrl: null,
    sceneAudioVolume: 60,
    avatarId: null,
    characterName: null,
    status: inheritedVisual.status as "draft",
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
