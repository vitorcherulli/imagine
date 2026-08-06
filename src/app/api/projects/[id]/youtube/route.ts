import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import { getAspectRatio } from "@/lib/video-format";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import { buildYoutubeMetadataSystemPrompt } from "@/lib/story-prompts";
import { generateImage } from "@/lib/openrouter/images";
import { downloadToFile, saveBase64, deleteMediaByPublicUrl, mediaFileExists } from "@/lib/storage";
import { resolveProjectApiModels, imageModelSupportsPersonReferencePhotos } from "@/lib/project-api-models";
import {
  avatarReferenceImages,
  fetchAvatarById,
} from "@/lib/avatar-block";
import { buildCoverImagePrompt, buildCoverScenePrompt } from "@/lib/thumbnail-cover";
import { normalizeThumbnailMode, type ThumbnailMode } from "@/lib/thumbnail-mode";
import type { Project } from "@/lib/db/schema";
import { normalizeProjectIdentity } from "@/lib/project-identity";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const postSchema = z.object({
  thumbnailMode: z.enum(["with_title", "image_only"]).optional(),
  scope: z.enum(["all", "thumbnail", "metadata"]).optional(),
  avatarId: z.string().nullable().optional(),
});

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

async function resolveCoverAvatarOptional(
  project: Project,
  userId: string,
  preferredId?: string | null,
): Promise<Awaited<ReturnType<typeof fetchAvatarById>>> {
  if (!preferredId) return null;
  const picked = await fetchAvatarById(preferredId);
  if (picked && picked.userId === userId) return picked;
  return null;
}

