import { eq } from "drizzle-orm";
import type { Avatar, Project, StoryBlock } from "@/lib/db/schema";
import { db, schema } from "@/lib/db";

export function matchAvatarByName(
  characterName: string | null | undefined,
  avatars: Avatar[],
): Avatar | null {
  if (!characterName?.trim() || avatars.length === 0) return null;
  const needle = characterName.trim().toLowerCase();
  return (
    avatars.find((a) => a.name.trim().toLowerCase() === needle) ??
    avatars.find((a) => needle.includes(a.name.trim().toLowerCase())) ??
    avatars.find((a) => a.name.trim().toLowerCase().includes(needle)) ??
    null
  );
}

export async function fetchAvatarById(id: string | null | undefined): Promise<Avatar | null> {
  if (!id) return null;
  const [row] = await db
    .select()
    .from(schema.avatars)
    .where(eq(schema.avatars.id, id))
    .limit(1);
  return row ?? null;
}

/** Avatar explicitly chosen for this project (ignores other user avatars). */
export function resolveProjectAvatar(
  project: Pick<Project, "avatarId">,
  userAvatars: Avatar[],
): Avatar | null {
  if (!project.avatarId) return null;
  return userAvatars.find((a) => a.id === project.avatarId) ?? null;
}

/** Maps LLM block output to the correct avatarId + characterName for storage. */
export function assignBlockAvatarFromStory(
  characterName: string | null | undefined,
  projectAvatar: Avatar | null,
  userAvatars: Avatar[],
): { avatarId: string | null; characterName: string | null } {
  const rawName = characterName?.trim() || null;

  if (projectAvatar) {
    if (rawName) {
      return { avatarId: projectAvatar.id, characterName: projectAvatar.name };
    }
    return { avatarId: null, characterName: null };
  }

  if (rawName) {
    const matched = matchAvatarByName(rawName, userAvatars);
    return { avatarId: matched?.id ?? null, characterName: rawName };
  }

  if (userAvatars.length === 1) {
    return { avatarId: userAvatars[0].id, characterName: userAvatars[0].name };
  }

  return { avatarId: null, characterName: null };
}

export function resolveBlockAvatarId(
  block: Pick<StoryBlock, "avatarId">,
  project: Pick<Project, "avatarId">,
): string | null {
  if (block.avatarId === "__none__") return null;
  if (block.avatarId) return block.avatarId;
  return project.avatarId ?? null;
}

export async function resolveBlockAvatar(
  block: Pick<StoryBlock, "avatarId">,
  project: Pick<Project, "avatarId">,
): Promise<Avatar | null> {
  return fetchAvatarById(resolveBlockAvatarId(block, project));
}

export function avatarHintForPrompt(
  avatar: Avatar | null,
  opts?: { referencePhotosAttached?: boolean },
): string {
  if (!avatar) return "";
  const desc = avatar.description?.trim();
  const attachRefs = opts?.referencePhotosAttached !== false;
  if (!attachRefs) {
    return (
      ` Main character "${avatar.name}" appears in this scene.` +
      (desc ? ` Appearance: ${desc}.` : "") +
      " Fictional character — consistent face and wardrobe across shots, not a portrait of a specific real individual."
    );
  }
  return ` Main character "${avatar.name}" must match the reference photos exactly (face, hair, build, outfit).${desc ? ` Character notes: ${desc}.` : ""}`;
}

export async function avatarReferenceImages(avatar: Avatar | null): Promise<string[] | undefined> {
  if (!avatar) return undefined;
  const { readImageAsDataUrl } = await import("@/lib/storage");
  const urls = JSON.parse(avatar.imageUrls || "[]") as string[];
  const ordered = [
    ...(avatar.primaryImageUrl ? [avatar.primaryImageUrl] : []),
    ...urls,
  ].filter((url, index, arr) => url && arr.indexOf(url) === index);

  if (ordered.length === 0) return undefined;

  const dataUrls = await Promise.all(ordered.slice(0, 3).map((u) => readImageAsDataUrl(u)));
  return dataUrls.filter(Boolean);
}
