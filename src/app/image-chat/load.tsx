import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ImageChatApp } from "@/components/ImageChatApp";
import { OPENROUTER_MODELS } from "@/lib/openrouter/client";
import { getOwnedImageChat, listImageChatMessages } from "@/lib/image-chat-server";

export async function ImageChatPage({ chatId }: { chatId: string | null }) {
  const { userId } = await auth();
  if (!userId) return null;

  const chat = chatId ? await getOwnedImageChat(chatId, userId) : null;
  if (chatId && !chat) notFound();

  const [projects, chats, messages] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.imageChats)
      .where(eq(schema.imageChats.userId, userId))
      .orderBy(desc(schema.imageChats.updatedAt)),
    chat ? listImageChatMessages(chat.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="min-w-0 flex-1 overflow-hidden">
        <ImageChatApp
          initialChats={chats}
          initialChat={chat}
          initialMessages={messages}
          defaultImageModel={OPENROUTER_MODELS.image}
        />
      </main>
    </div>
  );
}
