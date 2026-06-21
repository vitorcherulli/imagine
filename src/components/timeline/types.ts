import type { StoryBlock } from "@/lib/db/schema";
import { blockRequiresNarrationAudio } from "@/lib/cut-pace";

export type Block = StoryBlock;

export type AvatarLookup = Record<
  string,
  { id: string; name: string; primaryImageUrl: string | null }
>;

export function resolveBlockCharacterDisplay(
  block: Block,
  projectAvatarId: string | null,
  avatarMap: AvatarLookup,
): { name: string; imageUrl: string | null } | null {
  if (block.avatarId === "__none__") return null;
  const id = block.avatarId ?? projectAvatarId;
  if (!id) {
    return block.characterName ? { name: block.characterName, imageUrl: null } : null;
  }
  const av = avatarMap[id];
  if (!av && !block.characterName) return null;
  return {
    name: block.characterName ?? av?.name ?? "Character",
    imageUrl: av?.primaryImageUrl ?? null,
  };
}

export function avatarSelectValue(block: Block): string {
  if (block.avatarId === "__none__") return "__none__";
  if (block.avatarId) return block.avatarId;
  return "__inherit__";
}

export interface TimelineState {
  selectedBlockId: string | null;
  playing: boolean;
  currentTime: number;
  pxPerSecond: number;
}

export const SEGMENT_COLORS: Record<string, string> = {
  intro: "from-sky-500/80 to-sky-700/90",
  development: "from-violet-500/80 to-violet-700/90",
  climax: "from-rose-500/80 to-rose-700/90",
  resolution: "from-emerald-500/80 to-emerald-700/90",
};

export function statusDot(b: Block): { color: string; label: string } {
  if (b.status === "error") return { color: "bg-destructive", label: b.errorMessage ?? "Error" };
  if (b.status === "ready") return { color: "bg-success", label: "Ready" };
  if (b.status === "generating" || b.status.endsWith("_generating"))
    return { color: "bg-warning animate-pulse", label: "Generating…" };
  if (b.videoUrl && (!blockRequiresNarrationAudio(b) || b.audioUrl))
    return { color: "bg-success", label: "Ready" };
  if (b.keyframeUrl) return { color: "bg-accent", label: "Keyframe ready" };
  return { color: "bg-muted-foreground/40", label: "Draft" };
}
