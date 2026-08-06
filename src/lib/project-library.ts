import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq } from "drizzle-orm";
import type { Project } from "@/lib/db/schema";
import { db, schema } from "@/lib/db";
import { readMediaBuffer, saveBuffer, withCacheBuster } from "@/lib/storage";

export function duplicateProjectTitle(title: string): string {
  const base = title.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, "").trim() || "Untitled";
  return `${base} (copy)`;
}

function filenameFromUrl(url: string, fallback: string): string {
  const base = url.split("?")[0]?.split("/").pop()?.trim();
  if (!base || base.length > 120) return fallback;
  return base;
}

/**
 * Copy a media file into the new project's storage namespace and return a fresh
 * public URL (with cache buster). `blockId` is `null` for project-level media
 * (music, anchor image, thumbnail). Returns `null` if the source is missing or
 * cannot be read, so a broken source URL never aborts the whole duplication.
 */
async function copyMedia(
  newProjectId: string,
  newBlockId: string | null,
  url: string | null | undefined,
  fallbackFilename: string,
): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const buf = await readMediaBuffer(url);
    const filename = filenameFromUrl(url, fallbackFilename);
    return withCacheBuster(await saveBuffer(newProjectId, newBlockId, filename, buf));
  } catch {
    return null;
  }
}

/**
 * Full deep copy of a project: settings, all blocks, and every associated media
 * file (keyframes, videos, narration/scene audio, music tracks, anchor image,
 * YouTube thumbnail, social slide images) plus script versions and metadata.
 * Media is physically re-copied into the new project's storage namespace so the
 * duplicate is fully independent from the original.
 */
export async function duplicateProjectDeep(
  source: Project,
  userId: string,
): Promise<string> {
  const id = createId();
  const now = new Date();

  const [anchorImageUrl, musicUrl, music2Url] = await Promise.all([
    copyMedia(id, null, source.anchorImageUrl, "anchor.jpg"),
    copyMedia(id, null, source.musicUrl, "music.mp3"),
    copyMedia(id, null, source.music2Url, "music2.mp3"),
  ]);

  // Copy every column verbatim, then override identity/media/timestamps.
  const { id: _sourceId, createdAt: _c, updatedAt: _u, ...rest } = source;
  await db.insert(schema.projects).values({
    ...rest,
    id,
    userId,
    title: duplicateProjectTitle(source.title),
    status: "draft",
    anchorImageUrl,
    musicUrl,
    musicStatus: musicUrl ? source.musicStatus : "none",
    music2Url,
    music2Status: music2Url ? source.music2Status : "none",
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all([
    duplicateStoryBlocks(source.id, id),
    duplicateYoutubeMetadata(source.id, id),
    duplicateSocialSlides(source.id, id),
    duplicateSocialMetadata(source.id, id),
    duplicateScriptVersions(source.id, id),
  ]);

  return id;
}

async function duplicateStoryBlocks(sourceProjectId: string, newProjectId: string): Promise<void> {
  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, sourceProjectId))
    .orderBy(asc(schema.storyBlocks.position));

  const now = new Date();
  for (const block of blocks) {
    const newBlockId = createId();
    const [keyframeUrl, videoUrl, audioUrl, sceneAudioUrl] = await Promise.all([
      copyMedia(newProjectId, newBlockId, block.keyframeUrl, "keyframe.jpg"),
      copyMedia(newProjectId, newBlockId, block.videoUrl, "video.mp4"),
      copyMedia(newProjectId, newBlockId, block.audioUrl, "narration.mp3"),
      copyMedia(newProjectId, newBlockId, block.sceneAudioUrl, "scene_audio.m4a"),
    ]);

    const { id: _oldId, projectId: _p, createdAt: _c, updatedAt: _u, ...blockRest } = block;
    await db.insert(schema.storyBlocks).values({
      ...blockRest,
      id: newBlockId,
      projectId: newProjectId,
      keyframeUrl,
      videoUrl,
      audioUrl,
      sceneAudioUrl,
      // Job handles belong to the source generation and must not be reused.
      videoJobId: null,
      videoPollingUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function duplicateYoutubeMetadata(
  sourceProjectId: string,
  newProjectId: string,
): Promise<void> {
  const [yt] = await db
    .select()
    .from(schema.youtubeMetadata)
    .where(eq(schema.youtubeMetadata.projectId, sourceProjectId))
    .limit(1);
  if (!yt) return;

  const thumbnailUrl = await copyMedia(newProjectId, null, yt.thumbnailUrl, "thumbnail.jpg");
  const now = new Date();
  const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, ...rest } = yt;
  await db.insert(schema.youtubeMetadata).values({
    ...rest,
    id: createId(),
    projectId: newProjectId,
    thumbnailUrl,
    createdAt: now,
    updatedAt: now,
  });
}

async function duplicateSocialSlides(
  sourceProjectId: string,
  newProjectId: string,
): Promise<void> {
  const slides = await db
    .select()
    .from(schema.socialSlides)
    .where(eq(schema.socialSlides.projectId, sourceProjectId))
    .orderBy(asc(schema.socialSlides.position));

  const now = new Date();
  for (const slide of slides) {
    const newSlideId = createId();
    const imageUrl = await copyMedia(newProjectId, newSlideId, slide.imageUrl, "slide.jpg");
    const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, ...rest } = slide;
    await db.insert(schema.socialSlides).values({
      ...rest,
      id: newSlideId,
      projectId: newProjectId,
      imageUrl,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function duplicateSocialMetadata(
  sourceProjectId: string,
  newProjectId: string,
): Promise<void> {
  const [meta] = await db
    .select()
    .from(schema.socialMetadata)
    .where(eq(schema.socialMetadata.projectId, sourceProjectId))
    .limit(1);
  if (!meta) return;

  const now = new Date();
  const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, ...rest } = meta;
  await db.insert(schema.socialMetadata).values({
    ...rest,
    id: createId(),
    projectId: newProjectId,
    createdAt: now,
    updatedAt: now,
  });
}

async function duplicateScriptVersions(
  sourceProjectId: string,
  newProjectId: string,
): Promise<void> {
  const versions = await db
    .select()
    .from(schema.scriptVersions)
    .where(eq(schema.scriptVersions.projectId, sourceProjectId))
    .orderBy(asc(schema.scriptVersions.version));

  if (versions.length === 0) return;
  const now = new Date();
  await db.insert(schema.scriptVersions).values(
    versions.map((v) => {
      const { id: _id, projectId: _p, createdAt: _c, ...rest } = v;
      return {
        ...rest,
        id: createId(),
        projectId: newProjectId,
        createdAt: now,
      };
    }),
  );
}

export async function getOwnedProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getOwnedFolder(folderId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projectFolders)
    .where(
      and(eq(schema.projectFolders.id, folderId), eq(schema.projectFolders.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}
