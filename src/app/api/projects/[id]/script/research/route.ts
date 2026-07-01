import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { runScriptWebResearch } from "@/lib/script-research-server";
import {
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  script: z.string().max(40_000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (!project.storyDescription?.trim()) {
    return NextResponse.json(
      { error: "Add a project brief (story description) first." },
      { status: 400 },
    );
  }

  const currentScript = normalizeScriptText(
    parsed.data.script ?? project.scriptDraft ?? "",
  );

  try {
    const models = resolveProjectApiModels(project);
    const research = await runScriptWebResearch({
      project,
      currentScript: currentScript || undefined,
      llmModel: models.llmModel,
    });

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const notes = {
      ...existingNotes,
      research,
      updatedAt: research.generatedAt,
    };

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(notes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    return NextResponse.json({
      ok: true,
      research,
      notes,
      script: currentScript || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Web research failed" },
      { status: 500 },
    );
  }
}
