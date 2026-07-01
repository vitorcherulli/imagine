import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import type { MediaLibraryAsset, ProjectDna } from "@/lib/db/schema";
import { fetchProjectDnaById } from "@/lib/project-dna-server";
import {
  getOwnedMediaFolder,
  registerMediaLibraryAsset,
} from "@/lib/media-library-server";
import { saveGalleryBuffer, withCacheBuster } from "@/lib/storage";

const CLIENT_PHOTOS_FOLDER = "Fotos do cliente";

function sanitizeFolderName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || "Marca";
}

async function getOrCreateChildFolder(
  userId: string,
  parentId: string,
  name: string,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        eq(schema.mediaLibraryFolders.parentId, parentId),
        eq(schema.mediaLibraryFolders.name, name),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const siblings = await db
    .select({ position: schema.mediaLibraryFolders.position })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        eq(schema.mediaLibraryFolders.parentId, parentId),
      ),
    )
    .orderBy(desc(schema.mediaLibraryFolders.position))
    .limit(1);

  const id = createId();
  const now = new Date();
  await db.insert(schema.mediaLibraryFolders).values({
    id,
    userId,
    parentId,
    name,
    position: (siblings[0]?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function findDnaRootFolderId(userId: string, dnaId: string): Promise<string | null> {
  const [folder] = await db
    .select({ id: schema.mediaLibraryFolders.id })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        eq(schema.mediaLibraryFolders.projectDnaId, dnaId),
        isNull(schema.mediaLibraryFolders.parentId),
      ),
    )
    .limit(1);
  return folder?.id ?? null;
}

async function createDnaRootFolder(userId: string, dna: ProjectDna): Promise<string> {
  const siblings = await db
    .select({ position: schema.mediaLibraryFolders.position })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        isNull(schema.mediaLibraryFolders.parentId),
      ),
    )
    .orderBy(desc(schema.mediaLibraryFolders.position))
    .limit(1);

  const id = createId();
  const now = new Date();
  await db.insert(schema.mediaLibraryFolders).values({
    id,
    userId,
    parentId: null,
    projectDnaId: dna.id,
    name: sanitizeFolderName(dna.name),
    position: (siblings[0]?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Ensures DNA has a "Fotos do cliente" folder; returns folder id for uploads. */
export async function ensureDnaClientGalleryFolder(
  userId: string,
  dnaId: string,
): Promise<string> {
  const dna = await fetchProjectDnaById(dnaId, userId);
  if (!dna) throw new Error("DNA not found");

  if (dna.galleryFolderId) {
    const folder = await getOwnedMediaFolder(dna.galleryFolderId, userId);
    if (folder) return dna.galleryFolderId;
  }

  let rootId = await findDnaRootFolderId(userId, dnaId);
  if (!rootId) {
    rootId = await createDnaRootFolder(userId, dna);
  }

  const clientFolderId = await getOrCreateChildFolder(userId, rootId, CLIENT_PHOTOS_FOLDER);

  await db
    .update(schema.projectDna)
    .set({ galleryFolderId: clientFolderId, updatedAt: new Date() })
    .where(eq(schema.projectDna.id, dnaId));

  return clientFolderId;
}

export async function listDnaClientGalleryAssets(
  userId: string,
  dnaId: string,
): Promise<MediaLibraryAsset[]> {
  const folderId = await ensureDnaClientGalleryFolder(userId, dnaId);
  return db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.userId, userId),
        eq(schema.mediaLibraryAssets.folderId, folderId),
        eq(schema.mediaLibraryAssets.kind, "image"),
      ),
    )
    .orderBy(desc(schema.mediaLibraryAssets.createdAt));
}

export async function uploadDnaClientGalleryImage(input: {
  userId: string;
  dnaId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<MediaLibraryAsset> {
  const folderId = await ensureDnaClientGalleryFolder(input.userId, input.dnaId);
  const ext = input.filename.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ext === "png" ? "png" : ext === "webp" ? "webp" : "jpg";
  const storedName = `${createId()}.${safeExt}`;
  const savedUrl = withCacheBuster(
    await saveGalleryBuffer(input.userId, storedName, input.buffer),
  );

  const asset = await registerMediaLibraryAsset({
    userId: input.userId,
    url: savedUrl,
    name: input.filename.replace(/\.[^.]+$/, "") || "Client photo",
    mimeType: input.mimeType,
    kind: "image",
    source: "upload",
    folderId,
  });
  if (!asset) throw new Error("Could not register gallery asset.");
  return asset;
}
