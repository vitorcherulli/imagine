import { eq, asc } from "drizzle-orm";
import { db, schema } from "./db";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { generateImage } from "./openrouter/images";
import { downloadToFile, saveBase64, withCacheBuster } from "./storage";
import { resolveProjectApiModels } from "./project-api-models";
import { getAspectRatio } from "./video-format";
import {
  buildEditorialReferencePrompt,
  buildStyleBibleSystemPrompt,
  buildStyleBibleUserPrompt,
  parseStyleBible,
  serializeStyleBible,
  styleBibleSchema,
  type StyleBible,
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

  if (blocks.length === 0) {
    throw new StyleBibleError("Story must exist before generating a style bible");
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
          blockSummaries: blocks.map((b) => ({
            position: b.position,
            segmentType: b.segmentType,
            visualPrompt: b.visualPrompt,
            locationTag: b.locationTag,
          })),
        }),
      },
    ],
    model: models.llmModel,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const parsed = extractJson<Partial<StyleBible>>(raw);
  const validated = styleBibleSchema.safeParse(parsed);
  if (!validated.success) {
    throw new StyleBibleError(
      "LLM returned an invalid style bible: " + JSON.stringify(validated.error.flatten()),
    );
  }

  await db
    .update(schema.projects)
    .set({ styleBible: serializeStyleBible(validated.data), updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  return validated.data;
}

/**
 * Generates an abstract editorial reference (color grade + light + atmosphere).
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
    imageSize: "1K",
    referenceImages: avatarRefs.length > 0 ? avatarRefs : undefined,
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
