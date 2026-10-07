export type LibraryKind = "video" | "social" | "dubbing" | "swap" | "variations" | "image_chat";

export const LIBRARY_KINDS: Array<{ id: LibraryKind; label: string; badge: string }> = [
  { id: "video", label: "Videos", badge: "Video" },
  { id: "social", label: "Posts", badge: "Post" },
  { id: "dubbing", label: "Dubs", badge: "Dub" },
  { id: "swap", label: "Person swaps", badge: "Swap" },
  { id: "variations", label: "Variations", badge: "Variations" },
  { id: "image_chat", label: "Image chats", badge: "Image chat" },
];

export function isLibraryKind(value: unknown): value is LibraryKind {
  return LIBRARY_KINDS.some((k) => k.id === value);
}

/** Kinds stored in the `projects` table (duplicable, moved via /api/projects). */
export function isProjectKind(kind: LibraryKind): kind is "video" | "social" | "dubbing" {
  return kind === "video" || kind === "social" || kind === "dubbing";
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  description: string;
  meta: string;
  href: string;
  coverUrl: string | null;
  /** Shown (first frame) when there is no image cover. */
  coverVideoUrl: string | null;
  aspectClass: string;
  /** Text shown when there is no cover at all. */
  placeholder: string;
  folderId: string | null;
  /** ISO timestamp. */
  updatedAt: string;
}

export function libraryItemKey(item: Pick<LibraryItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

const ASPECT_CLASSES: Record<string, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "2:3": "aspect-[2/3]",
  "3:2": "aspect-[3/2]",
};

export function aspectClassFor(ratio: string | null | undefined): string {
  return (ratio && ASPECT_CLASSES[ratio]) || "aspect-square";
}
