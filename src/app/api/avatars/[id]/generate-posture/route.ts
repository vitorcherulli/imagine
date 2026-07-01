import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { AVATAR_POSTURE_PRESETS } from "@/lib/avatar-posture-presets";
import { generateAvatarPostureImage } from "@/lib/avatar-posture-generate-server";
import { IMAGE_MODEL_OPTIONS } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  postureId: z.string().optional(),
  customPrompt: z.string().max(800).optional(),
  imageModel: z.string().min(1).max(120).optional(),
});

const PRESET_BY_ID = new Map(AVATAR_POSTURE_PRESETS.map((p) => [p.id, p]));
const IMAGE_MODEL_VALUES = new Set(IMAGE_MODEL_OPTIONS.map((o) => o.value));

async function getOwned(avatarId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.avatars)
    .where(and(eq(schema.avatars.id, avatarId), eq(schema.avatars.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET() {
  return NextResponse.json({ presets: AVATAR_POSTURE_PRESETS });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const custom = parsed.data.customPrompt?.trim();
  const preset = parsed.data.postureId ? PRESET_BY_ID.get(parsed.data.postureId) : undefined;
  const posturePrompt = custom || preset?.prompt;
  if (!posturePrompt) {
    return NextResponse.json(
      { error: "Choose a posture preset or write a custom pose description." },
      { status: 400 },
    );
  }

  const imageModel =
    parsed.data.imageModel && IMAGE_MODEL_VALUES.has(parsed.data.imageModel)
      ? parsed.data.imageModel
      : undefined;

  try {
    const generated = await generateAvatarPostureImage({
      userId,
      avatar: row,
      posture: {
        id: preset?.id ?? "custom",
        prompt: posturePrompt,
      },
      imageModel,
    });

    await db
      .update(schema.avatars)
      .set({
        imageUrls: JSON.stringify(generated.imageUrls),
        primaryImageUrl: generated.primaryImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.avatars.id, row.id));

    const [avatar] = await db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.id, row.id))
      .limit(1);

    return NextResponse.json({
      ok: true,
      avatar,
      imageUrl: generated.imageUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
