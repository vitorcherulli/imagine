import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getOwnedFolder } from "@/lib/project-library";
import { LIBRARY_KINDS, type LibraryKind } from "@/lib/library-items";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(LIBRARY_KINDS.map((k) => k.id) as [LibraryKind, ...LibraryKind[]]),
  id: z.string().min(1),
  folderId: z.string().nullable(),
});

async function moveItem(kind: LibraryKind, id: string, userId: string, folderId: string | null) {
  const set = { folderId, updatedAt: new Date() };
  switch (kind) {
    case "video":
    case "social":
    case "dubbing":
      return db
        .update(schema.projects)
        .set(set)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
        .returning({ id: schema.projects.id });
    case "variations":
      return db
        .update(schema.variationSets)
        .set(set)
        .where(and(eq(schema.variationSets.id, id), eq(schema.variationSets.userId, userId)))
        .returning({ id: schema.variationSets.id });
    case "image_chat":
      return db
        .update(schema.imageChats)
        .set(set)
        .where(and(eq(schema.imageChats.id, id), eq(schema.imageChats.userId, userId)))
        .returning({ id: schema.imageChats.id });
    case "swap":
      return db
        .update(schema.personSwaps)
        .set(set)
        .where(and(eq(schema.personSwaps.id, id), eq(schema.personSwaps.userId, userId)))
        .returning({ id: schema.personSwaps.id });
  }
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, id, folderId } = parsed.data;

  if (folderId && !(await getOwnedFolder(folderId, userId))) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const rows = await moveItem(kind, id, userId, folderId);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
