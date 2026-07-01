import type { ProjectDna } from "./db/schema";

export const DNA_EVOLVE_FIELDS = [
  "description",
  "genre",
  "visualStyle",
  "voiceTone",
  "colorPalette",
  "visualMood",
  "learnedNotes",
] as const;

export type DnaEvolveField = (typeof DNA_EVOLVE_FIELDS)[number];

export const DNA_EVOLVE_FIELD_LABELS: Record<DnaEvolveField, string> = {
  description: "Description",
  genre: "Genre",
  visualStyle: "Visual style",
  voiceTone: "Voice tone",
  colorPalette: "Color palette",
  visualMood: "Visual mood",
  learnedNotes: "Episode memory",
};

export interface DnaEvolveFieldChange {
  field: DnaEvolveField;
  label: string;
  before: string | null;
  after: string | null;
  rationale: string;
  /** For learnedNotes — append-only bullet, not full replacement. */
  appendOnly?: boolean;
}

export interface DnaEvolvePreview {
  projectId: string;
  projectDnaId: string;
  dnaName: string;
  episodeTitle: string;
  episodeSummary: string;
  changes: DnaEvolveFieldChange[];
}

export function dnaFieldValue(dna: ProjectDna, field: DnaEvolveField): string | null {
  switch (field) {
    case "description":
      return dna.description?.trim() || null;
    case "genre":
      return dna.genre?.trim() || null;
    case "visualStyle":
      return dna.visualStyle?.trim() || null;
    case "voiceTone":
      return dna.voiceTone?.trim() || null;
    case "colorPalette":
      return dna.colorPalette?.trim() || null;
    case "visualMood":
      return dna.visualMood?.trim() || null;
    case "learnedNotes":
      return dna.learnedNotes?.trim() || null;
    default:
      return null;
  }
}

export function buildDnaEvolveSystemPrompt(): string {
  return [
    "You help a video creator evolve their series/brand DNA based on a finished episode.",
    "Input is JSON: { current_dna, episode }.",
    "Output STRICT JSON:",
    "{",
    '  episode_summary: string,',
    '  updates: {',
    "    description?: string,",
    "    genre?: string,",
    "    visual_style?: string,",
    "    voice_tone?: string,",
    "    color_palette?: string,",
    "    visual_mood?: string,",
    "    learned_note?: string",
    "  },",
    "  rationales: { [field_name]: string }",
    "}",
    "Rules:",
    "- episode_summary: 2-3 sentences on what this episode was about and what it signals for the brand.",
    "- learned_note: ONE new bullet (max 220 chars) to append — date + episode title + pattern learned. Always provide this.",
    "- Only suggest updates for core fields when the episode clearly reinforces or refines the DNA — not one-off quirks.",
    "- If current_dna already fits, omit that field from updates (do not echo unchanged text).",
    "- description: refine audience, promise, recurring themes — merge insights, do not replace with episode synopsis only.",
    "- genre / visual_style / voice_tone: only if episode strongly confirms a shift; use same enum-style labels as current_dna when possible.",
    "- color_palette / visual_mood: extract from style_bible or visuals if present.",
    "- rationales: short note per field you changed (why this helps future videos).",
    "- Be conservative — DNA should stay stable; learned_note carries episode-specific memory.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function appendLearnedNote(existing: string | null | undefined, bullet: string): string {
  const base = (existing ?? "").trim();
  const line = bullet.trim();
  if (!line) return base;
  const combined = base ? `${base}\n${line}` : line;
  return combined.slice(-8000);
}
