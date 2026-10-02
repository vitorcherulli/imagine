import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { tryUser } from "@/lib/auth";
import { saveImageChatBuffer, withCacheBuster } from "@/lib/storage";
import { IMAGE_CHAT_MAX_ATTACHMENTS } from "@/lib/image-chat";
import {
  allChatImageUrls,
  getOwnedImageChat,
  listImageChatMessages,
  sendImageChatMessage,
} from "@/lib/image-chat-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chat = await getOwnedImageChat(params.id, userId);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await listImageChatMessages(chat.id);
  if (messages.some((m) => m.status === "thinking" || m.status === "generating")) {
    return NextResponse.json({ error: "Wait for the current image to finish" }, { status: 409 });
  }

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const files = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  const known = allChatImageUrls(messages);
  const refUrls = form
    .getAll("refUrls")
    .map(String)
    .filter((u) => known.has(u));

  if (!text && files.length === 0 && refUrls.length === 0) {
    return NextResponse.json({ error: "Write a message" }, { status: 400 });
  }
  if (files.length + refUrls.length > IMAGE_CHAT_MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Up to ${IMAGE_CHAT_MAX_ATTACHMENTS} images per message` },
      { status: 400 },
    );
  }

  const uploaded: string[] = [];
  for (const file of files) {
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: "Use JPG, PNG or WebP images" }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} is larger than 20MB` }, { status: 400 });
    }
    uploaded.push(
      withCacheBuster(
        await saveImageChatBuffer(userId, chat.id, `ref_${createId()}.${ext}`, Buffer.from(await file.arrayBuffer())),
      ),
    );
  }

  await sendImageChatMessage({ chat, text, attachmentUrls: [...refUrls, ...uploaded] });
  return NextResponse.json({ ok: true });
}
