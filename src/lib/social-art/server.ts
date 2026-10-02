import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import type { SocialArtBrandKit } from "@/lib/db/schema";
import { toSocialArtBrand } from "@/lib/social-art/model";
import type { PublicationArtPatch, SocialArtKitPatch } from "@/lib/social-art/schemas";
import { DEFAULT_SOCIAL_ART_COLORS, type SocialArtBrand } from "@/lib/social-art/types";
import { fetchProjectDnaById } from "@/lib/project-dna-server";

export async function fetchSocialArtKit(userId: string, dnaId: string): Promise<SocialArtBrandKit | null> {
  const [row] = await db
    .select()
    .from(schema.socialArtBrandKits)
    .where(
      and(eq(schema.socialArtBrandKits.userId, userId), eq(schema.socialArtBrandKits.projectDnaId, dnaId)),
    )
    .limit(1);
  return row ?? null;
}

/** Caller must have checked DNA ownership. */
export async function getOrCreateSocialArtKit(userId: string, dnaId: string): Promise<SocialArtBrandKit> {
  const existing = await fetchSocialArtKit(userId, dnaId);
  if (existing) return existing;
  const now = new Date();
  try {
    await db.insert(schema.socialArtBrandKits).values({
      id: createId(),
      userId,
      projectDnaId: dnaId,
      colors: JSON.stringify(DEFAULT_SOCIAL_ART_COLORS),
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // concurrent create hit the unique index — read the winner below
  }
  const created = await fetchSocialArtKit(userId, dnaId);
  if (!created) throw new Error("Could not create brand art kit.");
  return created;
}

export async function updateSocialArtKit(
  userId: string,
  dnaId: string,
  patch: SocialArtKitPatch,
): Promise<SocialArtBrandKit> {
  await getOrCreateSocialArtKit(userId, dnaId);
  const { colors, ...rest } = patch;
  await db
    .update(schema.socialArtBrandKits)
    .set({ ...rest, ...(colors ? { colors: JSON.stringify(colors) } : {}), updatedAt: new Date() })
    .where(
      and(eq(schema.socialArtBrandKits.userId, userId), eq(schema.socialArtBrandKits.projectDnaId, dnaId)),
    );
  const kit = await fetchSocialArtKit(userId, dnaId);
  if (!kit) throw new Error("Brand art kit not found.");
  return kit;
}

/** Brand for a publication; falls back to defaults when no DNA is linked. */
export async function loadSocialArtBrand(
  userId: string,
  dnaId: string | null,
  fallbackName: string,
): Promise<SocialArtBrand> {
  const dna = dnaId ? await fetchProjectDnaById(dnaId, userId) : null;
  const kit = dna ? await fetchSocialArtKit(userId, dna.id) : null;
  return toSocialArtBrand(dna, kit, fallbackName);
}

/** Caller must have checked publication ownership. */
export async function updatePublicationArt(projectId: string, patch: PublicationArtPatch): Promise<void> {
  const now = new Date();
  if (patch.settings) {
    await db
      .update(schema.projects)
      .set({ socialArt: JSON.stringify(patch.settings), updatedAt: now })
      .where(eq(schema.projects.id, projectId));
  }
  for (const { id, art, ...fields } of patch.slides ?? []) {
    await db
      .update(schema.socialSlides)
      .set({ ...fields, ...(art ? { art: JSON.stringify(art) } : {}), updatedAt: now })
      .where(and(eq(schema.socialSlides.id, id), eq(schema.socialSlides.projectId, projectId)));
  }
}
