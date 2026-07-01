import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptDeliverySystemPrompt,
  buildScriptDeliveryUserPrompt,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  normalizeScriptDeliverySpans,
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  type ScriptDeliveryAnalysis,
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
      { error: "Paste or write a script first, then analyze delivery." },
      { status: 400 },
    );
  }

  try {
    const models = resolveProjectApiModels(project);
    const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptDeliverySystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildScriptDeliveryUserPrompt({
            currentScript,
            project,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const result = extractJson<{
      overall_pace?: string;
      spans?: unknown;
    }>(raw);

    const generatedAt = new Date().toISOString();
    const delivery: ScriptDeliveryAnalysis = {
      generatedAt,
      overallPace: (result.overall_pace ?? "").trim().slice(0, 600) || undefined,
      spans: normalizeScriptDeliverySpans(result.spans),
    };

    if (delivery.spans.length === 0) {
      return NextResponse.json(
        { error: "Could not mark delivery emphasis. Try again." },
        { status: 502 },
      );
    }

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const notes = {
      ...existingNotes,
      delivery,
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
      delivery,
      notes,
      script: currentScript,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delivery analysis failed" },
      { status: 500 },
    );
  }
}
