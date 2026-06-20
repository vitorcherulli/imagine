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

export function avatarHintForPrompt(avatar: Avatar | null): string {
  if (!avatar) return "";
  const desc = avatar.description?.trim();
  return ` Main character "${avatar.name}" must match the reference photos exactly (face, hair, build, outfit).${desc ? ` Character notes: ${desc}.` : ""}`;
}

export async function avatarReferenceImages(avatar: Avatar | null): Promise<string[] | undefined> {
  if (!avatar) return undefined;
  const { readImageAsDataUrl } = await import("@/lib/storage");
  const urls = JSON.parse(avatar.imageUrls || "[]") as string[];
  if (urls.length === 0) return undefined;
  return Promise.all(urls.slice(0, 3).map((u) => readImageAsDataUrl(u)));
}
