import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { projectApiModelsSchema } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";

async function getProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  const [yt] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);

  const avatar = project.avatarId
    ? (
        await db
          .select()
          .from(schema.avatars)
          .where(eq(schema.avatars.id, project.avatarId))
          .limit(1)
      )[0] ?? null
    : null;

  return NextResponse.json({ project, blocks, youtube: yt ?? null, avatar });
}

const patchSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    storyDescription: z.string().min(1).max(4000).optional(),
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    voiceTone: z.string().optional(),
    targetDurationSeconds: z.number().int().min(30).max(1800).optional(),
    status: z.string().optional(),
    avatarId: z.string().nullable().optional(),
    musicPrompt: z.string().min(1).max(1500).nullable().optional(),
    musicVolume: z.number().int().min(0).max(100).optional(),
    narrationVolume: z.number().int().min(0).max(100).optional(),
    sceneVolume: z.number().int().min(0).max(100).optional(),
    masterVolume: z.number().int().min(0).max(100).optional(),
  })
  .merge(projectApiModelsSchema);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db
    .update(schema.projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
  return NextResponse.json({ ok: true });
}
