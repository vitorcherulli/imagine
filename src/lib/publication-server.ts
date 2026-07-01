import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Project, SocialMetadata, SocialSlide } from "@/lib/db/schema";
import { isSocialProject } from "@/lib/social-content";

export async function getSocialPublicationForUser(
  projectId: string,
  userId: string,
): Promise<{
  project: Project;
  slides: SocialSlide[];
  metadata: SocialMetadata | null;
} | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project || !isSocialProject(project)) return null;

  const [slides, metadataRows] = await Promise.all([
    db
      .select()
      .from(schema.socialSlides)
      .where(eq(schema.socialSlides.projectId, projectId))
      .orderBy(asc(schema.socialSlides.position)),
    db
      .select()
      .from(schema.socialMetadata)
      .where(eq(schema.socialMetadata.projectId, projectId))
      .limit(1),
  ]);

  return {
    project,
    slides,
    metadata: metadataRows[0] ?? null,
  };
}

export async function getSocialSlideForUser(
  slideId: string,
  userId: string,
): Promise<{ slide: SocialSlide; project: Project } | null> {
  const [row] = await db
    .select({
      slide: schema.socialSlides,
      project: schema.projects,
    })
    .from(schema.socialSlides)
    .innerJoin(schema.projects, eq(schema.socialSlides.projectId, schema.projects.id))
    .where(and(eq(schema.socialSlides.id, slideId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!row || !isSocialProject(row.project)) return null;
  return row;
}

export async function setSocialSlideFields(
  slideId: string,
  patch: Partial<
    Pick<
      SocialSlide,
      | "headline"
      | "bodyText"
      | "visualPrompt"
      | "imageUrl"
      | "status"
      | "errorMessage"
      | "position"
      | "referenceAssetId"
    >
  >,
): Promise<void> {
  await db
    .update(schema.socialSlides)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.socialSlides.id, slideId));
}
