export const IMAGE_CHAT_MAX_ATTACHMENTS = 4;
export const DEFAULT_IMAGE_CHAT_TITLE = "New chat";

export type ImageChatRole = "user" | "assistant";
export type ImageChatStatus = "thinking" | "generating" | "ready" | "error";

export const IMAGE_CHAT_GALLERY_FOLDER = "Image chat";

export function parseImageChatUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}
