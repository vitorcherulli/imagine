import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import type { MediaLibraryAsset, MediaLibraryFolder } from "@/lib/db/schema";
import { mimeFromFilename } from "@/lib/s3";

export type MediaLibrarySource =
  | "upload"
  | "keyframe"
  | "keyframe_ai"
  | "script_ref"
  | "google"
  | "pexels"
  | "wikimedia"
  | "generated";

const DEFAULT_ROOT_FOLDERS: Array<{ name: string; sources: MediaLibrarySource[] }> = [
  { name: "Geradas por IA", sources: ["keyframe_ai", "generated"] },
  { name: "Referências", sources: ["script_ref", "google", "pexels", "wikimedia"] },
  { name: "Uploads", sources: ["upload", "keyframe"] },
];

function normalizeUrl(url: string): string {
  return url.split("?")[0]?.split("#")[0] ?? url;
}

function sourceFolderName(source: MediaLibrarySource): string {
  const match = DEFAULT_ROOT_FOLDERS.find((entry) => entry.sources.includes(source));
  return match?.name ?? "Outros";
}

function isDefaultCategoryFolderName(name: string): boolean {
  return DEFAULT_ROOT_FOLDERS.some((entry) => entry.name === name);
}

export async function listMediaLibraryFolders(userId: string): Promise<MediaLibraryFolder[]> {
  return db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(eq(schema.mediaLibraryFolders.userId, userId))
    .orderBy(
      asc(schema.mediaLibraryFolders.parentId),
      asc(schema.mediaLibraryFolders.position),
      asc(schema.mediaLibraryFolders.name),
    );
}

export async function listMediaLibraryAssets(
  userId: string,
  folderId: string | null,
): Promise<MediaLibraryAsset[]> {
  const where =
    folderId === null
      ? and(
          eq(schema.mediaLibraryAssets.userId, userId),
          isNull(schema.mediaLibraryAssets.folderId),
        )
      : and(
          eq(schema.mediaLibraryAssets.userId, userId),
          eq(schema.mediaLibraryAssets.folderId, folderId),
        );

  return db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(where)
    .orderBy(desc(schema.mediaLibraryAssets.createdAt));
}

export async function getOwnedMediaFolder(folderId: string, userId: string) {
  const [folder] = await db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.id, folderId),
        eq(schema.mediaLibraryFolders.userId, userId),
      ),
    )
    .limit(1);
  return folder ?? null;
}

function sanitizeFolderName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || "Projeto";
}

async function getOrCreateFolder(
  userId: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        parentId
          ? eq(schema.mediaLibraryFolders.parentId, parentId)
          : isNull(schema.mediaLibraryFolders.parentId),
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
        parentId
          ? eq(schema.mediaLibraryFolders.parentId, parentId)
          : isNull(schema.mediaLibraryFolders.parentId),
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

async function getOwnedProjectTitle(projectId: string, userId: string): Promise<string | null> {
  const [project] = await db
    .select({ title: schema.projects.title })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
    )
    .limit(1);
  return project?.title?.trim() ?? null;
}

async function findProjectRootFolderId(
  userId: string,
  projectId: string,
): Promise<string | null> {
  const [folder] = await db
    .select({ id: schema.mediaLibraryFolders.id })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        eq(schema.mediaLibraryFolders.projectId, projectId),
        isNull(schema.mediaLibraryFolders.parentId),
      ),
    )
    .limit(1);
  return folder?.id ?? null;
}

async function createProjectRootFolder(
  userId: string,
  projectId: string,
  name: string,
): Promise<string> {
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
    projectId,
    name,
    position: (siblings[0]?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function getOrCreateProjectRootFolder(userId: string, projectId: string): Promise<string> {
  const existingRoot = await findProjectRootFolderId(userId, projectId);
  if (existingRoot) {
    const title = (await getOwnedProjectTitle(projectId, userId)) ?? "Projeto";
    const desiredName = sanitizeFolderName(title);
    const folder = await getOwnedMediaFolder(existingRoot, userId);
    if (
      folder &&
      folder.name !== desiredName &&
      !isDefaultCategoryFolderName(folder.name) &&
      !isDefaultCategoryFolderName(desiredName)
    ) {
      await db
        .update(schema.mediaLibraryFolders)
        .set({ name: desiredName, updatedAt: new Date() })
        .where(eq(schema.mediaLibraryFolders.id, existingRoot));
    }
    return existingRoot;
  }

  const title = (await getOwnedProjectTitle(projectId, userId)) ?? "Projeto";
  let name = sanitizeFolderName(title);

  const [sameNameFolder] = await db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        isNull(schema.mediaLibraryFolders.parentId),
        eq(schema.mediaLibraryFolders.name, name),
      ),
    )
    .limit(1);

  if (sameNameFolder && sameNameFolder.projectId !== projectId) {
    name = `${name} · ${projectId.slice(-6)}`;
  }

  return createProjectRootFolder(userId, projectId, name);
}

