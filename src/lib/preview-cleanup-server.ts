import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteMediaByKey, mediaFileExists } from "@/lib/storage";
import { VIDEO_PREVIEW_FILENAME, previewVideoStorageKey } from "@/lib/video-preview";
import { isS3Enabled, listObjectKeysByPrefix } from "@/lib/s3";

const PUBLIC_DIR = path.join(process.cwd(), "public");

function previewKeyForBlock(projectId: string, blockId: string): string {
  return previewVideoStorageKey(projectId, blockId);
}

async function listLocalPreviewKeys(projectId: string): Promise<string[]> {
  const projectDir = path.join(PUBLIC_DIR, "generated", projectId);
  if (!fsSync.existsSync(projectDir)) return [];

  const keys: string[] = [];
  const blockDirs = await fs.readdir(projectDir, { withFileTypes: true });
  for (const entry of blockDirs) {
    if (!entry.isDirectory()) continue;
    const previewPath = path.join(projectDir, entry.name, VIDEO_PREVIEW_FILENAME);
    try {
      const stat = await fs.stat(previewPath);
      if (stat.isFile()) {
        keys.push(previewKeyForBlock(projectId, entry.name));
      }
    } catch {
      // missing preview file
    }
  }
  return keys;
}

async function listProjectPreviewKeys(projectId: string): Promise<string[]> {
  const prefix = `generated/${projectId}/`;
  if (isS3Enabled()) {
    const keys = await listObjectKeysByPrefix(prefix);
    return keys.filter((key) => key.endsWith(`/${VIDEO_PREVIEW_FILENAME}`));
  }
  return listLocalPreviewKeys(projectId);
}

async function deletePreviewKey(key: string): Promise<boolean> {
  const url = `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
  if (!(await mediaFileExists(url))) return false;
  await deleteMediaByKey(key);
  return true;
}

/** Delete all `video_preview.mp4` files for one project. Export files are untouched. */
export async function cleanupProjectPreviewVideos(projectId: string): Promise<number> {
  const keys = await listProjectPreviewKeys(projectId);
  let deleted = 0;
  for (const key of keys) {
    if (await deletePreviewKey(key)) deleted += 1;
  }
  return deleted;
}

/** Delete preview proxies across every project owned by the user. */
export async function cleanupUserPreviewVideos(userId: string): Promise<{
  deletedCount: number;
  projectCount: number;
}> {
  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  let deletedCount = 0;
  for (const project of projects) {
    deletedCount += await cleanupProjectPreviewVideos(project.id);
  }

  return { deletedCount, projectCount: projects.length };
}
