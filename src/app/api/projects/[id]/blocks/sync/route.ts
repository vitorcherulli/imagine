import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import {
  getOwnedProjectBlocks,
  syncProjectBlocksFromSnapshot,
} from "@/lib/blocks-sync-server";
import type { StoryBlock } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const blockSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional(),
  position: z.number().int().min(0),
  segmentType: z.string().min(1),
  narrativeText: z.string(),
  visualPrompt: z.string(),
  locationTag: z.string().nullable().optional(),
  durationSeconds: z.number().int().min(1).max(120),
  narrationGroupId: z.string().nullable().optional(),
  keyframeUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  videoJobId: z.string().nullable().optional(),
  videoPollingUrl: z.string().nullable().optional(),
  audioUrl: z.string().nullable().optional(),
  audioVolume: z.number().int().min(0).max(100),
  sceneAudioUrl: z.string().nullable().optional(),
  sceneAudioVolume: z.number().int().min(0).max(100),
  avatarId: z.string().nullable().optional(),
  characterName: z.string().nullable().optional(),
  status: z.string().min(1),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

const bodySchema = z.object({
  blocks: z.array(blockSchema).max(500),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getOwnedProjectBlocks(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const blocks = parsed.data.blocks.map(
    (block) =>
      ({
        ...block,
        projectId: params.id,
      }) as StoryBlock,
  );

  const nextBlocks = await syncProjectBlocksFromSnapshot(params.id, blocks);
  return NextResponse.json({ ok: true, blocks: nextBlocks });
}
