import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Project, ProjectDna } from "./db/schema";
import { formatProjectDnaForPrompt, resolveProjectIdentityText } from "./project-dna";
import { normalizeProjectIdentity } from "./project-identity";

export async function fetchProjectDnaById(
  id: string,
  userId: string,
): Promise<ProjectDna | null> {
  const [row] = await db
    .select()
    .from(schema.projectDna)
    .where(and(eq(schema.projectDna.id, id), eq(schema.projectDna.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function resolveProjectIdentityForProject(
  project: Pick<Project, "projectIdentity" | "projectDnaId" | "userId">,
): Promise<string> {
  if (!project.projectDnaId) {
    return normalizeProjectIdentity(project.projectIdentity);
  }
  const dna = await fetchProjectDnaById(project.projectDnaId, project.userId);
  return resolveProjectIdentityText(project, dna);
}

export async function assertOwnedProjectDna(
  projectDnaId: string,
  userId: string,
): Promise<ProjectDna | null> {
  return fetchProjectDnaById(projectDnaId, userId);
}

export { formatProjectDnaForPrompt, resolveProjectIdentityText };
