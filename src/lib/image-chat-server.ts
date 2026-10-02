import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ImageChat, ImageChatMessage } from "@/lib/db/schema";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";
import { generateImage } from "@/lib/openrouter/images";
import { chatCompletion, extractJson, type ChatContentPart, type ChatMessage } from "@/lib/openrouter/llm";
import { readImageAsDataUrl, saveImageChatBuffer, withCacheBuster } from "@/lib/storage";
import { catalogImageParams, imageResultToBuffer } from "@/lib/image-model-params";
import { isModelId } from "@/lib/model-catalog";
import { registerGeneratedMediaSafe } from "@/lib/media-library-server";
import { DEFAULT_IMAGE_CHAT_TITLE, IMAGE_CHAT_GALLERY_FOLDER, parseImageChatUrls } from "@/lib/image-chat";

const STALE_MS = 15 * 60 * 1000;
const HISTORY_LIMIT = 16;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export function resolveImageChatModel(chat: Pick<ImageChat, "imageModel">): string {
  return isModelId(chat.imageModel) ? chat.imageModel : OPENROUTER_MODELS.image;
}

export async function getOwnedImageChat(chatId: string, userId: string): Promise<ImageChat | null> {
  const [row] = await db
    .select()
    .from(schema.imageChats)
    .where(and(eq(schema.imageChats.id, chatId), eq(schema.imageChats.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listImageChatMessages(chatId: string): Promise<ImageChatMessage[]> {
  await db
    .update(schema.imageChatMessages)
    .set({ status: "error", error: "Interrupted — try again.", updatedAt: new Date() })
    .where(
      and(
        eq(schema.imageChatMessages.chatId, chatId),
        inArray(schema.imageChatMessages.status, ["thinking", "generating"]),
        lt(schema.imageChatMessages.updatedAt, new Date(Date.now() - STALE_MS)),
      ),
    );
  return db
    .select()
    .from(schema.imageChatMessages)
    .where(eq(schema.imageChatMessages.chatId, chatId))
    .orderBy(asc(schema.imageChatMessages.createdAt), asc(schema.imageChatMessages.id));
}

export function allChatImageUrls(messages: ImageChatMessage[]): Set<string> {
  return new Set(messages.flatMap((m) => parseImageChatUrls(m.imageUrls)));
}

type ImagePlan = {
  reply: string;
  generate: boolean;
  prompt: string;
  editPrevious: boolean;
  title: string | null;
};

const PLANNER_SYSTEM_PROMPT = [
  "You are the assistant of an image-generation chat, like ChatGPT with image generation.",
  "For the latest user message decide whether to create an image and write the prompt for the image model.",
  "Generate an image whenever the user asks for an image, a new version, or any change to an image. When in doubt, generate.",
  "Only answer without an image for pure questions or small talk.",
  "edit_previous = true when the user wants to change/refine the most recent image (\"make her blonde\", \"remove the text\", \"now in blue\").",
  "When the user attached images, they are references (product, person, style) — describe in the prompt how to use them.",
  "prompt: one detailed English prompt — subject, setting, style, composition, lighting, colors. If the image must contain text, write that text exactly, in quotes, in the user's language.",
  "reply: 1-2 short friendly sentences in the user's language (what you are creating, or the answer).",
  "title: a 3-6 word title for the conversation in the user's language.",
  'Respond ONLY with JSON: {"reply": string, "generate": boolean, "prompt": string, "edit_previous": boolean, "title": string}',
].join("\n");

function historyLine(m: ImageChatMessage): string {
  const urls = parseImageChatUrls(m.imageUrls);
  if (m.role === "user") {
    return urls.length ? `${m.content}\n[attached ${urls.length} reference image(s)]` : m.content;
  }
  const image = urls.length ? `\n[generated an image — prompt: ${m.prompt ?? ""}]` : "";
  return `${m.content}${image}`.trim() || "(no reply)";
}

function lastImageUrl(messages: ImageChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const urls = parseImageChatUrls(messages[i].imageUrls);
    if (urls.length) return urls[urls.length - 1];
  }
  return null;
}

async function planImageReply(history: ImageChatMessage[]): Promise<ImagePlan> {
  const latest = history[history.length - 1];
  const earlier = history.slice(0, -1).slice(-HISTORY_LIMIT);
  const attachments = parseImageChatUrls(latest.imageUrls);
  const previousImage = lastImageUrl(history.slice(0, -1));

  const parts: ChatContentPart[] = [{ type: "text", text: latest.content || "(image only)" }];
  for (const url of attachments) {
    parts.push({ type: "image_url", image_url: { url: await readImageAsDataUrl(url) } });
  }
  if (previousImage) {
    parts.push({ type: "text", text: "Most recent image in this chat (for edits):" });
    parts.push({ type: "image_url", image_url: { url: await readImageAsDataUrl(previousImage) } });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    ...earlier.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as ChatMessage["role"],
      content: historyLine(m),
    })),
    { role: "user", content: parts },
  ];

  const raw = await chatCompletion({ messages, temperature: 0.6, response_format: { type: "json_object" } });
  const json = extractJson<Record<string, unknown>>(raw);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const prompt = str(json.prompt).slice(0, 4000);
  return {
    reply: str(json.reply).slice(0, 1000),
    generate: json.generate !== false && prompt.length > 0,
    prompt,
    editPrevious: json.edit_previous === true && Boolean(previousImage),
    title: str(json.title).slice(0, 60) || null,
  };
}

