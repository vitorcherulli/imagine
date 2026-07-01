import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { projectApiModelsSchema, getDefaultApiModels } from "@/lib/project-api-models";
import { serializeProjectAvatarIds } from "@/lib/project-avatars";
import { assertOwnedProjectDna } from "@/lib/project-dna-server";
import { getOwnedFolder } from "@/lib/project-library";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    projectDnaId: z.string().nullable().optional(),
    storyDescription: z.string().min(1).max(4000),
    genre: z.string().min(1).max(60),
    visualStyle: z.string().min(1).max(60),
    voiceTone: z.string().min(1).max(60),
    targetDurationSeconds: z.number().int().min(30).max(1800),
    videoFormat: z.enum(["horizontal", "vertical"]).default("horizontal"),
    cutPace: z.enum(["calm", "balanced", "dynamic", "hyper"]).default("balanced"),
    narrationMode: z.enum(["continuous"]).default("continuous"),
    scriptLanguage: z.enum(["en", "pt", "es"]).default("en"),
    avatarId: z.string().nullable().optional(),
    avatarIds: z.array(z.string()).optional(),
    folderId: z.string().nullable().optional(),
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
  const { avatarId, avatarIds, projectDnaId, ...rest } = parsed.data;
  if (projectDnaId) {
    const dna = await assertOwnedProjectDna(projectDnaId, userId);
    if (!dna) return NextResponse.json({ error: "Invalid project DNA" }, { status: 400 });
  }
  if (parsed.data.folderId) {
    const folder = await getOwnedFolder(parsed.data.folderId, userId);
    if (!folder) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  const normalizedIds = avatarIds ?? (avatarId ? [avatarId] : []);
  const primaryId = avatarId ?? normalizedIds[0] ?? null;
  await db.insert(schema.projects).values({
    id,
    userId,
    ...rest,
    llmModel: rest.llmModel ?? defaults.llmModel,
    imageModel: rest.imageModel ?? defaults.imageModel,
    videoModel: rest.videoModel ?? defaults.videoModel,
    ttsModel: rest.ttsModel ?? defaults.ttsModel,
    ttsVoice: rest.ttsVoice ?? defaults.ttsVoice,
    avatarId: primaryId,
    avatarIds: serializeProjectAvatarIds(normalizedIds),
    projectDnaId: projectDnaId ?? null,
    folderId: parsed.data.folderId ?? null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id });
}
