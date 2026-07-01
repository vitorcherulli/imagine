import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptPronunciationSystemPrompt,
  buildScriptPronunciationUserPrompt,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  normalizeScriptPronunciationHints,
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  type ScriptPronunciationAnalysis,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

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

  const currentScript = normalizeScriptText(
    parsed.data.script ?? project.scriptDraft ?? "",
  );
  if (!currentScript) {
    return NextResponse.json(
      { error: "Paste or write a script first, then analyze pronunciation." },
      { status: 400 },
    );
  }

  try {
    const models = resolveProjectApiModels(project);
    const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptPronunciationSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildScriptPronunciationUserPrompt({
            currentScript,
            project,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    const result = extractJson<{
      summary?: string;
      hints?: unknown;
    }>(raw);

    const generatedAt = new Date().toISOString();
    const pronunciation: ScriptPronunciationAnalysis = {
      generatedAt,
      summary: (result.summary ?? "").trim().slice(0, 800) || undefined,
      hints: normalizeScriptPronunciationHints(result.hints),
    };

    if (pronunciation.hints.length === 0) {
      return NextResponse.json(
        { error: "No pronunciation hints found. Try again or add hints manually later." },
        { status: 502 },
      );
    }

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const notes = {
      ...existingNotes,
      pronunciation,
      paragraphNarration: undefined,
      updatedAt: generatedAt,
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
      pronunciation,
      notes,
      script: currentScript,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pronunciation analysis failed" },
      { status: 500 },
    );
  }
}
