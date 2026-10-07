import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import { resolveProjectCoverUrl } from "@/lib/project-cover";
import { getVideoFormatSpec } from "@/lib/video-format";
import { getSocialAspectRatioSpec } from "@/lib/social-aspect-ratio";
import { isDubbingProject, isSocialProject, projectEditorHref } from "@/lib/social-content";
import { parseImageChatUrls } from "@/lib/image-chat";
import { aspectClassFor, type LibraryItem } from "@/lib/library-items";

async function loadProjectCovers(projects: Project[]): Promise<Record<string, string | null>> {
  if (projects.length === 0) return {};
  const projectIds = projects.map((p) => p.id);

  const [youtubeRows, blockRows, socialRows] = await Promise.all([
    db
      .select({
        projectId: schema.youtubeMetadata.projectId,
        thumbnailUrl: schema.youtubeMetadata.thumbnailUrl,
      })
      .from(schema.youtubeMetadata)
      .where(inArray(schema.youtubeMetadata.projectId, projectIds)),
    db
      .select({
        projectId: schema.storyBlocks.projectId,
        keyframeUrl: schema.storyBlocks.keyframeUrl,
      })
      .from(schema.storyBlocks)
      .where(inArray(schema.storyBlocks.projectId, projectIds))
      .orderBy(asc(schema.storyBlocks.position)),
    db
      .select({
        projectId: schema.socialSlides.projectId,
        imageUrl: schema.socialSlides.imageUrl,
      })
      .from(schema.socialSlides)
      .where(inArray(schema.socialSlides.projectId, projectIds))
      .orderBy(asc(schema.socialSlides.position)),
  ]);

  const thumbnailByProject = Object.fromEntries(
    youtubeRows.map((row) => [row.projectId, row.thumbnailUrl]),
  );
  const firstImage: Record<string, string> = {};
  for (const slide of socialRows) {
    if (!firstImage[slide.projectId] && slide.imageUrl) firstImage[slide.projectId] = slide.imageUrl;
  }
  for (const block of blockRows) {
    if (!firstImage[block.projectId] && block.keyframeUrl) {
      firstImage[block.projectId] = block.keyframeUrl;
    }
  }

  return Object.fromEntries(
    projects.map((p) => [
      p.id,
      resolveProjectCoverUrl({
        thumbnailUrl: thumbnailByProject[p.id],
        anchorImageUrl: p.anchorImageUrl,
        keyframeUrl: firstImage[p.id],
      }),
    ]),
  );
}

