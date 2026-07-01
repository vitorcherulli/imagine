import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { projectApiModelsSchema } from "@/lib/project-api-models";
import {
  serializeTtsVoiceSettings,
} from "@/lib/elevenlabs-voice-settings";
import { serializeProjectAvatarIds } from "@/lib/project-avatars";
import { assertOwnedProjectDna } from "@/lib/project-dna-server";
import { getOwnedFolder } from "@/lib/project-library";
import { deleteProjectMedia } from "@/lib/storage";

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
    projectDnaId: z.string().nullable().optional(),
    storyDescription: z.string().min(1).max(4000).optional(),
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    voiceTone: z.string().optional(),
    targetDurationSeconds: z.number().int().min(30).max(1800).optional(),
    videoFormat: z.enum(["horizontal", "vertical"]).optional(),
    cutPace: z.enum(["calm", "balanced", "dynamic", "hyper"]).optional(),
    narrationMode: z.enum(["continuous"]).optional(),
    scriptLanguage: z.enum(["en", "pt", "es"]).optional(),
    status: z.string().optional(),
    avatarId: z.string().nullable().optional(),
    avatarIds: z.array(z.string()).optional(),
    musicPrompt: z.string().min(1).max(1500).nullable().optional(),
    musicVolume: z.number().int().min(0).max(100).optional(),
    musicStartSeconds: z.number().min(0).max(600).optional(),
    musicSpanSeconds: z.number().min(1).max(600).nullable().optional(),
    narrationVolume: z.number().int().min(0).max(100).optional(),
    sceneVolume: z.number().int().min(0).max(100).optional(),
    masterVolume: z.number().int().min(0).max(100).optional(),
    ttsSpeed: z.number().min(0.75).max(1.35).optional(),
    ttsVoiceSettings: z
      .object({
        elevenLabs: z
          .object({
            stability: z.number().min(0).max(1).optional(),
            similarityBoost: z.number().min(0).max(1).optional(),
            style: z.number().min(0).max(1).optional(),
            speakerBoost: z.boolean().optional(),
          })
          .optional(),
        kokoro: z
          .object({
            expressiveness: z.enum(["subtle", "natural", "expressive"]).optional(),
          })
          .optional(),
      })
      .optional(),
    captionMode: z
      .enum(["off", "bottom", "center", "bottom-karaoke", "center-karaoke"])
      .optional(),
    previewMode: z.enum(["auto", "proxy", "keyframe", "full", "off"]).optional(),
    folderId: z.string().nullable().optional(),
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

  if (parsed.data.projectDnaId) {
    const dna = await assertOwnedProjectDna(parsed.data.projectDnaId, userId);
    if (!dna) return NextResponse.json({ error: "Invalid project DNA" }, { status: 400 });
  }

  if (parsed.data.folderId) {
    const folder = await getOwnedFolder(parsed.data.folderId, userId);
    if (!folder) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.ttsVoiceSettings !== undefined) {
    patch.ttsVoiceSettings = serializeTtsVoiceSettings(parsed.data.ttsVoiceSettings);
  }
  if (parsed.data.avatarIds !== undefined) {
    patch.avatarIds = serializeProjectAvatarIds(parsed.data.avatarIds);
    if (parsed.data.avatarId === undefined) {
      patch.avatarId = parsed.data.avatarIds[0] ?? null;
    }
  }

  await db
    .update(schema.projects)
    .set(patch)
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteProjectMedia(project.id);
  await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
  return NextResponse.json({ ok: true });
}
