import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  deleteEditorialBlock,
  generateAndSaveEditorialBlockImage,
  StyleBibleError,
} from "@/lib/style-bible-server";
import { styleBibleFieldKeySchema } from "@/lib/style-bible";

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

function parseField(raw: string) {
  const parsed = styleBibleFieldKeySchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; field: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const field = parseField(params.field);
  if (!field) return NextResponse.json({ error: "Invalid editorial block" }, { status: 400 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await generateAndSaveEditorialBlockImage(project, field);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof StyleBibleError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Block reference generation failed" },
      { status },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; field: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const field = parseField(params.field);
  if (!field) return NextResponse.json({ error: "Invalid editorial block" }, { status: 400 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const document = await deleteEditorialBlock(project, field);
    return NextResponse.json({ document });
  } catch (err) {
    const status = err instanceof StyleBibleError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete editorial block" },
      { status },
    );
  }
}
