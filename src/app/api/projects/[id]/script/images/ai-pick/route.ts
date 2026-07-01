import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { runScriptParagraphAiImagePick } from "@/lib/script-image-ai-pick-server";
import { listScriptSpeechParagraphs, narrationClipForSpeechIndex } from "@/lib/script-narration-utils";
import {
  normalizeScriptText,
  paragraphImageSearchForSpeech,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  upsertParagraphImageSearch,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  speechIndex: z.number().int().min(0).max(200),
  script: z.string().max(40_000).optional(),
  /** When false, search + rank only — no download/import. Default true. */
  importImages: z.boolean().optional().default(true),
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
  const paragraph = listScriptSpeechParagraphs(script).find(
    (p) => p.speechIndex === parsed.data.speechIndex,
  );
  if (!paragraph) {
    return NextResponse.json({ error: "Paragraph not found in script." }, { status: 400 });
  }

  try {
    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const existingEntry = paragraphImageSearchForSpeech(
      existingNotes,
      paragraph.speechIndex,
      paragraph.textKey,
    );
    const narrationClip = narrationClipForSpeechIndex(
      existingNotes.paragraphNarration,
      paragraph.speechIndex,
      paragraph.textKey,
    );
    const models = resolveProjectApiModels(project);

    const result = await runScriptParagraphAiImagePick({
      project,
      projectId: project.id,
      userId,
      paragraphText: paragraph.text,
      speechIndex: paragraph.speechIndex,
      textKey: paragraph.textKey,
      llmModel: models.llmModel,
      narrationClip,
      existingEntry,
      importImages: parsed.data.importImages,
    });

    const notes = upsertParagraphImageSearch(existingNotes, result.entry);

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(notes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    return NextResponse.json({
      ok: true,
      paragraphImages: result.entry,
      notes,
      targetCount: result.targetCount,
      durationSeconds: result.durationSeconds,
      keywordsAdded: result.keywordsAdded,
      importedCount: result.importedCount,
      importErrors: result.importErrors.length > 0 ? result.importErrors : undefined,
      partial: result.importErrors.length > 0,
      alreadyComplete: result.keywordsAdded === 0 && result.importErrors.length === 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI image pick failed" },
      { status: 500 },
    );
  }
}