function projectItem(project: Project, coverUrl: string | null): LibraryItem {
  const social = isSocialProject(project);
  const dubbing = isDubbingProject(project);
  const fmt = social
    ? getSocialAspectRatioSpec(project.socialAspectRatio)
    : getVideoFormatSpec(project.videoFormat);
  const detail = social
    ? project.postFormat
    : dubbing
      ? (project.dubTargetLanguage ?? "?").toUpperCase()
      : `${project.targetDurationSeconds}s`;
  return {
    id: project.id,
    kind: social ? "social" : dubbing ? "dubbing" : "video",
    title: project.title || "Untitled",
    description: project.storyDescription,
    meta: `${project.status} · ${detail}`,
    href: projectEditorHref(project),
    coverUrl,
    coverVideoUrl: null,
    aspectClass: fmt.cardAspectClass,
    placeholder: dubbing ? fmt.shortLabel : `${fmt.shortLabel} · ${project.genre} · ${project.visualStyle}`,
    folderId: project.folderId ?? null,
    updatedAt: new Date(project.updatedAt).toISOString(),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function loadVariationItems(userId: string): Promise<LibraryItem[]> {
  const [sets, items] = await Promise.all([
    db.select().from(schema.variationSets).where(eq(schema.variationSets.userId, userId)),
    db
      .select({
        setId: schema.variationItems.setId,
        imageUrl: schema.variationItems.imageUrl,
      })
      .from(schema.variationItems)
      .where(eq(schema.variationItems.userId, userId))
      .orderBy(asc(schema.variationItems.createdAt)),
  ]);

  const count: Record<string, number> = {};
  const cover: Record<string, string> = {};
  for (const item of items) {
    count[item.setId] = (count[item.setId] ?? 0) + 1;
    if (!cover[item.setId] && item.imageUrl) cover[item.setId] = item.imageUrl;
  }

  return sets.map((set): LibraryItem => ({
    id: set.id,
    kind: "variations",
    title: set.name || "Untitled",
    description: set.instructions ?? "",
    meta: `${plural(count[set.id] ?? 0, "variation")} · ${set.aspectRatio}`,
    href: `/variations/${set.id}`,
    coverUrl: cover[set.id] ?? set.sourceImageUrl,
    coverVideoUrl: null,
    aspectClass: aspectClassFor(set.aspectRatio),
    placeholder: set.aspectRatio,
    folderId: set.folderId ?? null,
    updatedAt: new Date(set.updatedAt).toISOString(),
  }));
}

async function loadImageChatItems(userId: string): Promise<LibraryItem[]> {
  const [chats, messages] = await Promise.all([
    db.select().from(schema.imageChats).where(eq(schema.imageChats.userId, userId)),
    db
      .select({
        chatId: schema.imageChatMessages.chatId,
        imageUrls: schema.imageChatMessages.imageUrls,
      })
      .from(schema.imageChatMessages)
      .where(
        and(
          eq(schema.imageChatMessages.userId, userId),
          eq(schema.imageChatMessages.role, "assistant"),
          ne(schema.imageChatMessages.imageUrls, "[]"),
        ),
      )
      .orderBy(desc(schema.imageChatMessages.createdAt)),
  ]);

  const count: Record<string, number> = {};
  const cover: Record<string, string> = {};
  for (const message of messages) {
    const urls = parseImageChatUrls(message.imageUrls);
    count[message.chatId] = (count[message.chatId] ?? 0) + urls.length;
    if (!cover[message.chatId] && urls[0]) cover[message.chatId] = urls[0];
  }

  return chats.map((chat): LibraryItem => ({
    id: chat.id,
    kind: "image_chat",
    title: chat.title || "New chat",
    description: "",
    meta: `${plural(count[chat.id] ?? 0, "image")} · ${chat.aspectRatio}`,
    href: `/image-chat/${chat.id}`,
    coverUrl: cover[chat.id] ?? null,
    coverVideoUrl: null,
    aspectClass: aspectClassFor(chat.aspectRatio),
    placeholder: chat.aspectRatio,
    folderId: chat.folderId ?? null,
    updatedAt: new Date(chat.updatedAt).toISOString(),
  }));
}

async function loadSwapItems(userId: string): Promise<LibraryItem[]> {
  const [swaps, items] = await Promise.all([
    db.select().from(schema.personSwaps).where(eq(schema.personSwaps.userId, userId)),
    db
      .select({
        swapId: schema.personSwapItems.swapId,
        avatarName: schema.personSwapItems.avatarName,
        keyframeUrl: schema.personSwapItems.keyframeUrl,
        status: schema.personSwapItems.status,
      })
      .from(schema.personSwapItems)
      .where(eq(schema.personSwapItems.userId, userId))
      .orderBy(asc(schema.personSwapItems.createdAt)),
  ]);

  const people: Record<string, string[]> = {};
  const ready: Record<string, number> = {};
  const cover: Record<string, string> = {};
  for (const item of items) {
    (people[item.swapId] ??= []).push(item.avatarName || "Person");
    if (item.status === "ready") ready[item.swapId] = (ready[item.swapId] ?? 0) + 1;
    if (!cover[item.swapId] && item.keyframeUrl) cover[item.swapId] = item.keyframeUrl;
  }

  return swaps.map((swap): LibraryItem => {
    const names = people[swap.id] ?? [];
    return {
      id: swap.id,
      kind: "swap",
      title: swap.name || "Untitled",
      description: names.length ? `→ ${names.join(", ")}` : "",
      meta: `${ready[swap.id] ?? 0}/${names.length} ready · ${Math.round(swap.durationSeconds)}s`,
      href: `/swap/${swap.id}`,
      coverUrl: cover[swap.id] ?? null,
      coverVideoUrl: swap.sourceUrl,
      aspectClass: aspectClassFor(swap.aspectRatio),
      placeholder: swap.aspectRatio,
      folderId: swap.folderId ?? null,
      updatedAt: new Date(swap.updatedAt).toISOString(),
    };
  });
}

/** Everything the user has made, as one list for the Projects library. */
export async function loadLibraryItems(
  userId: string,
  projects: Project[],
): Promise<LibraryItem[]> {
  const [covers, variations, chats, swaps] = await Promise.all([
    loadProjectCovers(projects),
    loadVariationItems(userId),
    loadImageChatItems(userId),
    loadSwapItems(userId),
  ]);

  return [
    ...projects.map((p) => projectItem(p, covers[p.id] ?? null)),
    ...variations,
    ...chats,
    ...swaps,
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