async function getOrCreateProjectSourceFolder(
  userId: string,
  projectId: string,
  source: MediaLibrarySource,
): Promise<string> {
  const projectRootId = await getOrCreateProjectRootFolder(userId, projectId);
  return getOrCreateFolder(userId, sourceFolderName(source), projectRootId);
}

async function getOrCreateRootFolder(userId: string, name: string): Promise<string> {
  return getOrCreateFolder(userId, name, null);
}

export async function ensureDefaultMediaLibraryFolders(userId: string): Promise<void> {
  for (const entry of DEFAULT_ROOT_FOLDERS) {
    await getOrCreateRootFolder(userId, entry.name);
  }
}

export async function createMediaLibraryFolder(input: {
  userId: string;
  name: string;
  parentId?: string | null;
}): Promise<MediaLibraryFolder> {
  const name = input.name.trim();
  if (!name) throw new Error("Folder name is required.");

  if (input.parentId) {
    const parent = await getOwnedMediaFolder(input.parentId, input.userId);
    if (!parent) throw new Error("Parent folder not found.");
  }

  const siblings = await db
    .select({ position: schema.mediaLibraryFolders.position })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, input.userId),
        input.parentId
          ? eq(schema.mediaLibraryFolders.parentId, input.parentId)
          : isNull(schema.mediaLibraryFolders.parentId),
      ),
    )
    .orderBy(desc(schema.mediaLibraryFolders.position))
    .limit(1);

  const id = createId();
  const now = new Date();
  await db.insert(schema.mediaLibraryFolders).values({
    id,
    userId: input.userId,
    parentId: input.parentId ?? null,
    name,
    position: (siblings[0]?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });

  const [folder] = await db
    .select()
    .from(schema.mediaLibraryFolders)
    .where(eq(schema.mediaLibraryFolders.id, id))
    .limit(1);
  if (!folder) throw new Error("Could not create folder.");
  return folder;
}

export async function registerMediaLibraryAsset(input: {
  userId: string;
  url: string;
  name: string;
  mimeType?: string;
  kind?: "image" | "video" | "audio";
  source?: MediaLibrarySource;
  folderId?: string | null;
  projectId?: string | null;
  blockId?: string | null;
}): Promise<MediaLibraryAsset | null> {
  const url = input.url?.trim();
  if (!url) return null;

  const normalized = normalizeUrl(url);
  const [existing] = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.userId, input.userId),
        eq(schema.mediaLibraryAssets.url, normalized),
      ),
    )
    .limit(1);

  const source = input.source ?? "upload";
  let folderId = input.folderId;
  if (folderId === undefined) {
    if (input.projectId) {
      folderId = await getOrCreateProjectSourceFolder(
        input.userId,
        input.projectId,
        source,
      );
    } else {
      await ensureDefaultMediaLibraryFolders(input.userId);
      folderId = await getOrCreateRootFolder(input.userId, sourceFolderName(source));
    }
  }

  if (existing) {
    if (existing.folderId !== folderId) {
      await db
        .update(schema.mediaLibraryAssets)
        .set({
          folderId,
          projectId: input.projectId ?? existing.projectId,
          updatedAt: new Date(),
        })
        .where(eq(schema.mediaLibraryAssets.id, existing.id));
      return { ...existing, folderId, projectId: input.projectId ?? existing.projectId };
    }
    return existing;
  }

  const id = createId();
  const now = new Date();
  const mimeType = input.mimeType ?? mimeFromFilename(input.name);

  await db.insert(schema.mediaLibraryAssets).values({
    id,
    userId: input.userId,
    folderId,
    name: input.name.trim() || "Image",
    url: normalized,
    mimeType,
    kind: input.kind ?? "image",
    source,
    projectId: input.projectId ?? null,
    blockId: input.blockId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [asset] = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(eq(schema.mediaLibraryAssets.id, id))
    .limit(1);
  return asset ?? null;
}

/** Fire-and-forget — never blocks generation flows. */
export function registerMediaLibraryAssetSafe(
  input: Parameters<typeof registerMediaLibraryAsset>[0],
): void {
  void registerMediaLibraryAsset(input).catch((err) => {
    console.warn("[media-library] register failed:", err);
  });
}

export async function moveMediaLibraryAsset(
  assetId: string,
  userId: string,
  folderId: string | null,
): Promise<MediaLibraryAsset | null> {
  if (folderId) {
    const folder = await getOwnedMediaFolder(folderId, userId);
    if (!folder) throw new Error("Folder not found.");
  }

  const [asset] = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.id, assetId),
        eq(schema.mediaLibraryAssets.userId, userId),
      ),
    )
    .limit(1);
  if (!asset) return null;

  await db
    .update(schema.mediaLibraryAssets)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(schema.mediaLibraryAssets.id, assetId));

  return { ...asset, folderId, updatedAt: new Date() };
}

