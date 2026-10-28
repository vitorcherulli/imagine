import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { tryUser } from "@/lib/auth";
import {
  applyChatEdit,
  getOwnedMotionDesign,
  parseMessages,
  parseProps,
  updateMotionDesign,
  type MotionChatMessage,
} from "@/lib/motion/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwnedMotionDesign(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Escreva uma mensagem" }, { status: 400 });

  const props = parseProps(row.props, row.templateId);
  const history = parseMessages(row.messages);

  let result: { reply: string; props: ReturnType<typeof parseProps> };
  try {
    result = await applyChatEdit({ templateId: row.templateId, props, history, message });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const now = Date.now();
  const userMsg: MotionChatMessage = { id: createId(), role: "user", content: message, createdAt: now };
  const botMsg: MotionChatMessage = {
    id: createId(),
    role: "assistant",
    content: result.reply,
    props: result.props,
    createdAt: now + 1,
  };
  const messages = [...history, userMsg, botMsg];

  await updateMotionDesign(row.id, {
    props: JSON.stringify(result.props),
    messages: JSON.stringify(messages),
  });

  return NextResponse.json({ reply: result.reply, props: result.props, messages });
}
