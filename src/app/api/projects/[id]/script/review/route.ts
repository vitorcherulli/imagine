import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptReviewSystemPrompt,
  buildScriptReviewUserPrompt,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  normalizeScriptSuggestions,
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  type ScriptReview,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const bodySchema = z.object({
  instruction: z.string().max(1000).optional(),
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

  const currentScript = normalizeScriptText(project.scriptDraft ?? "");
  if (!currentScript) {
    return NextResponse.json(
      { error: "Paste or write a script first, then ask for a review." },
      { status: 400 },
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const models = resolveProjectApiModels(project);
    const instruction = parsed.data.instruction?.trim();
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptReviewSystemPrompt() },
        {
          role: "user",
          content: buildScriptReviewUserPrompt({
            currentScript,
            instruction,
            project,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.45,
      response_format: { type: "json_object" },
    });

    const result = extractJson<{
      overall_summary?: string;
      strengths?: string[];
      suggestions?: unknown;
    }>(raw);

    const review: ScriptReview = {
      generatedAt: new Date().toISOString(),
      instruction,
      overallSummary: (result.overall_summary ?? "Review complete.").slice(0, 1200),
      strengths: Array.isArray(result.strengths)
        ? result.strengths.filter((s): s is string => typeof s === "string").slice(0, 6)
        : [],
      suggestions: normalizeScriptSuggestions(result.suggestions),
    };

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const notes = {
      ...existingNotes,
      review,
      updatedAt: review.generatedAt,
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
      review,
      notes,
      script: currentScript,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Script review failed" },
      { status: 500 },
    );
  }
}
