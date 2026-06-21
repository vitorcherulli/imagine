import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { generateMusic } from "@/lib/openrouter/music";
import { saveBuffer, deleteMediaByPublicUrl } from "@/lib/storage";
import { buildMusicPromptDefault } from "@/lib/story-prompts";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const bodySchema = z.object({
  prompt: z.string().min(1).max(1500).optional(),
});

async function getProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const resolvedIdentity = await resolveProjectIdentityForProject(project);
  const prompt =
    (
      parsed.data.prompt ??
      project.musicPrompt ??
      buildMusicPromptDefault(project, resolvedIdentity || undefined)
    ).trim();

  await db
    .update(schema.projects)
    .set({
      musicStatus: "generating",
      musicPrompt: prompt,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  void (async () => {
    try {
      const result = await generateMusic({ prompt, format: "wav" });
      const filename = `music.${result.format === "mp3" ? "mp3" : "wav"}`;
      const url = await saveBuffer(project.id, "_music", filename, result.buffer);
      await db
        .update(schema.projects)
        .set({
          musicUrl: url,
          musicStatus: "ready",
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, project.id));
    } catch (err) {
      await db
        .update(schema.projects)
        .set({
          musicStatus: "error",
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, project.id));
      console.error("[music]", err);
    }
  })();

  return NextResponse.json({ ok: true, status: "generating", prompt });
}

const patchSchema = z.object({
  musicPrompt: z.string().min(1).max(1500).optional(),
  musicVolume: z.number().int().min(0).max(100).optional(),
  musicUrl: z.string().nullable().optional(),
  musicStatus: z.enum(["none", "generating", "ready", "error"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
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

  if (project.musicUrl) await deleteMediaByPublicUrl(project.musicUrl);
  await db
    .update(schema.projects)
    .set({ musicUrl: null, musicStatus: "none", updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ ok: true });
}
