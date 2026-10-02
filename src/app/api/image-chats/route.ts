import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { VARIATION_ASPECTS } from "@/lib/variations";
import { DEFAULT_IMAGE_CHAT_TITLE } from "@/lib/image-chat";
import { getOwnedImageChat } from "@/lib/image-chat-server";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  imageModel: z.string().refine(isModelId).optional(),
  aspectRatio: z.enum(VARIATION_ASPECTS).optional(),
});

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chats = await db
    .select()
    .from(schema.imageChats)
    .where(eq(schema.imageChats.userId, userId))
    .orderBy(desc(schema.imageChats.updatedAt));
  return NextResponse.json({ chats });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const id = createId();
  const now = new Date();
  await db.insert(schema.imageChats).values({
    id,
    userId,
    title: DEFAULT_IMAGE_CHAT_TITLE,
    imageModel: parsed.data.imageModel ?? null,
    aspectRatio: parsed.data.aspectRatio ?? "1:1",
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ chat: await getOwnedImageChat(id, userId) });
}
