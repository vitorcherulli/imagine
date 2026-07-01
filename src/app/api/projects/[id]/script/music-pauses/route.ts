import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptMusicPausesSystemPrompt,
  buildScriptMusicPausesUserPrompt,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  applyMusicPauseInsertions,
  countScriptSpeechParagraphs,
  normalizeMusicPauseInsertions,
  stripScriptPauseBlocks,
  suggestMusicPauseTargetRange,
  type ScriptMusicPausesAnalysis,
} from "@/lib/script-music-pauses";
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
export const maxDuration = 120;

const bodySchema = z.object({
  script: z.string().max(40_000).optional(),
  replaceExisting: z.boolean().optional().default(true),
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
      { error: "Paste or write a script first, then auto-place music moments." },
      { status: 400 },
    );
  }

  const speechCount = countScriptSpeechParagraphs(currentScript);
  if (speechCount < 3) {
    return NextResponse.json(
      { error: "Add at least 3 narration paragraphs before auto-placing music moments." },
      { status: 400 },
    );
  }

  const targetPauseRange = suggestMusicPauseTargetRange(speechCount);

  try {
    const models = resolveProjectApiModels(project);
    const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
    const scriptForAnalysis =
      parsed.data.replaceExisting !== false
        ? stripScriptPauseBlocks(currentScript)
        : currentScript;

    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptMusicPausesSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildScriptMusicPausesUserPrompt({
            currentScript: scriptForAnalysis,
            speechParagraphCount: countScriptSpeechParagraphs(scriptForAnalysis),
            targetPauseRange,
            project,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.45,
      response_format: { type: "json_object" },
    });

    const result = extractJson<{
      overall_strategy?: string;
      insertions?: unknown;
    }>(raw);

    const insertions = normalizeMusicPauseInsertions(
      result.insertions,
      countScriptSpeechParagraphs(scriptForAnalysis),
    );

    if (insertions.length === 0) {
      return NextResponse.json(
        { error: "Could not find good music-moment spots. Try again or add pauses manually." },
        { status: 502 },
      );
    }

    const { script: updatedScript, appliedCount } = applyMusicPauseInsertions(
      currentScript,
      insertions,
      { replaceExisting: parsed.data.replaceExisting },
    );

    const generatedAt = new Date().toISOString();
    const musicPauses: ScriptMusicPausesAnalysis = {
      generatedAt,
      overallStrategy: (result.overall_strategy ?? "").trim().slice(0, 600) || undefined,
      insertionCount: appliedCount,
      insertions,
    };

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const changeSummary = `AI placed ${appliedCount} music moment${appliedCount === 1 ? "" : "s"} for dynamic pacing.`;
    const notes = {
      ...existingNotes,
      musicPauses,
      updatedAt: generatedAt,
      sourceMode: "edited" as const,
      lastChangeSummary: changeSummary,
    };

    const saved = await saveScriptDraft(project, {
      script: updatedScript,
      notes,
      status: "draft",
      versionSource: "music_pauses",
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
      musicPauses,
      appliedCount,
      changeSummary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Music pause placement failed" },
      { status: 500 },
    );
  }
}
