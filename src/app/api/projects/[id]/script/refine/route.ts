import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptApplyFixesSystemPrompt,
  buildScriptApplyFixesUserPrompt,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  computeScriptStats,
  normalizeScriptText,
  parseScriptDraftNotes,
} from "@/lib/script-studio";
import {
  listScriptVersionMeta,
  saveScriptDraft,
} from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const bodySchema = z.object({
  instruction: z.string().min(2).max(16_000),
  /** Exact quotes from the script to prioritize editing. */
  focusQuotes: z.array(z.string().min(1).max(500)).max(12).optional(),
  suggestionId: z.string().max(20).optional(),
  /** Client draft when autosave has not flushed yet. */
  script: z.string().max(40_000).optional(),
});

function sanitizeRefineBody(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  return {
    instruction: typeof o.instruction === "string" ? o.instruction.trim().slice(0, 16_000) : "",
    focusQuotes: Array.isArray(o.focusQuotes)
      ? o.focusQuotes
          .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          .slice(0, 12)
          .map((q) => q.trim().slice(0, 500))
      : undefined,
    suggestionId:
      typeof o.suggestionId === "string" ? o.suggestionId.trim().slice(0, 20) : undefined,
    script: typeof o.script === "string" ? o.script : undefined,
  };
}

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
  const parsed = bodySchema.safeParse(sanitizeRefineBody(json));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const currentScript = normalizeScriptText(
    parsed.data.script ?? project.scriptDraft ?? "",
  );
  if (!currentScript) {
    return NextResponse.json(
      { error: "No script to improve. Paste or write your draft first." },
      { status: 400 },
    );
  }

  const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
  let focusQuotes = parsed.data.focusQuotes ?? [];
  if (parsed.data.suggestionId && existingNotes.review) {
    const hit = existingNotes.review.suggestions.find(
      (s) => s.id === parsed.data.suggestionId,
    );
    if (hit) focusQuotes = [hit.quote, ...focusQuotes];
  }

  try {
    const models = resolveProjectApiModels(project);
    const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptApplyFixesSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildScriptApplyFixesUserPrompt({
            currentScript,
            instruction: parsed.data.instruction,
            focusQuotes: focusQuotes.length ? focusQuotes : undefined,
            project,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    const result = extractJson<{
      script?: string;
      change_summary?: string;
      applied_fixes?: string[];
    }>(raw);
    const updated = normalizeScriptText(result.script ?? "");
    if (!updated) {
      return NextResponse.json(
        { error: "LLM returned empty script." },
        { status: 502 },
      );
    }

    const changeSummary = (result.change_summary ?? "Applied targeted edits.").slice(0, 800);
    const notes = {
      ...existingNotes,
      sourceMode: "edited" as const,
      updatedAt: new Date().toISOString(),
      lastInstruction: parsed.data.instruction,
      lastChangeSummary: changeSummary,
      review: undefined,
    };

    const saved = await saveScriptDraft(project, {
      script: updated,
      notes,
      status: "draft",
      versionSource: "refine",
      versionSummary: changeSummary,
    });

    const versions = await listScriptVersionMeta(project.id, saved.currentVersion);

    return NextResponse.json({
      ok: true,
      script: saved.script,
      notes: saved.notes,
      status: saved.status,
      currentVersion: saved.currentVersion,
      versionCreated: saved.versionCreated,
      versions,
      stats: computeScriptStats(saved.script),
      changeSummary,
      appliedFixes: result.applied_fixes ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Script improve failed" },
      { status: 500 },
    );
  }
}
