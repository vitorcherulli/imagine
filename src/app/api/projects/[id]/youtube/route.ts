import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import { buildYoutubeMetadataSystemPrompt } from "@/lib/story-prompts";
import { generateImage } from "@/lib/openrouter/images";
import { downloadToFile, saveBase64 } from "@/lib/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  avatarHintForPrompt,
  avatarReferenceImages,
  fetchAvatarById,
} from "@/lib/avatar-block";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  if (blocks.length === 0) {
    return NextResponse.json({ error: "Generate a story first." }, { status: 400 });
  }

  const timestamps: Array<{ position: number; label: string; startSeconds: number }> = [];
  let elapsed = 0;
  for (const b of blocks) {
    timestamps.push({
      position: b.position,
      label: b.segmentType,
      startSeconds: elapsed,
    });
    elapsed += b.durationSeconds;
  }

  const avatar = await fetchAvatarById(project.avatarId);

  const userPayload = {
    title: project.title,
    storyDescription: project.storyDescription,
    genre: project.genre,
    visualStyle: project.visualStyle,
    voiceTone: project.voiceTone,
    ...(avatar
      ? {
          mainCharacter: {
            name: avatar.name,
            description: avatar.description ?? undefined,
          },
        }
      : {}),
    blocks: blocks.map((b) => ({
      position: b.position,
      segmentType: b.segmentType,
      narrativeText: b.narrativeText,
      durationSeconds: b.durationSeconds,
    })),
    timestamps,
  };

  try {
    const models = resolveProjectApiModels(project);
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildYoutubeMetadataSystemPrompt(!!avatar) },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      model: models.llmModel,
      temperature: 0.85,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{
      titles: string[];
      description: string;
      tags: string[];
      thumbnailPrompt: string;
    }>(raw);

    let thumbnailUrl: string | null = null;
    try {
      const styleHint = project.visualStyle ? `Visual style: ${project.visualStyle}. ` : "";
      const avatarHint = avatarHintForPrompt(avatar);
      const referenceImages = await avatarReferenceImages(avatar);
      const img = await generateImage({
        prompt: `${styleHint}${parsed.thumbnailPrompt}${avatarHint}`,
        model: models.imageModel,
        aspectRatio: "16:9",
        imageSize: "1K",
        referenceImages,
      });
      if (img.url) {
        thumbnailUrl = await downloadToFile(
          img.url,
          project.id,
          null,
          "thumbnail.png",
        );
      } else if (img.b64) {
        thumbnailUrl = await saveBase64(project.id, null, "thumbnail.png", img.b64);
      }
    } catch (e) {
      console.error("Thumbnail generation failed:", e);
    }

    const [existing] = await db
      .select()
      .from(schema.youtubeMetadata)
      .where(eq(schema.youtubeMetadata.projectId, project.id))
      .limit(1);

    const now = new Date();
    if (existing) {
      await db
        .update(schema.youtubeMetadata)
        .set({
          thumbnailUrl: thumbnailUrl ?? existing.thumbnailUrl,
          titleOptions: JSON.stringify(parsed.titles ?? []),
          selectedTitle: existing.selectedTitle ?? (parsed.titles?.[0] ?? null),
          description: parsed.description ?? "",
          tags: JSON.stringify(parsed.tags ?? []),
          updatedAt: now,
        })
        .where(eq(schema.youtubeMetadata.id, existing.id));
    } else {
      await db.insert(schema.youtubeMetadata).values({
        id: createId(),
        projectId: project.id,
        thumbnailUrl,
        titleOptions: JSON.stringify(parsed.titles ?? []),
        selectedTitle: parsed.titles?.[0] ?? null,
        description: parsed.description ?? "",
        tags: JSON.stringify(parsed.tags ?? []),
        createdAt: now,
        updatedAt: now,
      });
    }

    const [yt] = await db
      .select()
      .from(schema.youtubeMetadata)
      .where(eq(schema.youtubeMetadata.projectId, project.id))
      .limit(1);

    return NextResponse.json({ youtube: yt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "YouTube metadata failed" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  selectedTitle: z.string().max(200).optional(),
  description: z.string().max(8000).optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "No metadata yet" }, { status: 404 });

  await db
    .update(schema.youtubeMetadata)
    .set({
      ...(parsed.data.selectedTitle !== undefined ? { selectedTitle: parsed.data.selectedTitle } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.tags !== undefined ? { tags: JSON.stringify(parsed.data.tags) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.youtubeMetadata.id, existing.id));

  return NextResponse.json({ ok: true });
}
