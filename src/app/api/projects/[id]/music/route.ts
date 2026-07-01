import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { generateMusic } from "@/lib/openrouter/music";
import { defaultMusic2TimelineStartSeconds } from "@/lib/music-duration-mismatch";
import { normalizeMusicStartSeconds } from "@/lib/music-timeline";
import { saveBuffer, deleteMediaByPublicUrl, withCacheBuster } from "@/lib/storage";
import { buildMusicPromptDefault } from "@/lib/story-prompts";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { getMediaDurationSeconds } from "@/lib/ffmpeg";
import { resolveMediaPath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const bodySchema = z.object({
  prompt: z.string().min(1).max(1500).optional(),
  slot: z.enum(["1", "2"]).optional().default("1"),
  music2TimelineStartSeconds: z.number().min(0).max(600).optional(),
});

async function getProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function inferMusic2TimelineStart(project: typeof schema.projects.$inferSelect) {
  if (!project.musicUrl?.trim()) return 0;
  try {
    const seconds = await getMediaDurationSeconds(await resolveMediaPath(project.musicUrl));
    return defaultMusic2TimelineStartSeconds(
      seconds,
      normalizeMusicStartSeconds(project.musicStartSeconds),
    );
  } catch {
    return 0;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const slot = parsed.data.slot;
  const isSecond = slot === "2";

  if (isSecond && !project.musicUrl?.trim()) {
    return NextResponse.json({ error: "Add a primary music track first." }, { status: 400 });
  }

  const resolvedIdentity = await resolveProjectIdentityForProject(project);
  const requestedPrompt = parsed.data.prompt?.trim();
  const prompt =
    requestedPrompt && requestedPrompt.length > 0
      ? requestedPrompt
      : (
          (isSecond ? project.music2Prompt : project.musicPrompt) ??
          buildMusicPromptDefault(project, resolvedIdentity || undefined)
        ).trim();

  if (isSecond) {
    if (project.music2Url) await deleteMediaByPublicUrl(project.music2Url);
    const music2TimelineStartSeconds =
      parsed.data.music2TimelineStartSeconds ??
      (await inferMusic2TimelineStart(project));

    await db
      .update(schema.projects)
      .set({
        music2Status: "generating",
        music2Prompt: prompt,
        music2Url: null,
        music2TimelineStartSeconds,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    void generateAndSaveMusic2(project.id, prompt);
    return NextResponse.json({
      ok: true,
      status: "generating",
      prompt,
      slot: 2,
      music2TimelineStartSeconds,
    });
  }

  if (project.musicUrl) {
    await deleteMediaByPublicUrl(project.musicUrl);
  }

  await db
    .update(schema.projects)
    .set({
      musicStatus: "generating",
      musicPrompt: prompt,
      musicUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  void generateAndSaveMusic1(project.id, prompt);
  return NextResponse.json({ ok: true, status: "generating", prompt, slot: 1 });
}

async function generateAndSaveMusic1(projectId: string, prompt: string) {
  try {
    const result = await generateMusic({ prompt, format: "wav" });
    const ext = result.format === "mp3" ? "mp3" : "wav";
    const filename = `music-${Date.now()}.${ext}`;
    const savedUrl = await saveBuffer(projectId, "_music", filename, result.buffer);
    const musicUrl = withCacheBuster(savedUrl);
    await db
      .update(schema.projects)
      .set({ musicUrl, musicStatus: "ready", updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  } catch (err) {
    await db
      .update(schema.projects)
      .set({ musicStatus: "error", updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
    console.error("[music]", err);
  }
}

async function generateAndSaveMusic2(projectId: string, prompt: string) {
  try {
    const result = await generateMusic({ prompt, format: "wav" });
    const ext = result.format === "mp3" ? "mp3" : "wav";
    const filename = `music2-${Date.now()}.${ext}`;
    const savedUrl = await saveBuffer(projectId, "_music", filename, result.buffer);
    const music2Url = withCacheBuster(savedUrl);
    await db
      .update(schema.projects)
      .set({ music2Url, music2Status: "ready", updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  } catch (err) {
    await db
      .update(schema.projects)
      .set({ music2Status: "error", updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
    console.error("[music2]", err);
  }
}

const patchSchema = z.object({
  musicPrompt: z.string().min(1).max(1500).optional(),
  musicVolume: z.number().int().min(0).max(100).optional(),
  musicStartSeconds: z.number().min(0).max(600).optional(),
  musicSpanSeconds: z.number().min(1).max(600).nullable().optional(),
  musicUrl: z.string().nullable().optional(),
  musicStatus: z.enum(["none", "generating", "ready", "error"]).optional(),
  music2Prompt: z.string().min(1).max(1500).optional(),
  music2Url: z.string().nullable().optional(),
  music2Status: z.enum(["none", "generating", "ready", "error"]).optional(),
  music2TimelineStartSeconds: z.number().min(0).max(600).nullable().optional(),
  music2FileStartSeconds: z.number().min(0).max(600).optional(),
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slot = req.nextUrl.searchParams.get("slot");
  if (slot === "2") {
    if (project.music2Url) await deleteMediaByPublicUrl(project.music2Url);
    await db
      .update(schema.projects)
      .set({
        music2Url: null,
        music2Status: "none",
        music2Prompt: null,
        music2TimelineStartSeconds: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));
    return NextResponse.json({ ok: true, slot: 2 });
  }

  if (project.musicUrl) await deleteMediaByPublicUrl(project.musicUrl);
  if (project.music2Url) await deleteMediaByPublicUrl(project.music2Url);
  await db
    .update(schema.projects)
    .set({
      musicUrl: null,
      musicStatus: "none",
      music2Url: null,
      music2Status: "none",
      music2Prompt: null,
      music2TimelineStartSeconds: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ ok: true });
}
