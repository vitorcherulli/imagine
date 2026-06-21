import type { Project, ProjectDna } from "./db/schema";
import { normalizeProjectIdentity } from "./project-identity";

export function formatProjectDnaForPrompt(dna: Pick<ProjectDna, "name" | "description">): string {
  const name = dna.name.trim();
  const description = (dna.description ?? "").trim();
  if (!name) return description;
  if (!description) return name;
  return `${name}: ${description}`;
}

export function resolveProjectIdentityText(
  project: Pick<Project, "projectIdentity" | "projectDnaId">,
  dna: ProjectDna | null | undefined,
): string {
  if (project.projectDnaId && dna) {
    return formatProjectDnaForPrompt(dna);
  }
  return normalizeProjectIdentity(project.projectIdentity);
}

export function projectDnaSummary(dna: Pick<ProjectDna, "name" | "description">): string {
  const name = dna.name.trim();
  const description = (dna.description ?? "").trim();
  if (!description) return name;
  return `${name} — ${description.slice(0, 72)}${description.length > 72 ? "…" : ""}`;
}
