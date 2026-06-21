import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import type { Project } from "@/lib/db/schema";
import { db, schema } from "@/lib/db";

export function duplicateProjectTitle(title: string): string {
  const base = title.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, "").trim() || "Untitled";
  return `${base} (copy)`;
}

/** Copy project settings as a new draft — no blocks, media or YouTube metadata. */
export async function duplicateProjectAsTemplate(
  source: Project,
  userId: string,
): Promise<string> {
  const id = createId();
  const now = new Date();

  await db.insert(schema.projects).values({
    id,
    userId,
    title: duplicateProjectTitle(source.title),
    projectIdentity: source.projectIdentity,
    projectDnaId: source.projectDnaId,
    storyDescription: source.storyDescription,
    genre: source.genre,
    visualStyle: source.visualStyle,
    voiceTone: source.voiceTone,
    targetDurationSeconds: source.targetDurationSeconds,
    videoFormat: source.videoFormat,
    cutPace: source.cutPace,
    narrationMode: source.narrationMode,
    llmModel: source.llmModel,
    imageModel: source.imageModel,
    videoModel: source.videoModel,
    ttsModel: source.ttsModel,
    ttsVoice: source.ttsVoice,
    ttsSpeed: source.ttsSpeed,
    status: "draft",
    avatarId: source.avatarId,
    avatarIds: source.avatarIds,
    styleBible: source.styleBible,
    anchorImagePrompt: source.anchorImagePrompt,
    anchorImageUrl: null,
    musicPrompt: source.musicPrompt,
    musicUrl: null,
    musicStatus: "none",
    musicVolume: source.musicVolume,
    narrationVolume: source.narrationVolume,
    sceneVolume: source.sceneVolume,
    masterVolume: source.masterVolume,
    captionMode: source.captionMode,
    folderId: source.folderId,
    createdAt: now,
    updatedAt: now,
  });

  return id;
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
