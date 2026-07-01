import type { Avatar } from "@/lib/db/schema";

export const MAX_AVATAR_IMAGES = 12;

export function parseAvatarImageUrls(avatar: Pick<Avatar, "imageUrls">): string[] {
  try {
    const arr = JSON.parse(avatar.imageUrls || "[]");
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === "string" && !!u.trim()) : [];
  } catch {
    return [];
  }
}

export function normalizeAvatarImages(input: {
  imageUrls: string[];
  primaryImageUrl?: string | null;
}): { imageUrls: string[]; primaryImageUrl: string | null } {
  const unique = [...new Set(input.imageUrls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    MAX_AVATAR_IMAGES,
  );
  const primary =
    input.primaryImageUrl && unique.includes(input.primaryImageUrl)
      ? input.primaryImageUrl
      : unique[0] ?? null;
  return { imageUrls: unique, primaryImageUrl: primary };
}
