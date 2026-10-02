import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import {
  getOwnedImageChat,
  listImageChatMessages,
  retryImageChatMessage,
} from "@/lib/image-chat-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; messageId: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getOwnedImageChat(params.id, userId);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await listImageChatMessages(chat.id);
  if (messages.some((m) => m.status === "thinking" || m.status === "generating")) {
    return NextResponse.json({ error: "Wait for the current image to finish" }, { status: 409 });
  }
  const message = messages.find((m) => m.id === params.messageId && m.role === "assistant");
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await retryImageChatMessage(chat, message);
  return NextResponse.json({ ok: true });
}
