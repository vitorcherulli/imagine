import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { getOwnedFolder } from "@/lib/project-library";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folder = await getOwnedFolder(params.id, userId);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await db
    .update(schema.projectFolders)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.projectFolders.id, params.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folder = await getOwnedFolder(params.id, userId);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(schema.projects)
    .set({ folderId: null, updatedAt: new Date() })
    .where(and(eq(schema.projects.folderId, params.id), eq(schema.projects.userId, userId)));

  await db.delete(schema.projectFolders).where(eq(schema.projectFolders.id, params.id));
  return NextResponse.json({ ok: true });
}
