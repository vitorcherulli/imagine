import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { deleteAvatarMedia } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function getOwned(avatarId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.avatars)
    .where(and(eq(schema.avatars.id, avatarId), eq(schema.avatars.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ avatar: row });
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(2000).nullable().optional(),
  primaryImageUrl: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db
    .update(schema.avatars)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.avatars.id, row.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteAvatarMedia(userId, row.id, row.imageUrls);
  await db.delete(schema.avatars).where(eq(schema.avatars.id, row.id));
  await db
    .update(schema.projects)
    .set({ avatarId: null })
    .where(and(eq(schema.projects.avatarId, row.id), eq(schema.projects.userId, userId)));

  return NextResponse.json({ ok: true });
}
