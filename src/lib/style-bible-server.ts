import { eq, asc } from "drizzle-orm";
import { db, schema } from "./db";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { generateImage } from "./openrouter/images";
import { downloadToFile, saveBase64, withCacheBuster } from "./storage";
import { resolveProjectApiModels } from "./project-api-models";
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

  const characters = project.avatarId
    ? await db.select().from(schema.avatars).where(eq(schema.avatars.id, project.avatarId)).limit(1)
    : [];

  const models = resolveProjectApiModels(project);
  const raw = await chatCompletion({
    messages: [
      { role: "system", content: buildStyleBibleSystemPrompt() },
      {
        role: "user",
        content: buildStyleBibleUserPrompt({
          project,
          characters,
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

  const models = resolveProjectApiModels(project);
  const prompt = buildEditorialReferencePrompt({ project, bible });

  // No avatar refs — editorial board is abstract; avatars belong in scene keyframes only.
  const img = await generateImage({
    prompt,
    model: models.imageModel,
    aspectRatio: "16:9",
    imageSize: "1K",
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
