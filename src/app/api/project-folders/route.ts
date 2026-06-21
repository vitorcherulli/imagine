import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = await db
    .select()
    .from(schema.projectFolders)
    .where(eq(schema.projectFolders.userId, userId))
    .orderBy(asc(schema.projectFolders.position), asc(schema.projectFolders.name));

  return NextResponse.json({ folders });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await db
    .select()
    .from(schema.projectFolders)
    .where(eq(schema.projectFolders.userId, userId))
    .orderBy(desc(schema.projectFolders.position))
    .limit(1);

  const now = new Date();
  const id = createId();
  await db.insert(schema.projectFolders).values({
    id,
    userId,
    name: parsed.data.name.trim(),
    position: (existing[0]?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });

  const [folder] = await db
    .select()
    .from(schema.projectFolders)
    .where(eq(schema.projectFolders.id, id))
    .limit(1);

  return NextResponse.json({ folder });
}
