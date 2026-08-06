import { eq, asc } from "drizzle-orm";
import { db, schema } from "./db";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { generateImage } from "./openrouter/images";
import {
  downloadToFile,
  saveBase64,
  withCacheBuster,
  deleteMediaByPublicUrl,
  readImageAsDataUrl,
  mediaFileExists,
} from "./storage";
import { resolveProjectApiModels } from "./project-api-models";
import { getAspectRatio } from "./video-format";
import {
  buildEditorialBlockReferencePrompt,
  buildEditorialReferencePrompt,
  buildStyleBibleSystemPrompt,
  buildStyleBibleUserPrompt,
  listEditorialBlockImageUrls,
  mergeStyleBible,
  emptyStyleBible,
  normalizeStyleBibleFromLlm,
  parseStyleBible,
  parseStyleBibleDocument,
  serializeStyleBibleDocument,
  STYLE_BIBLE_FIELDS,
  STYLE_BIBLE_FIELD_KEYS,
  styleBibleSchema,
  type StyleBible,
  type StyleBibleBlockImages,
  type StyleBibleDocument,
  type StyleBibleFieldKey,
} from "./style-bible";
import type { Project } from "./db/schema";
import { resolveProjectIdentityForProject } from "./project-dna-server";
import {
  avatarReferenceImages,
  fetchAvatarById,
} from "./avatar-block";

export class StyleBibleError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StyleBibleError";
  }
}

async function reloadProject(projectId: string): Promise<Project> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) throw new StyleBibleError("Project not found");
  return project;
}

function normalizeLocationTag(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || null;
}

