import { z } from "zod";
import type { Avatar, Project, StoryBlock } from "./db/schema";
import { normalizeProjectIdentity } from "./project-identity";
import { visualStylePromptCue } from "./project-creative-options";
import {
  ENGLISH_ONLY_GENERATION_LINE,
  ENGLISH_VISUAL_PROMPT_LINE,
} from "./generation-language";

export interface StyleBible {
  colorPalette: string;
  lighting: string;
  atmosphere: string;
  world: string;
  cinematography: string;
  timeOfDay: string;
}

export const STYLE_BIBLE_FIELDS: Array<{
  key: keyof StyleBible;
  label: string;
  hint: string;
  rows: number;
}> = [
  {
    key: "colorPalette",
    label: "Color palette",
    hint: "3–5 dominant colors with intent (e.g. deep teal, warm amber, shadow plum, ivory mist)",
    rows: 2,
  },
  {
    key: "lighting",
    label: "Lighting",
    hint: "key light, mood, contrast — applies across ALL locations (e.g. soft golden rim light, volumetric rays)",
    rows: 2,
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    hint: "haze, particles, weather, mood shared by the whole film",
    rows: 2,
  },
  {
    key: "world",
    label: "Visual universe",
    hint: "recurring motifs, props, texture language — NOT one fixed place (e.g. bioluminescent accents, spiral stone motifs, worn fairy-tale realism)",
    rows: 3,
  },
  {
    key: "cinematography",
    label: "Cinematography",
    hint: "framing, lens, depth (e.g. anamorphic 2.39:1, shallow DoF, 35mm vintage glass)",
    rows: 2,
  },
  {
    key: "timeOfDay",
    label: "Time of day",
    hint: "overall time-feel for the film (perpetual dusk, blue hour, etc.) — individual scenes may vary slightly",
    rows: 1,
  },
];

export type StyleBibleFieldKey = keyof StyleBible;

export type StyleBibleBlockImages = Partial<Record<StyleBibleFieldKey, string>>;

export interface StyleBibleDocument {
  fields: StyleBible;
  blockImages: StyleBibleBlockImages;
}

export const STYLE_BIBLE_FIELD_KEYS = [
  "colorPalette",
  "lighting",
  "atmosphere",
  "world",
  "cinematography",
  "timeOfDay",
] as const satisfies readonly StyleBibleFieldKey[];

export const styleBibleFieldKeySchema = z.enum([
  "colorPalette",
  "lighting",
  "atmosphere",
  "world",
  "cinematography",
  "timeOfDay",
]);

export const styleBibleBlockImagesSchema = z
  .object({
    colorPalette: z.string().min(1).optional(),
    lighting: z.string().min(1).optional(),
    atmosphere: z.string().min(1).optional(),
    world: z.string().min(1).optional(),
    cinematography: z.string().min(1).optional(),
    timeOfDay: z.string().min(1).optional(),
  })
  .partial();

export const styleBibleSchema = z.object({
  colorPalette: z.string().min(1).max(600),
  lighting: z.string().min(1).max(600),
  atmosphere: z.string().min(1).max(600),
  world: z.string().min(1).max(800),
  cinematography: z.string().min(1).max(600),
  timeOfDay: z.string().min(1).max(200),
});

export const styleBiblePartialSchema = styleBibleSchema.partial();

export const styleBibleDocumentSchema = z.object({
  fields: styleBiblePartialSchema,
  blockImages: styleBibleBlockImagesSchema.optional().default({}),
});

/** @deprecated use parseStyleBibleDocument */
export function parseStyleBible(raw: string | null | undefined): StyleBible | null {
  return parseStyleBibleDocument(raw)?.fields ?? null;
}

