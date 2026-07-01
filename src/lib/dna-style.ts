import type { ProjectDna } from "./db/schema";

export interface DnaStyleDefaults {
  genre?: string;
  visualStyle?: string;
  voiceTone?: string;
  colorPalette?: string;
  visualMood?: string;
}

export type DnaStyleFields = Pick<
  ProjectDna,
  "genre" | "visualStyle" | "voiceTone" | "colorPalette" | "visualMood"
>;

function trimOrNull(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

export function normalizeDnaStyleInput(input: Partial<DnaStyleDefaults> & {
  genre?: string | null;
  visualStyle?: string | null;
  voiceTone?: string | null;
  colorPalette?: string | null;
  visualMood?: string | null;
}): DnaStyleDefaults {
  return {
    genre: trimOrNull(input.genre) ?? undefined,
    visualStyle: trimOrNull(input.visualStyle) ?? undefined,
    voiceTone: trimOrNull(input.voiceTone) ?? undefined,
    colorPalette: trimOrNull(input.colorPalette) ?? undefined,
    visualMood: trimOrNull(input.visualMood) ?? undefined,
  };
}

export function hasDnaStyle(dna: Partial<DnaStyleFields> | null | undefined): boolean {
  if (!dna) return false;
  return Boolean(
    trimOrNull(dna.genre) ||
      trimOrNull(dna.visualStyle) ||
      trimOrNull(dna.voiceTone) ||
      trimOrNull(dna.colorPalette) ||
      trimOrNull(dna.visualMood),
  );
}

/** Defaults to apply when user picks this DNA on a new project/publication. */
export function dnaStyleDefaultsForForms(
  dna: Partial<DnaStyleFields> | null | undefined,
): DnaStyleDefaults {
  if (!dna) return {};
  return {
    ...(trimOrNull(dna.genre) ? { genre: dna.genre!.trim() } : {}),
    ...(trimOrNull(dna.visualStyle) ? { visualStyle: dna.visualStyle!.trim() } : {}),
    ...(trimOrNull(dna.voiceTone) ? { voiceTone: dna.voiceTone!.trim() } : {}),
  };
}

/** Lines injected into image / slide visual prompts. */
export function dnaVisualPromptLines(dna: Partial<DnaStyleFields> | null | undefined): string[] {
  if (!dna) return [];
  const lines: string[] = [];
  const palette = trimOrNull(dna.colorPalette);
  const mood = trimOrNull(dna.visualMood);
  if (palette) {
    lines.push(`Brand color palette (use consistently): ${palette}.`);
  }
  if (mood) {
    lines.push(`Brand visual mood: ${mood}.`);
  }
  return lines;
}

export function formatDnaStyleSummary(dna: Partial<DnaStyleFields>): string | null {
  const parts: string[] = [];
  if (trimOrNull(dna.visualStyle)) parts.push(dna.visualStyle!.trim());
  if (trimOrNull(dna.genre)) parts.push(dna.genre!.trim());
  if (trimOrNull(dna.colorPalette)) parts.push(dna.colorPalette!.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}