export async function generateAndSaveStyleBible(
  project: Project,
): Promise<StyleBible> {
  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  const blockSummaries =
    blocks.length > 0
      ? blocks.map((b) => ({
          position: b.position,
          segmentType: b.segmentType,
          visualPrompt: b.visualPrompt,
          locationTag: b.locationTag,
        }))
      : project.scriptDraft?.trim()
        ? [
            {
              position: 1,
              segmentType: "script",
              visualPrompt: project.scriptDraft.trim().slice(0, 4000),
              locationTag: null as string | null,
            },
          ]
        : null;

  if (!blockSummaries) {
    throw new StyleBibleError(
      "Generate the story on the timeline first, or write a script draft, before creating the editorial line",
    );
  }

  const primaryCharacter = project.avatarId ? await fetchAvatarById(project.avatarId) : null;
  const resolvedIdentity = await resolveProjectIdentityForProject(project);

  const models = resolveProjectApiModels(project);
  const raw = await chatCompletion({
    messages: [
      {
        role: "system",
        content: buildStyleBibleSystemPrompt(primaryCharacter?.name ?? null),
      },
      {
        role: "user",
        content: buildStyleBibleUserPrompt({
          project,
          characters: primaryCharacter ? [primaryCharacter] : [],
          primaryCharacter,
          resolvedIdentity: resolvedIdentity || undefined,
          blockSummaries,
        }),
      },
    ],
    model: models.llmModel,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const parsed = normalizeStyleBibleFromLlm(extractJson(raw));
  const validated = styleBibleSchema.safeParse(parsed);
  if (!validated.success) {
    throw new StyleBibleError(
      "LLM returned an invalid style bible: " + JSON.stringify(validated.error.flatten()),
    );
  }

  const existingDoc = parseStyleBibleDocument(project.styleBible);
  await db
    .update(schema.projects)
    .set({
      styleBible: serializeStyleBibleDocument({
        fields: validated.data,
        blockImages: existingDoc?.blockImages ?? {},
      }),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  return validated.data;
}

export async function generateAllEditorialBlockReferences(
  projectId: string,
  bible: StyleBible,
): Promise<{
  blockImages: StyleBibleBlockImages;
  errors: Partial<Record<StyleBibleFieldKey, string>>;
}> {
  let project = await reloadProject(projectId);
  const blockImages: StyleBibleBlockImages = {};
  const errors: Partial<Record<StyleBibleFieldKey, string>> = {};

  for (const field of STYLE_BIBLE_FIELD_KEYS) {
    if (!bible[field]?.trim()) continue;
    try {
      const result = await generateAndSaveEditorialBlockImage(project, field, bible);
      blockImages[field] = result.imageUrl;
      project = await reloadProject(projectId);
    } catch (err) {
      errors[field] = err instanceof Error ? err.message : String(err);
    }
  }

  return { blockImages, errors };
}

function editorialBlockFileName(field: StyleBibleFieldKey): string {
  return `editorial_${field}.png`;
}

export async function generateAndSaveEditorialBlockImage(
  project: Project,
  field: StyleBibleFieldKey,
  bibleOverride?: StyleBible,
): Promise<{ field: StyleBibleFieldKey; imageUrl: string; prompt: string }> {
  const freshProject = await reloadProject(project.id);
  const doc = parseStyleBibleDocument(freshProject.styleBible);
  const bible = bibleOverride ?? doc?.fields ?? parseStyleBible(freshProject.styleBible);
  if (!bible) {
    throw new StyleBibleError("Style bible must exist before generating block references");
  }

  const fieldMeta = STYLE_BIBLE_FIELDS.find((item) => item.key === field);
  const fieldText = bible[field]?.trim();
  if (!fieldText) {
    throw new StyleBibleError(`Fill in "${fieldMeta?.label ?? field}" before generating its reference`);
  }

  const primaryCharacter = freshProject.avatarId
    ? await fetchAvatarById(freshProject.avatarId)
    : null;
  const models = resolveProjectApiModels(freshProject);
  const prompt = buildEditorialBlockReferencePrompt({
    field,
    fieldLabel: fieldMeta?.label ?? field,
    fieldText,
    project: freshProject,
    bible,
    primaryCharacter,
  });
  const avatarRefs = (await avatarReferenceImages(primaryCharacter)) ?? [];

  const img = await generateImage({
    prompt,
    model: models.imageModel,
    aspectRatio: getAspectRatio(freshProject.videoFormat),
    personReferenceImages: avatarRefs.length > 0 ? avatarRefs : undefined,
  });

  let url: string;
  if (img.url) {
    url = await downloadToFile(img.url, freshProject.id, null, editorialBlockFileName(field));
  } else if (img.b64) {
    url = await saveBase64(freshProject.id, null, editorialBlockFileName(field), img.b64);
  } else {
    throw new StyleBibleError("Image API returned no editorial block reference data");
  }

  const cacheBusted = withCacheBuster(url);
  if (!(await mediaFileExists(url))) {
    throw new StyleBibleError(
      "Editorial reference file was not stored. Check S3/disk storage on the server.",
    );
  }
  const currentDoc = doc ?? { fields: bible, blockImages: {} };
  const previousUrl = currentDoc.blockImages[field];
  if (previousUrl) await deleteMediaByPublicUrl(previousUrl).catch(() => {});

  const nextDoc: StyleBibleDocument = {
    fields: currentDoc.fields,
    blockImages: { ...currentDoc.blockImages, [field]: cacheBusted },
  };

  await db
    .update(schema.projects)
    .set({
      styleBible: serializeStyleBibleDocument(nextDoc),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, freshProject.id));

  return { field, imageUrl: cacheBusted, prompt };
}

export async function deleteEditorialBlock(
  project: Project,
  field: StyleBibleFieldKey,
): Promise<StyleBibleDocument> {
  const doc = parseStyleBibleDocument(project.styleBible) ?? {
    fields: emptyStyleBible(),
    blockImages: {},
  };

  const imageUrl = doc.blockImages[field];
  if (imageUrl) await deleteMediaByPublicUrl(imageUrl).catch(() => {});

  const nextFields = { ...doc.fields, [field]: "" };
  const nextImages = { ...doc.blockImages };
  delete nextImages[field];

  const nextDoc: StyleBibleDocument = {
    fields: nextFields,
    blockImages: nextImages,
  };

  await db
    .update(schema.projects)
    .set({
      styleBible: serializeStyleBibleDocument(nextDoc),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  return nextDoc;
}

export async function loadEditorialReferenceDataUrls(
  project: Pick<Project, "styleBible" | "anchorImageUrl">,
): Promise<string[]> {
  const doc = parseStyleBibleDocument(project.styleBible);
  const urls = listEditorialBlockImageUrls(doc, project.anchorImageUrl);
  const loaded = await Promise.all(
    urls.map(async (url) => {
      try {
        return await readImageAsDataUrl(url);
      } catch {
        return null;
      }
    }),
  );
  return loaded.filter((item): item is string => Boolean(item));
}

export async function saveStyleBibleDocument(
  projectId: string,
  doc: StyleBibleDocument,
): Promise<StyleBibleDocument> {
  await db
    .update(schema.projects)
    .set({
      styleBible: serializeStyleBibleDocument(doc),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, projectId));
  return doc;
}

/**
 * @deprecated Prefer per-block editorial references via generateAndSaveEditorialBlockImage.
 * Stored in anchorImageUrl for backwards compatibility with existing UI/DB column.
 */
export async function generateAndSaveAnchor(
  project: Project,
  bibleOverride?: StyleBible,
): Promise<{ anchorImageUrl: string; prompt: string }> {
  const bible = bibleOverride ?? parseStyleBible(project.styleBible);
  if (!bible) {
    throw new StyleBibleError("Style bible must exist before generating the editorial reference");
  }

  const primaryCharacter = project.avatarId ? await fetchAvatarById(project.avatarId) : null;
  const models = resolveProjectApiModels(project);
  const prompt = buildEditorialReferencePrompt({ project, bible, primaryCharacter });
  const avatarRefs = (await avatarReferenceImages(primaryCharacter)) ?? [];

  const img = await generateImage({
    prompt,
    model: models.imageModel,
    aspectRatio: getAspectRatio(project.videoFormat),
    personReferenceImages: avatarRefs.length > 0 ? avatarRefs : undefined,
  });

  let url: string;
  if (img.url) {
    url = await downloadToFile(img.url, project.id, null, "editorial_ref.png");
  } else if (img.b64) {
    url = await saveBase64(project.id, null, "editorial_ref.png", img.b64);
  } else {
    throw new StyleBibleError("Image API returned no editorial reference data");
  }

  const cacheBusted = withCacheBuster(url);
  await db
    .update(schema.projects)
    .set({
      anchorImageUrl: cacheBusted,
      anchorImagePrompt: prompt,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  return { anchorImageUrl: cacheBusted, prompt };
}

export { normalizeLocationTag };
