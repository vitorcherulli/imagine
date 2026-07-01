import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { runScriptPremiereManifest } from "@/lib/script-manifest-server";
import {
  manifestReadiness,
  serializePremiereManifest,
} from "@/lib/script-premiere-manifest";
import {
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  script: z.string().max(40_000).optional(),
  skipVisualHints: z.boolean().optional(),
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

  const script = normalizeScriptText(parsed.data.script ?? project.scriptDraft ?? "");
  if (!script) {
    return NextResponse.json({ error: "No script draft to export." }, { status: 400 });
  }

  const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
  const readiness = manifestReadiness(script, existingNotes);
  if (readiness.totalSpeech === 0) {
    return NextResponse.json({ error: "Script has no narration paragraphs." }, { status: 400 });
  }
  if (readiness.withAudio === 0) {
    return NextResponse.json(
      { error: "Generate paragraph narration first — manifest needs audio durations." },
      { status: 400 },
    );
  }

  try {
    const models = resolveProjectApiModels(project);
    const manifest = await runScriptPremiereManifest({
      project,
      script,
      notes: existingNotes,
      llmModel: models.llmModel,
      skipVisualHints: parsed.data.skipVisualHints,
    });

    const notes = {
      ...existingNotes,
      premiereManifest: manifest,
      updatedAt: manifest.generatedAt,
    };

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(notes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    const filename = `${slugify(project.title || "project")}-manifest.json`;

    return NextResponse.json({
      ok: true,
      manifest,
      filename,
      json: serializePremiereManifest(manifest),
      readiness,
      notes,
      partial: !readiness.allReady,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Manifest export failed" },
      { status: 500 },
    );
  }
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}
