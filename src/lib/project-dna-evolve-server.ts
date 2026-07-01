import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Project, ProjectDna, StoryBlock } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { resolveProjectApiModels } from "./project-api-models";
import {
  appendLearnedNote,
  buildDnaEvolveSystemPrompt,
  DNA_EVOLVE_FIELD_LABELS,
  dnaFieldValue,
  type DnaEvolveField,
  type DnaEvolveFieldChange,
  type DnaEvolvePreview,
} from "./project-dna-evolve";
import { fetchProjectDnaById } from "./project-dna-server";
import { parseStyleBible } from "./style-bible";

const MAX_SCRIPT_CHARS = 3500;
const MAX_BLOCKS = 12;

function trimOrNull(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t || null;
}

function buildEpisodePayload(project: Project, blocks: StoryBlock[]) {
  const bible = parseStyleBible(project.styleBible);
  const script = (project.scriptDraft ?? "").trim();
  const blockSamples = blocks.slice(0, MAX_BLOCKS).map((b) => ({
    segment: b.segmentType,
    location: b.locationTag,
    narration: b.narrativeText.trim().slice(0, 280),
    visual: b.visualPrompt.trim().slice(0, 200),
  }));

  return {
    title: project.title,
    synopsis: project.storyDescription,
    genre: project.genre,
    visual_style: project.visualStyle,
    voice_tone: project.voiceTone,
    video_format: project.videoFormat,
    script_excerpt: script ? script.slice(0, MAX_SCRIPT_CHARS) : null,
    style_bible: bible
      ? {
          color_palette: bible.colorPalette,
          lighting: bible.lighting,
          atmosphere: bible.atmosphere,
          world: bible.world,
          cinematography: bible.cinematography,
          time_of_day: bible.timeOfDay,
        }
      : null,
    blocks: blockSamples,
    block_count: blocks.length,
  };
}

function buildCurrentDnaPayload(dna: ProjectDna) {
  return {
    name: dna.name,
    description: dna.description,
    genre: dna.genre,
    visual_style: dna.visualStyle,
    voice_tone: dna.voiceTone,
    color_palette: dna.colorPalette,
    visual_mood: dna.visualMood,
    learned_notes: dna.learnedNotes,
  };
}

function mapLlmField(key: string): DnaEvolveField | null {
  switch (key) {
    case "description":
      return "description";
    case "genre":
      return "genre";
    case "visual_style":
    case "visualStyle":
      return "visualStyle";
    case "voice_tone":
    case "voiceTone":
      return "voiceTone";
    case "color_palette":
    case "colorPalette":
      return "colorPalette";
    case "visual_mood":
    case "visualMood":
      return "visualMood";
    case "learned_note":
    case "learnedNotes":
      return "learnedNotes";
    default:
      return null;
  }
}

function normalizeUpdates(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = trimmed.slice(0, key.includes("description") ? 4000 : 1000);
  }
  return out;
}

function buildChanges(
  dna: ProjectDna,
  updates: Record<string, string>,
  rationales: Record<string, string>,
): DnaEvolveFieldChange[] {
  const changes: DnaEvolveFieldChange[] = [];

  for (const [rawKey, afterValue] of Object.entries(updates)) {
    const field = mapLlmField(rawKey);
    if (!field) continue;

    const before = dnaFieldValue(dna, field);
    const rationale =
      rationales[rawKey] ??
      rationales[field] ??
      "Refined from this episode.";

    if (field === "learnedNotes") {
      const bullet = afterValue.startsWith("-") ? afterValue : `- ${afterValue}`;
      const merged = appendLearnedNote(before, bullet);
      if (merged === (before ?? "")) continue;
      changes.push({
        field,
        label: DNA_EVOLVE_FIELD_LABELS[field],
        before,
        after: merged,
        rationale,
        appendOnly: true,
      });
      continue;
    }

    if (before === afterValue) continue;
    changes.push({
      field,
      label: DNA_EVOLVE_FIELD_LABELS[field],
      before,
      after: afterValue,
      rationale,
    });
  }

  return changes;
}

export async function previewDnaEvolveFromProject(input: {
  project: Project;
  blocks: StoryBlock[];
}): Promise<DnaEvolvePreview> {
  const { project, blocks } = input;
  if (!project.projectDnaId) {
    throw new Error("This project has no DNA linked. Pick a DNA when creating the project.");
  }

  const dna = await fetchProjectDnaById(project.projectDnaId, project.userId);
  if (!dna) throw new Error("Linked DNA not found.");

  const models = resolveProjectApiModels(project);
  const raw = await chatCompletion({
    model: models.llmModel,
    messages: [
      { role: "system", content: buildDnaEvolveSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify(
          {
            current_dna: buildCurrentDnaPayload(dna),
            episode: buildEpisodePayload(project, blocks),
          },
          null,
          2,
        ),
      },
    ],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  const parsed = extractJson<{
    episode_summary?: string;
    updates?: unknown;
    rationales?: unknown;
  }>(raw);

  const updates = normalizeUpdates(parsed.updates);
  if (updates.learned_note && !updates.learnedNotes) {
    updates.learnedNotes = updates.learned_note;
  }

  const rationales =
    parsed.rationales && typeof parsed.rationales === "object"
      ? Object.fromEntries(
          Object.entries(parsed.rationales as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};

  const changes = buildChanges(dna, updates, rationales);

  return {
    projectId: project.id,
    projectDnaId: dna.id,
    dnaName: dna.name,
    episodeTitle: project.title,
    episodeSummary:
      (parsed.episode_summary ?? "").trim().slice(0, 800) ||
      `Episode "${project.title}" — ${project.storyDescription.slice(0, 200)}`,
    changes,
  };
}

export async function applyDnaEvolveChanges(input: {
  userId: string;
  projectDnaId: string;
  changes: Array<{ field: DnaEvolveField; after: string | null }>;
}): Promise<ProjectDna> {
  const dna = await fetchProjectDnaById(input.projectDnaId, input.userId);
  if (!dna) throw new Error("DNA not found.");

  const patch: Partial<Record<DnaEvolveField, string | null>> = {};
  for (const change of input.changes) {
    patch[change.field] = trimOrNull(change.after);
  }

  await db
    .update(schema.projectDna)
    .set({
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.genre !== undefined ? { genre: patch.genre } : {}),
      ...(patch.visualStyle !== undefined ? { visualStyle: patch.visualStyle } : {}),
      ...(patch.voiceTone !== undefined ? { voiceTone: patch.voiceTone } : {}),
      ...(patch.colorPalette !== undefined ? { colorPalette: patch.colorPalette } : {}),
      ...(patch.visualMood !== undefined ? { visualMood: patch.visualMood } : {}),
      ...(patch.learnedNotes !== undefined ? { learnedNotes: patch.learnedNotes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.projectDna.id, dna.id));

  const [updated] = await db
    .select()
    .from(schema.projectDna)
    .where(eq(schema.projectDna.id, dna.id))
    .limit(1);

  if (!updated) throw new Error("Failed to load updated DNA.");
  return updated;
}

export async function loadProjectWithBlocks(
  projectId: string,
  userId: string,
): Promise<{ project: Project; blocks: StoryBlock[] } | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  return { project, blocks };
}