export async function deleteMediaLibraryFolder(folderId: string, userId: string): Promise<void> {
  const folder = await getOwnedMediaFolder(folderId, userId);
  if (!folder) throw new Error("Folder not found.");

  const children = await db
    .select({ id: schema.mediaLibraryFolders.id })
    .from(schema.mediaLibraryFolders)
    .where(
      and(
        eq(schema.mediaLibraryFolders.userId, userId),
        eq(schema.mediaLibraryFolders.parentId, folderId),
      ),
    );
  if (children.length > 0) {
    throw new Error("Delete subfolders first.");
  }

  await db
    .update(schema.mediaLibraryAssets)
    .set({ folderId: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.mediaLibraryAssets.userId, userId),
        eq(schema.mediaLibraryAssets.folderId, folderId),
      ),
    );

  await db
    .delete(schema.mediaLibraryFolders)
    .where(eq(schema.mediaLibraryFolders.id, folderId));
}

export async function deleteMediaLibraryAsset(assetId: string, userId: string): Promise<void> {
  await db
    .delete(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.id, assetId),
        eq(schema.mediaLibraryAssets.userId, userId),
      ),
    );
}

export async function getOwnedMediaLibraryAsset(assetId: string, userId: string) {
  const [asset] = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.id, assetId),
        eq(schema.mediaLibraryAssets.userId, userId),
      ),
    )
    .limit(1);
  return asset ?? null;
}

export type MediaLibraryPickerAsset = MediaLibraryAsset & {
  folderPath: string;
};

function folderPathLabel(
  folderId: string | null,
  folders: MediaLibraryFolder[],
): string {
  if (!folderId) return "Gallery";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  let currentId: string | null = folderId;
  while (currentId) {
    const folder = byId.get(currentId);
    if (!folder) break;
    parts.unshift(folder.name);
    currentId = folder.parentId;
  }
  return parts.join(" › ") || "Gallery";
}

export async function listMediaLibraryPickerAssets(
  userId: string,
  options?: { projectId?: string | null; limit?: number; kind?: "image" | "video" },
): Promise<MediaLibraryPickerAsset[]> {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 120));
  const kind = options?.kind ?? "image";
  const folders = await listMediaLibraryFolders(userId);

  const where = options?.projectId
    ? and(
        eq(schema.mediaLibraryAssets.userId, userId),
        eq(schema.mediaLibraryAssets.kind, kind),
        eq(schema.mediaLibraryAssets.projectId, options.projectId),
      )
    : and(eq(schema.mediaLibraryAssets.userId, userId), eq(schema.mediaLibraryAssets.kind, kind));

  const assets = await db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(where)
    .orderBy(desc(schema.mediaLibraryAssets.createdAt))
    .limit(limit);

  return assets.map((asset) => ({
    ...asset,
    folderPath: folderPathLabel(asset.folderId, folders),
  }));
}

export function buildMediaFolderTree(folders: MediaLibraryFolder[]) {
  type Node = MediaLibraryFolder & { children: Node[] };
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [] });
  }

  for (const folder of folders) {
    const node = byId.get(folder.id)!;
    if (folder.parentId && byId.has(folder.parentId)) {
      byId.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