export function parseStyleBibleDocument(
  raw: string | null | undefined,
): StyleBibleDocument | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "fields" in parsed) {
      const doc = styleBibleDocumentSchema.safeParse(parsed);
      if (!doc.success) return null;
      return {
        fields: mergeStyleBible(null, doc.data.fields),
        blockImages: doc.data.blockImages ?? {},
      };
    }
    const flat = styleBibleSchema.safeParse(parsed);
    if (flat.success) {
      return { fields: flat.data, blockImages: {} };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeStyleBibleDocument(doc: StyleBibleDocument): string {
  return JSON.stringify({
    v: 2,
    fields: doc.fields,
    blockImages: doc.blockImages,
  });
}

export function listEditorialBlockImageUrls(
  doc: StyleBibleDocument | null,
  legacyAnchorUrl?: string | null,
): string[] {
  const urls = doc
    ? STYLE_BIBLE_FIELD_KEYS.map((key) => doc.blockImages[key]).filter(
        (url): url is string => Boolean(url),
      )
    : [];
  if (urls.length === 0 && legacyAnchorUrl) return [legacyAnchorUrl];
  return urls;
}

export function serializeStyleBible(
  bible: StyleBible,
  blockImages: StyleBibleBlockImages = {},
): string {
  return serializeStyleBibleDocument({ fields: bible, blockImages });
}

export function mergeStyleBible(
  current: StyleBible | null,
  patch: Partial<StyleBible>,
): StyleBible {
  const base = current ?? emptyStyleBible();
  return {
    colorPalette: patch.colorPalette ?? base.colorPalette,
    lighting: patch.lighting ?? base.lighting,
    atmosphere: patch.atmosphere ?? base.atmosphere,
    world: patch.world ?? base.world,
    cinematography: patch.cinematography ?? base.cinematography,
    timeOfDay: patch.timeOfDay ?? base.timeOfDay,
  };
}

export function emptyStyleBible(): StyleBible {
  return {
    colorPalette: "",
    lighting: "",
    atmosphere: "",
    world: "",
    cinematography: "",
    timeOfDay: "",
  };
}

const STYLE_BIBLE_LLM_KEY_ALIASES: Record<string, StyleBibleFieldKey> = {
  color_palette: "colorPalette",
  colorPalette: "colorPalette",
  lighting: "lighting",
  atmosphere: "atmosphere",
  world: "world",
  visual_universe: "world",
  cinematography: "cinematography",
  time_of_day: "timeOfDay",
  timeOfDay: "timeOfDay",
};

/** Map LLM JSON (camelCase or snake_case) into partial style bible fields. */
export function normalizeStyleBibleFromLlm(raw: unknown): Partial<StyleBible> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<StyleBible> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const field = STYLE_BIBLE_LLM_KEY_ALIASES[key];
    if (!field) continue;
    const trimmed = value.trim();
    if (trimmed) out[field] = trimmed;
  }
  return out;
}

