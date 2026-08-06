/**
 * Helpers de banco para o pipeline de dublagem — mirror de `block-helpers.ts`.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  DubbingSegment,
  DubbingSource,
  Project,
} from "@/lib/db/schema";

export async function getDubProjectForUser(
  projectId: string,
  userId: string,
): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
    )
    .limit(1);
  if (!row) return null;
  if (row.contentType !== "dubbing") return null;
  return row;
}

export async function getDubSource(
  projectId: string,
): Promise<DubbingSource | null> {
  const [row] = await db
    .select()
    .from(schema.dubbingSources)
    .where(eq(schema.dubbingSources.projectId, projectId))
    .limit(1);
  return row ?? null;
}

export async function listDubSegments(
  projectId: string,
): Promise<DubbingSegment[]> {
  return db
    .select()
    .from(schema.dubbingSegments)
    .where(eq(schema.dubbingSegments.projectId, projectId))
    .orderBy(asc(schema.dubbingSegments.position));
}

export async function getDubSegmentForUser(
  segmentId: string,
  userId: string,
): Promise<{ segment: DubbingSegment; project: Project } | null> {
  const rows = await db
    .select({ segment: schema.dubbingSegments, project: schema.projects })
    .from(schema.dubbingSegments)
    .innerJoin(
      schema.projects,
      eq(schema.projects.id, schema.dubbingSegments.projectId),
    )
    .where(
      and(
        eq(schema.dubbingSegments.id, segmentId),
        eq(schema.projects.userId, userId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.project.contentType !== "dubbing") return null;
  return row;
}

export async function updateDubProject(
  projectId: string,
  patch: Partial<Project>,
): Promise<void> {
  await db
    .update(schema.projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

export async function updateDubSource(
  projectId: string,
  patch: Partial<DubbingSource>,
): Promise<void> {
  await db
    .update(schema.dubbingSources)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.dubbingSources.projectId, projectId));
}

export async function updateDubSegment(
  segmentId: string,
  patch: Partial<DubbingSegment>,
): Promise<void> {
  await db
    .update(schema.dubbingSegments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.dubbingSegments.id, segmentId));
}
