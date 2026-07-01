import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { pruneBrokenScriptMediaRefs } from "@/lib/script-media-prune";
import {
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = parseScriptDraftNotes(project.scriptDraftNotes);
  const { notes: prunedNotes, prunedCount } = await pruneBrokenScriptMediaRefs(notes);

  if (prunedCount > 0) {
    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(prunedNotes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));
  }

  return NextResponse.json({
    ok: true,
    prunedCount,
    notes: prunedCount > 0 ? prunedNotes : notes,
  });
}
