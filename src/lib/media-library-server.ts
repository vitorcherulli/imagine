import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import type { MediaLibraryAsset, MediaLibraryFolder } from "@/lib/db/schema";
import { mimeFromFilename } from "@/lib/s3";
import { IMAGE_CHAT_GALLERY_FOLDER, parseImageChatUrls } from "@/lib/image-chat";
import { ORIGINAL_DIRECTION, VARIATIONS_GALLERY_FOLDER } from "@/lib/variations";

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

/** Search assets by name across ALL folders (case-insensitive), scoped to the user. */
export async function searchMediaLibraryAssets(
  userId: string,
  query: string,
  limit = 200,
): Promise<MediaLibraryAsset[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  return db
    .select()
    .from(schema.mediaLibraryAssets)
    .where(
      and(
        eq(schema.mediaLibraryAssets.userId, userId),
        sql`lower(${schema.mediaLibraryAssets.name}) like ${pattern} escape '\\'`,
      ),
    )
    .orderBy(desc(schema.mediaLibraryAssets.createdAt))
    .limit(limit);
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

/** Outputs of tools without a project (Image chat, Variations) land in "Geradas por IA › <product>". */
export function registerGeneratedMediaSafe(input: {
  userId: string;
  url: string;
  name: string;
  product: string;
  kind?: "image" | "video";
}): void {
  // Serialized so outputs finishing together don't race to create the same folders.
  generatedQueue = generatedQueue
    .then(async () => {
      await ensureDefaultMediaLibraryFolders(input.userId);
      const root = await getOrCreateRootFolder(input.userId, sourceFolderName("generated"));
      const folderId = await getOrCreateFolder(input.userId, input.product, root);
      const kind = input.kind ?? "image";
      await registerMediaLibraryAsset({
        userId: input.userId,
        url: input.url,
        name: sanitizeFolderName(input.name),
        mimeType: kind === "video" ? "video/mp4" : "image/png",
        kind,
        source: "generated",
        folderId,
      });
    })
    .catch((err) => {
      console.warn("[media-library] register generated failed:", err);
    });
}

let generatedQueue: Promise<void> = Promise.resolve();

/** Files Image chat / Variations outputs created before they were registered automatically. */
export async function backfillGeneratedMedia(userId: string): Promise<void> {
  const [assets, chatImages, variations] = await Promise.all([
    db
      .select({ url: schema.mediaLibraryAssets.url })
      .from(schema.mediaLibraryAssets)
      .where(eq(schema.mediaLibraryAssets.userId, userId)),
    db
      .select({ imageUrls: schema.imageChatMessages.imageUrls, title: schema.imageChats.title })
      .from(schema.imageChatMessages)
      .innerJoin(schema.imageChats, eq(schema.imageChatMessages.chatId, schema.imageChats.id))
      .where(
        and(
          eq(schema.imageChatMessages.userId, userId),
          eq(schema.imageChatMessages.role, "assistant"),
          eq(schema.imageChatMessages.status, "ready"),
        ),
      ),
    db
      .select({
        imageUrl: schema.variationItems.imageUrl,
        status: schema.variationItems.status,
        videoUrl: schema.variationItems.videoUrl,
        videoStatus: schema.variationItems.videoStatus,
        direction: schema.variationItems.direction,
        name: schema.variationSets.name,
      })
      .from(schema.variationItems)
      .innerJoin(schema.variationSets, eq(schema.variationItems.setId, schema.variationSets.id))
      .where(eq(schema.variationItems.userId, userId)),
  ]);
  const known = new Set(assets.map((a) => a.url));
  const missing = (url: string | null): url is string => !!url && !known.has(normalizeUrl(url));

  for (const row of chatImages) {
    for (const url of parseImageChatUrls(row.imageUrls).filter(missing)) {
      registerGeneratedMediaSafe({ userId, url, name: row.title, product: IMAGE_CHAT_GALLERY_FOLDER });
    }
  }
  for (const row of variations) {
    if (row.direction !== ORIGINAL_DIRECTION && row.status === "ready" && missing(row.imageUrl)) {
      registerGeneratedMediaSafe({ userId, url: row.imageUrl, name: row.name, product: VARIATIONS_GALLERY_FOLDER });
    }
    if (row.videoStatus === "ready" && missing(row.videoUrl)) {
      registerGeneratedMediaSafe({
        userId,
        url: row.videoUrl,
        name: row.name,
        product: VARIATIONS_GALLERY_FOLDER,
        kind: "video",
      });
    }
  }
  await generatedQueue;
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
