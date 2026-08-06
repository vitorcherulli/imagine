import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getBlockForUser } from "@/lib/block-helpers";
import { deleteBlockMedia } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ block: owned.block });
}

const patchSchema = z.object({
  narrativeText: z.string().max(8000).optional(),
  visualPrompt: z.string().max(2000).optional(),
  durationSeconds: z.number().int().min(1).max(60).optional(),
  position: z.number().int().min(0).optional(),
  segmentType: z.enum(["intro", "development", "climax", "resolution"]).optional(),
  audioVolume: z.number().int().min(0).max(100).optional(),
  sceneAudioVolume: z.number().int().min(0).max(100).optional(),
  avatarId: z.union([z.string().max(64), z.null()]).optional(),
  characterName: z.union([z.string().max(120), z.null()]).optional(),
  scenarioId: z.union([z.string().max(64), z.null()]).optional(),
  videoTimelineStart: z.number().min(0).max(86400).nullable().optional(),
  narrationTimelineStart: z.number().min(0).max(86400).nullable().optional(),
  sceneTimelineStart: z.number().min(0).max(86400).nullable().optional(),
  videoShotCount: z.number().int().min(1).max(4).optional(),
  videoCameraAngle: z
    .enum([
      "auto",
      "eye_level",
      "low_angle",
      "high_angle",
      "aerial",
      "pov",
      "ots",
      "close_up",
      "wide",
    ])
    .optional(),
  keyframeFitMode: z.enum(["contain", "cover"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db
    .update(schema.storyBlocks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.storyBlocks.id, params.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteBlockMedia(owned.block.projectId, owned.block.id);
  await db.delete(schema.storyBlocks).where(eq(schema.storyBlocks.id, params.id));
  return NextResponse.json({ ok: true });
}