/** Human-readable label from a snake_case location tag. */
export function formatLocationTag(tag: string | null | undefined): string | null {
  if (!tag?.trim()) return null;
  return tag
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Editorial line injected as prefix in every scene image / video prompt.
 * Fixes palette, light and film language — not geography.
 */
export function formatStyleBibleForPrompt(bible: StyleBible | null): string {
  if (!bible) return "";
  const lines = [
    "[Editorial line — same film look across every scene; each scene has its own location]",
    `Color palette: ${bible.colorPalette}.`,
    `Lighting: ${bible.lighting}.`,
    `Atmosphere: ${bible.atmosphere}.`,
    `Visual universe (motifs, textures): ${bible.world}.`,
    `Cinematography: ${bible.cinematography}.`,
    `Overall time feel: ${bible.timeOfDay}.`,
  ];
  return lines.join("\n") + "\n\n";
}

export function buildStyleBibleSystemPrompt(primaryCharacterName?: string | null): string {
  const lines = [
    "You are a senior art director defining the EDITORIAL LINE for a short narrative video with MULTIPLE different locations.",
    "Given a project brief and the story blocks, produce ONE style bible that every scene must follow for LOOK — not for geography.",
    "Output a JSON object with EXACTLY these string fields:",
    "  colorPalette  — 3 to 5 dominant colors with intent, comma-separated",
    "  lighting      — lighting recipe that can apply across different sets",
    "  atmosphere    — haze/particles/weather/mood for the whole film",
    "  world         — visual universe: recurring motifs, props, texture language (NOT a single fixed location)",
    "  cinematography — framing/lens/depth-of-field language",
    "  timeOfDay     — overall time-feel phrase for the film",
    "Constraints:",
    ENGLISH_ONLY_GENERATION_LINE,
    ENGLISH_VISUAL_PROMPT_LINE,
    "- Each field must be a SINGLE plain-text string, no nesting, no arrays, no quotes inside, no newlines.",
    "- The story has SEVERAL different environments — the bible unifies how they LOOK, not WHERE they are.",
    "- Be specific and visually rich — these strings will be injected verbatim into every image prompt.",
    "- Respond ONLY with the JSON object, no prose.",
  ];
  if (primaryCharacterName) {
    lines.splice(
      9,
      0,
      `- This project stars ONE main character: "${primaryCharacterName}". The editorial line MUST harmonize palette, lighting and wardrobe styling with that character's look (skin tone, hair, outfit vibe, persona).`,
      `- Use primary_character notes from the brief — do not invent a different persona.`,
    );
  }
  return lines.join("\n");
}

export function buildStyleBibleUserPrompt(input: {
  project: Pick<
    Project,
    | "title"
    | "projectIdentity"
    | "storyDescription"
    | "genre"
    | "visualStyle"
    | "voiceTone"
    | "videoFormat"
  >;
  characters: Array<Pick<Avatar, "name" | "description">>;
  primaryCharacter?: Pick<Avatar, "name" | "description"> | null;
  blockSummaries: Array<{
    position: number;
    segmentType: string;
    visualPrompt: string;
    locationTag?: string | null;
  }>;
  resolvedIdentity?: string;
}): string {
  const { primaryCharacter, characters, resolvedIdentity, ...rest } = input;
  const identity = resolvedIdentity ?? normalizeProjectIdentity(rest.project.projectIdentity);
  return JSON.stringify(
    {
      title: rest.project.title,
      ...(identity ? { project_identity: identity } : {}),
      story_description: rest.project.storyDescription,
      genre: rest.project.genre,
      visual_style: rest.project.visualStyle,
      voice_tone: rest.project.voiceTone,
      video_format: rest.project.videoFormat ?? "horizontal",
      ...(primaryCharacter
        ? {
            primary_character: {
              name: primaryCharacter.name,
              description: primaryCharacter.description ?? undefined,
            },
          }
        : characters.length > 0
          ? {
              characters: characters.map((c) => ({
                name: c.name,
                description: c.description ?? undefined,
              })),
            }
          : {}),
      block_visuals: rest.blockSummaries.map((b) => ({
        position: b.position,
        segment: b.segmentType,
        location: b.locationTag ?? undefined,
        visual: b.visualPrompt,
      })),
      output_language: "en",
    },
    null,
    2,
  );
}

/**
 * Editorial reference — color grade + light + atmosphere.
 * When a project avatar is set, the character is the focal subject using reference photos.
 */
export function buildEditorialReferencePrompt(input: {
  project: Pick<Project, "visualStyle" | "genre" | "projectIdentity">;
  bible: StyleBible;
  primaryCharacter?: Pick<Avatar, "name" | "description"> | null;
}): string {
  const { project, bible, primaryCharacter } = input;
  const identity = normalizeProjectIdentity(project.projectIdentity);
  const lines = [
    formatStyleBibleForPrompt(bible).trim(),
    "",
    `Visual style: ${visualStylePromptCue(project.visualStyle)}.`,
    `Genre: ${project.genre}.`,
    ...(identity ? [`Series/brand identity: ${identity}.`] : []),
  ];

  if (primaryCharacter) {
    const desc = primaryCharacter.description?.trim();
    lines.push(
      "Cinematic editorial reference / mood board for this short film.",
      `Main character "${primaryCharacter.name}" is the focal subject — match their face, hair, skin tone, body type and styling EXACTLY to the provided reference photos.`,
      desc ? `Character notes: ${desc}.` : "",
      "Show the character in a evocative hero pose that sets the film's color grade, lighting mood and atmosphere.",
      "NO text, NO logos, NO watermarks. Background may be abstract or minimal — character identity is priority.",
    );
  } else {
    lines.push(
      "Abstract cinematic reference for editorial direction.",
      "Show color palette swatches, light quality, atmospheric haze, film grain and lens character.",
      "NO characters, NO faces, NO text, NO logos, NO readable locations or geography.",
      "Do not depict a garden, room, forest, tunnel or any specific place — only the LOOK of the film.",
    );
  }

  lines.push("This image defines color grade and lighting mood for a multi-location story.");
  return lines.filter(Boolean).join("\n");
}

const EDITORIAL_BLOCK_IMAGE_FOCUS: Record<StyleBibleFieldKey, string> = {
  colorPalette:
    "Generate ONE single image focused ONLY on the color palette — soft gradients, swatches and color relationships. NOT a grid, NOT a film strip, NOT multiple panels, NOT a collage.",
  lighting:
    "Generate ONE single image focused ONLY on lighting quality — key light direction, contrast, rim light, volumetric rays. NOT a collage or multi-panel layout.",
  atmosphere:
    "Generate ONE single image focused ONLY on atmosphere — haze, particles, weather mood, air density. Single cohesive frame, NOT a mood board grid.",
  world:
    "Generate ONE single image focused ONLY on visual universe motifs — textures, recurring props, material language. Single scene fragment, NOT multiple locations or panels.",
  cinematography:
    "Generate ONE single image focused ONLY on lens and framing character — depth of field, anamorphic bokeh, film grain. NOT a split screen or contact sheet.",
  timeOfDay:
    "Generate ONE single image focused ONLY on time-of-day feel — sky tone, sun angle, ambient color of the hour. Single frame, NOT a day-to-night series.",
};

export function buildEditorialBlockReferencePrompt(input: {
  field: StyleBibleFieldKey;
  fieldLabel: string;
  fieldText: string;
  project: Pick<Project, "visualStyle" | "genre" | "projectIdentity">;
  bible: StyleBible;
  primaryCharacter?: Pick<Avatar, "name" | "description"> | null;
}): string {
  const { field, fieldLabel, fieldText, project, bible, primaryCharacter } = input;
  const identity = normalizeProjectIdentity(project.projectIdentity);
  const lines = [
    formatStyleBibleForPrompt(bible).trim(),
    "",
    `Visual style: ${visualStylePromptCue(project.visualStyle)}.`,
    `Genre: ${project.genre}.`,
    ...(identity ? [`Series/brand identity: ${identity}.`] : []),
    "",
    EDITORIAL_BLOCK_IMAGE_FOCUS[field],
    "",
    `This reference is specifically for: ${fieldLabel}.`,
    `${fieldLabel}: ${fieldText}.`,
  ];

  if (primaryCharacter && (field === "colorPalette" || field === "lighting" || field === "world")) {
    const desc = primaryCharacter.description?.trim();
    lines.push(
      `Harmonize with main character "${primaryCharacter.name}"${desc ? ` (${desc})` : ""} when relevant — still ONE single image, no collage.`,
    );
  }

  lines.push(
    "NO text, NO logos, NO watermarks, NO comic panels, NO triptych, NO film strip layout.",
  );
  return lines.filter(Boolean).join("\n");
}

/** @deprecated use buildEditorialReferencePrompt */
export const buildAnchorImagePrompt = buildEditorialReferencePrompt;

export interface SceneVisualInput {
  project: Pick<Project, "visualStyle">;
  block: Pick<StoryBlock, "visualPrompt" | "locationTag">;
  bible: StyleBible | null;
  avatarHint?: string;
  scenarioHint?: string;
  hasEditorialReference?: boolean;
}

/**
 * Builds the full text prompt for a scene keyframe or video clip.
 * Editorial line (bible) + this scene's unique location + shot description.
 */
export function buildSceneVisualPrompt(input: SceneVisualInput): string {
  const {
    project,
    block,
    bible,
    avatarHint = "",
    scenarioHint = "",
    hasEditorialReference = false,
  } = input;
  const styleCue = visualStylePromptCue(project.visualStyle);
  const styleHint = styleCue ? `Visual style: ${styleCue}. ` : "";
  const locationLabel = formatLocationTag(block.locationTag);
  const parts: string[] = [];

  const bibleBlock = formatStyleBibleForPrompt(bible).trim();
  if (bibleBlock) parts.push(bibleBlock);

  if (locationLabel) {
    parts.push(`Scene location (unique setting for THIS shot): ${locationLabel}.`);
  }

  parts.push(`${styleHint}${block.visualPrompt}${avatarHint}${scenarioHint}`);

  if (hasEditorialReference) {
    parts.push(
      "Match the reference image's color grade, lighting mood, atmosphere and lens character ONLY. " +
        "Do NOT copy its layout, geography, props or composition. " +
        "This scene happens in its own distinct environment as described above.",
    );
  } else if (bible) {
    parts.push(
      "Keep the same editorial line (palette, light, atmosphere) but this scene has its own distinct location and composition.",
    );
  }

  return parts.filter(Boolean).join("\n\n");
}
