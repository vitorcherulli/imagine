import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  mergeStyleBible,
  parseStyleBible,
  serializeStyleBible,
  styleBiblePartialSchema,
  styleBibleSchema,
  type StyleBible,
} from "@/lib/style-bible";
import {
  generateAndSaveStyleBible,
  StyleBibleError,
} from "@/lib/style-bible-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ styleBible: parseStyleBible(project.styleBible) });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const bible = await generateAndSaveStyleBible(project);
    return NextResponse.json({ styleBible: bible });
  } catch (err) {
    const status = err instanceof StyleBibleError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Style bible generation failed" },
      { status },
    );
  }
}

const patchBody = z.object({
  patch: styleBiblePartialSchema.optional(),
  bible: styleBibleSchema.optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const current = parseStyleBible(project.styleBible);
  let next: StyleBible;
  if (parsed.data.bible) {
    next = parsed.data.bible;
  } else if (parsed.data.patch) {
    const merged = mergeStyleBible(current, parsed.data.patch);
    const validated = styleBibleSchema.safeParse(merged);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Resulting style bible is incomplete", details: validated.error.flatten() },
        { status: 400 },
      );
    }
    next = validated.data;
  } else {
    return NextResponse.json({ error: "Provide patch or bible" }, { status: 400 });
  }

  await db
    .update(schema.projects)
    .set({ styleBible: serializeStyleBible(next), updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  return NextResponse.json({ styleBible: next });
}
