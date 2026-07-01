import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { z } from "zod";
import { projectApiModelsSchema, getDefaultApiModels } from "@/lib/project-api-models";
import { serializeProjectAvatarIds } from "@/lib/project-avatars";
import { assertOwnedProjectDna } from "@/lib/project-dna-server";
import { getOwnedFolder } from "@/lib/project-library";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  clampSlideCount,
  defaultSlideCount,
  normalizePostFormat,
  normalizePostKind,
} from "@/lib/social-content";
import { normalizeSocialAspectRatio } from "@/lib/social-aspect-ratio";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    projectDnaId: z.string().nullable().optional(),
    storyDescription: z.string().min(1).max(4000),
    genre: z.string().min(1).max(60),
    visualStyle: z.string().min(1).max(60),
    voiceTone: z.string().min(1).max(60),
    postFormat: z.enum(["carousel", "single"]).default("carousel"),
    socialAspectRatio: z.enum(["4:5", "1:1"]).default("4:5"),
    postKind: z
      .enum(["educational", "list", "quote", "promo", "story", "mixed"])
      .default("educational"),
    slideCount: z.number().int().min(1).max(10).optional(),
    socialUseAvatar: z.boolean().default(false),
    scriptLanguage: z.enum(["en", "pt", "es"]).default("en"),
    avatarId: z.string().nullable().optional(),
    avatarIds: z.array(z.string()).optional(),
    folderId: z.string().nullable().optional(),
  })
  .merge(projectApiModelsSchema);

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
  const { avatarId, avatarIds, projectDnaId, socialUseAvatar, ...rest } = parsed.data;

  if (projectDnaId) {
    const dna = await assertOwnedProjectDna(projectDnaId, userId);
    if (!dna) return NextResponse.json({ error: "Invalid project DNA" }, { status: 400 });
  }
  if (parsed.data.folderId) {
    const folder = await getOwnedFolder(parsed.data.folderId, userId);
    if (!folder) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const postFormat = normalizePostFormat(rest.postFormat);
  const slideCount = clampSlideCount(
    rest.slideCount ?? defaultSlideCount(postFormat),
    postFormat,
  );

  const normalizedIds =
    socialUseAvatar ? (avatarIds ?? (avatarId ? [avatarId] : [])) : [];
  const primaryId = socialUseAvatar ? (avatarId ?? normalizedIds[0] ?? null) : null;

  await db.insert(schema.projects).values({
    id,
    userId,
    ...rest,
    contentType: "social",
    postFormat,
    socialAspectRatio: normalizeSocialAspectRatio(rest.socialAspectRatio),
    postKind: normalizePostKind(rest.postKind),
    slideCount,
    socialUseAvatar,
    scriptLanguage: normalizeProjectScriptLanguage(rest.scriptLanguage),
    llmModel: rest.llmModel ?? defaults.llmModel,
    imageModel: rest.imageModel ?? defaults.imageModel,
    videoModel: rest.videoModel ?? defaults.videoModel,
    ttsModel: rest.ttsModel ?? defaults.ttsModel,
    ttsVoice: rest.ttsVoice ?? defaults.ttsVoice,
    avatarId: primaryId,
    avatarIds: serializeProjectAvatarIds(normalizedIds),
    projectDnaId: projectDnaId ?? null,
    folderId: parsed.data.folderId ?? null,
    storyDescription: rest.storyDescription,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id });
}