async function generateThumbnailUrl(
  project: Project,
  basePrompt: string,
  thumbnailMode: ThumbnailMode,
  selectedTitle: string | null | undefined,
  avatar: Awaited<ReturnType<typeof fetchAvatarById>>,
): Promise<string | null> {
  const models = resolveProjectApiModels(project);
  const avatarRefs = avatar ? ((await avatarReferenceImages(avatar)) ?? []) : [];
  const attachAvatarRefs =
    avatarRefs.length > 0 && imageModelSupportsPersonReferencePhotos(models.imageModel);
  const prompt = buildCoverImagePrompt({
    basePrompt,
    avatar: attachAvatarRefs ? avatar : null,
    visualStyle: project.visualStyle,
    thumbnailMode,
    selectedTitle,
  });

  console.info(
    `[youtube] cover gen avatar=${avatar?.name ?? "none"} refs=${attachAvatarRefs ? avatarRefs.length : 0}`,
  );

  const img = await generateImage({
    prompt,
    model: models.imageModel,
    aspectRatio: getAspectRatio(project.videoFormat),
    ...(attachAvatarRefs
      ? { personReferenceImages: avatarRefs, referenceImagesFirst: true }
      : {}),
  });

  if (img.url) {
    const saved = await downloadToFile(img.url, project.id, null, "thumbnail.png");
    if (!(await mediaFileExists(saved))) {
      throw new Error("Cover image was not stored on the server. Check S3/disk storage.");
    }
    return saved;
  }
  if (img.b64) {
    const saved = await saveBase64(project.id, null, "thumbnail.png", img.b64);
    if (!(await mediaFileExists(saved))) {
      throw new Error("Cover image was not stored on the server. Check S3/disk storage.");
    }
    return saved;
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof postSchema> = {};
  try {
    const raw = await req.json();
    const parsed = postSchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // empty body is fine — defaults apply
  }

  const scope = body.scope ?? "all";
  const thumbnailMode = normalizeThumbnailMode(body.thumbnailMode);

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  if (blocks.length === 0) {
    return NextResponse.json({ error: "Generate a story first." }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);

  // Thumbnail-only regeneration
  if (scope === "thumbnail") {
    try {
      const mode = body.thumbnailMode
        ? thumbnailMode
        : normalizeThumbnailMode(existing?.thumbnailMode);
      const coverAvatar = await resolveCoverAvatarOptional(
        project,
        userId,
        body.avatarId ?? existing?.coverAvatarId ?? null,
      );
      const scenePrompt = buildCoverScenePrompt({
        project,
        blocks,
        storedThumbnailPrompt: existing?.thumbnailPrompt,
        avatar: coverAvatar,
      });
      const thumbnailUrl = await generateThumbnailUrl(
        project,
        scenePrompt,
        mode,
        existing?.selectedTitle,
        coverAvatar,
      );
      if (!thumbnailUrl) {
        throw new Error("A geração da capa não retornou imagem.");
      }
      const now = new Date();
      if (existing) {
        await db
          .update(schema.youtubeMetadata)
          .set({
            thumbnailUrl,
            thumbnailMode: mode,
            coverAvatarId: coverAvatar?.id ?? null,
            updatedAt: now,
          })
          .where(eq(schema.youtubeMetadata.id, existing.id));
      }
      const [yt] = await db
        .select()
        .from(schema.youtubeMetadata)
        .where(eq(schema.youtubeMetadata.projectId, project.id))
        .limit(1);
      return NextResponse.json({ youtube: yt });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Thumbnail generation failed" },
        { status: 500 },
      );
    }
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

  const coverAvatar =
    scope !== "metadata"
      ? await resolveCoverAvatarOptional(
          project,
          userId,
          body.avatarId !== undefined
            ? body.avatarId
            : (existing?.coverAvatarId ?? null),
        )
      : null;

  const resolvedIdentity = await resolveProjectIdentityForProject(project);

  const userPayload = {
    title: project.title,
    ...(resolvedIdentity ? { projectIdentity: resolvedIdentity } : {}),
    storyDescription: project.storyDescription,
    genre: project.genre,
    visualStyle: project.visualStyle,
    voiceTone: project.voiceTone,
    videoFormat: project.videoFormat ?? "horizontal",
    ...(coverAvatar
      ? {
          mainCharacter: {
            name: coverAvatar.name,
            description: coverAvatar.description ?? undefined,
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
    outputLanguage: "en",
  };

  try {
    const models = resolveProjectApiModels(project);
    let parsed: {
      titles: string[];
      description: string;
      tags: string[];
      thumbnailPrompt: string;
    } | null = null;

    if (scope !== "metadata") {
      const raw = await chatCompletion({
        messages: [
          {
            role: "system",
            content: buildYoutubeMetadataSystemPrompt(
              !!coverAvatar,
              project.videoFormat,
              thumbnailMode,
              normalizeProjectScriptLanguage(project.scriptLanguage),
            ),
          },
          { role: "user", content: JSON.stringify(userPayload, null, 2) },
        ],
        model: models.llmModel,
        temperature: 0.85,
        response_format: { type: "json_object" },
      });
      parsed = extractJson(raw);
    }

    let thumbnailUrl: string | null = existing?.thumbnailUrl ?? null;
    let thumbnailPrompt = existing?.thumbnailPrompt ?? null;

    if (scope !== "metadata" && parsed?.thumbnailPrompt) {
      thumbnailPrompt = parsed.thumbnailPrompt;
      try {
        const titleForThumb = existing?.selectedTitle ?? parsed.titles?.[0] ?? null;
        const scenePrompt = buildCoverScenePrompt({
          project,
          blocks,
          storedThumbnailPrompt: parsed.thumbnailPrompt,
          avatar: coverAvatar,
        });
        thumbnailUrl = await generateThumbnailUrl(
          project,
          scenePrompt,
          thumbnailMode,
          titleForThumb,
          coverAvatar,
        );
        if (!thumbnailUrl) {
          throw new Error("Cover generation returned no image.");
        }
      } catch (e) {
        console.error("Thumbnail generation failed:", e);
        if (scope === "all") {
          return NextResponse.json(
            {
              error: e instanceof Error ? e.message : "Cover generation failed.",
            },
            { status: 500 },
          );
        }
      }
    }

    const now = new Date();
    if (existing) {
      await db
        .update(schema.youtubeMetadata)
        .set({
          ...(scope !== "metadata" && parsed
            ? {
                thumbnailUrl: thumbnailUrl ?? existing.thumbnailUrl,
                thumbnailPrompt: thumbnailPrompt ?? existing.thumbnailPrompt,
                thumbnailMode,
                coverAvatarId: coverAvatar?.id ?? existing.coverAvatarId ?? null,
                titleOptions: JSON.stringify(parsed.titles ?? []),
                description: parsed.description ?? existing.description,
                tags: JSON.stringify(parsed.tags ?? []),
                selectedTitle: existing.selectedTitle ?? parsed.titles?.[0] ?? null,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(schema.youtubeMetadata.id, existing.id));
    } else if (parsed) {
      await db.insert(schema.youtubeMetadata).values({
        id: createId(),
        projectId: project.id,
        thumbnailUrl,
        thumbnailPrompt,
        thumbnailMode,
        coverAvatarId: coverAvatar?.id ?? null,
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
      { error: err instanceof Error ? err.message : "Metadata generation failed" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  selectedTitle: z.string().max(200).optional(),
  description: z.string().max(8000).optional(),
  tags: z.array(z.string()).optional(),
  thumbnailMode: z.enum(["with_title", "image_only"]).optional(),
  coverAvatarId: z.string().nullable().optional(),
});

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [existing] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "No metadata yet" }, { status: 404 });

  if (existing.thumbnailUrl) await deleteMediaByPublicUrl(existing.thumbnailUrl);

  const now = new Date();
  await db
    .update(schema.youtubeMetadata)
    .set({ thumbnailUrl: null, updatedAt: now })
    .where(eq(schema.youtubeMetadata.id, existing.id));

  const [yt] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, project.id))
    .limit(1);

  return NextResponse.json({ youtube: yt });
}

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
      ...(parsed.data.thumbnailMode !== undefined
        ? { thumbnailMode: parsed.data.thumbnailMode }
        : {}),
      ...(parsed.data.coverAvatarId !== undefined
        ? { coverAvatarId: parsed.data.coverAvatarId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.youtubeMetadata.id, existing.id));

  return NextResponse.json({ ok: true });
}
