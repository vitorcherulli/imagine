import type { Project, ProjectDna } from "./db/schema";
import { dnaVisualPromptLines } from "./dna-style";
import { normalizeProjectIdentity } from "./project-identity";

function trimField(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function formatProjectDnaForPrompt(
  dna: Pick<
    ProjectDna,
    | "name"
    | "description"
    | "genre"
    | "visualStyle"
    | "voiceTone"
    | "colorPalette"
    | "visualMood"
    | "learnedNotes"
  >,
): string {
  const name = dna.name.trim();
  const description = trimField(dna.description);
  const parts: string[] = [];

  if (name && description) parts.push(`${name}: ${description}`);
  else if (name) parts.push(name);
  else if (description) parts.push(description);

  const styleBits: string[] = [];
  if (trimField(dna.genre)) styleBits.push(`genre ${dna.genre}`);
  if (trimField(dna.visualStyle)) styleBits.push(`visual style ${dna.visualStyle}`);
  if (trimField(dna.voiceTone)) styleBits.push(`voice ${dna.voiceTone}`);
  if (trimField(dna.colorPalette)) styleBits.push(`colors: ${dna.colorPalette}`);
  if (trimField(dna.visualMood)) styleBits.push(`mood: ${dna.visualMood}`);
  if (styleBits.length > 0) {
    parts.push(`Brand look — ${styleBits.join("; ")}.`);
  }

  const learned = trimField(dna.learnedNotes);
  if (learned) {
    parts.push(`Series memory from past episodes:\n${learned.slice(0, 2000)}`);
  }

  return parts.join(" ").trim();
}

export { dnaVisualPromptLines };

export function resolveProjectIdentityText(
  project: Pick<Project, "projectIdentity" | "projectDnaId">,
  dna: ProjectDna | null | undefined,
): string {
  if (project.projectDnaId && dna) {
    return formatProjectDnaForPrompt(dna);
  }
  return normalizeProjectIdentity(project.projectIdentity);
}

export function projectDnaSummary(dna: Pick<ProjectDna, "name" | "description" | "colorPalette" | "visualStyle">): string {
  const name = dna.name.trim();
  const description = (dna.description ?? "").trim();
  const styleHint = trimField(dna.colorPalette) || trimField(dna.visualStyle);
  if (!description && !styleHint) return name;
  const descBit = description ? `${description.slice(0, 56)}${description.length > 56 ? "…" : ""}` : "";
  const styleBit = styleHint ? styleHint.slice(0, 40) : "";
  return [name, descBit, styleBit].filter(Boolean).join(" — ");
}
