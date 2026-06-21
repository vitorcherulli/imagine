import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  generateAndSaveAnchor,
  StyleBibleError,
} from "@/lib/style-bible-server";
import { deleteMediaByPublicUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await generateAndSaveAnchor(project);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof StyleBibleError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Anchor generation failed" },
      { status },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.anchorImageUrl) await deleteMediaByPublicUrl(project.anchorImageUrl);
  await db
    .update(schema.projects)
    .set({ anchorImageUrl: null, anchorImagePrompt: null, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ ok: true });
}