async function setAssistant(id: string, patch: Partial<ImageChatMessage>): Promise<void> {
  await db
    .update(schema.imageChatMessages)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.imageChatMessages.id, id));
}

async function runAssistant(chat: ImageChat, assistantId: string): Promise<void> {
  try {
    const all = await listImageChatMessages(chat.id);
    const idx = all.findIndex((m) => m.id === assistantId);
    const history = all.slice(0, idx === -1 ? all.length : idx).filter((m) => m.status !== "error" || m.role === "user");
    if (!history.length || history[history.length - 1].role !== "user") {
      throw new Error("Nothing to answer.");
    }

    const plan = await planImageReply(history);
    if (chat.title === DEFAULT_IMAGE_CHAT_TITLE && plan.title) {
      await db
        .update(schema.imageChats)
        .set({ title: plan.title })
        .where(eq(schema.imageChats.id, chat.id));
    }
    if (!plan.generate) {
      await setAssistant(assistantId, { content: plan.reply || "…", status: "ready" });
      return;
    }

    const model = resolveImageChatModel(chat);
    await setAssistant(assistantId, {
      content: plan.reply,
      prompt: plan.prompt,
      model,
      status: "generating",
    });

    const latest = history[history.length - 1];
    const refUrls = parseImageChatUrls(latest.imageUrls);
    const previous = plan.editPrevious ? lastImageUrl(history.slice(0, -1)) : null;
    if (previous && !refUrls.includes(previous)) refUrls.unshift(previous);
    const references = await Promise.all(refUrls.map((u) => readImageAsDataUrl(u)));

    const prompt = previous
      ? `Edit the first reference image: ${plan.prompt}\nKeep everything that was not asked to change (people, identity, composition, style).`
      : references.length
        ? `${plan.prompt}\nUse the attached reference image(s) as described.`
        : plan.prompt;

    const img = await generateImage({
      prompt,
      model,
      ...(await catalogImageParams(model, chat.aspectRatio, { withReferences: references.length > 0 })),
      referenceImages: references.length ? references : undefined,
      referenceImagesFirst: true,
    });
    const url = withCacheBuster(
      await saveImageChatBuffer(chat.userId, chat.id, `${assistantId}.png`, await imageResultToBuffer(img)),
    );
    await setAssistant(assistantId, { imageUrls: JSON.stringify([url]), status: "ready", error: null });
    registerGeneratedMediaSafe({
      userId: chat.userId,
      url,
      name: chat.title === DEFAULT_IMAGE_CHAT_TITLE ? plan.title || chat.title : chat.title,
      product: IMAGE_CHAT_GALLERY_FOLDER,
    });
  } catch (err) {
    console.error(`[image-chat] message ${assistantId} failed`, err);
    await setAssistant(assistantId, { status: "error", error: errorMessage(err) });
  }
}

/** Store the user's message, add a pending assistant reply and answer it in the background. */
export async function sendImageChatMessage(input: {
  chat: ImageChat;
  text: string;
  attachmentUrls: string[];
}): Promise<void> {
  const now = Date.now();
  const assistantId = createId();
  await db.insert(schema.imageChatMessages).values([
    {
      id: createId(),
      chatId: input.chat.id,
      userId: input.chat.userId,
      role: "user",
      content: input.text,
      imageUrls: JSON.stringify(input.attachmentUrls),
      status: "ready",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
    {
      id: assistantId,
      chatId: input.chat.id,
      userId: input.chat.userId,
      role: "assistant",
      status: "thinking",
      createdAt: new Date(now + 1),
      updatedAt: new Date(now + 1),
    },
  ]);
  await db
    .update(schema.imageChats)
    .set({ updatedAt: new Date(now) })
    .where(eq(schema.imageChats.id, input.chat.id));
  void runAssistant(input.chat, assistantId);
}

export async function retryImageChatMessage(chat: ImageChat, message: ImageChatMessage): Promise<void> {
  await setAssistant(message.id, { status: "thinking", error: null, imageUrls: "[]" });
  void runAssistant(chat, message.id);
}
