import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { deleteImageChatMedia } from "@/lib/storage";
import { isModelId } from "@/lib/model-catalog";
import { VARIATION_ASPECTS } from "@/lib/variations";
import { getOwnedImageChat, listImageChatMessages } from "@/lib/image-chat-server";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  imageModel: z.string().refine(isModelId).optional(),
  aspectRatio: z.enum(VARIATION_ASPECTS).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getOwnedImageChat(params.id, userId);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ chat, messages: await listImageChatMessages(chat.id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getOwnedImageChat(params.id, userId);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  await db
    .update(schema.imageChats)
    .set(parsed.data)
    .where(eq(schema.imageChats.id, chat.id));
  return NextResponse.json({ chat: await getOwnedImageChat(chat.id, userId) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getOwnedImageChat(params.id, userId);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(schema.imageChatMessages).where(eq(schema.imageChatMessages.chatId, chat.id));
  await db.delete(schema.imageChats).where(eq(schema.imageChats.id, chat.id));
  await deleteImageChatMedia(userId, chat.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
