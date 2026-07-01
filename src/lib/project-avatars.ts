import type { Avatar, Project } from "@/lib/db/schema";

export function parseProjectAvatarIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** Avatars selected for this project. Empty when none chosen — never implies the full library. */
export function resolveProjectCast(
  project: Pick<Project, "avatarId" | "avatarIds">,
  userAvatars: Avatar[],
): Avatar[] {
  const ids = parseProjectAvatarIds(project.avatarIds);
  const fromList = ids
    .map((id) => userAvatars.find((a) => a.id === id))
    .filter((a): a is Avatar => !!a);
  if (fromList.length > 0) return fromList;
  if (project.avatarId) {
    const primary = userAvatars.find((a) => a.id === project.avatarId);
    return primary ? [primary] : [];
  }
  return [];
}

export function serializeProjectAvatarIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)]);
}
