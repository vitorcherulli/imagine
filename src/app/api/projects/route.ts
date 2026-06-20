import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { projectApiModelsSchema, getDefaultApiModels } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    storyDescription: z.string().min(1).max(4000),
    genre: z.string().min(1).max(60),
    visualStyle: z.string().min(1).max(60),
    voiceTone: z.string().min(1).max(60),
    targetDurationSeconds: z.number().int().min(30).max(1800),
    avatarId: z.string().nullable().optional(),
  })
  .merge(projectApiModelsSchema);

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));

  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const id = createId();
  const now = new Date();
  const defaults = getDefaultApiModels();
  const { avatarId, ...rest } = parsed.data;
  await db.insert(schema.projects).values({
    id,
    userId,
    ...rest,
    llmModel: rest.llmModel ?? defaults.llmModel,
    imageModel: rest.imageModel ?? defaults.imageModel,
    videoModel: rest.videoModel ?? defaults.videoModel,
    ttsModel: rest.ttsModel ?? defaults.ttsModel,
    ttsVoice: rest.ttsVoice ?? defaults.ttsVoice,
    avatarId: avatarId ?? null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id });
}
