import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  runScriptCustomKeywordImageSearch,
  runScriptParagraphImageSearch,
} from "@/lib/script-image-search-server";
import {
  listScriptPauseParagraphs,
  listScriptSpeechParagraphs,
  pauseSearchContext,
} from "@/lib/script-narration-utils";
import {
  paragraphImageSearchForTarget,
  refineParagraphImageTarget,
  scriptParagraphImageTargetFields,
} from "@/lib/script-paragraph-image-target";
import { PAUSE_VISUAL_PROMPT } from "@/lib/script-pause";
import {
  mergeParagraphImageSearch,
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  upsertParagraphImageSearch,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = refineParagraphImageTarget(
  scriptParagraphImageTargetFields.extend({
    script: z.string().max(40_000).optional(),
    keyword: z.string().min(1).max(120).optional(),
    merge: z.boolean().optional().default(true),
  }),
);

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
  const target = {
    speechIndex: parsed.data.speechIndex,
    pauseIndex: parsed.data.pauseIndex,
  };

  let paragraphText = "";
  let textKey = "";
  let speechIndex: number | undefined;
  let pauseIndex: number | undefined;

  if (parsed.data.pauseIndex !== undefined) {
    const pause = listScriptPauseParagraphs(script).find(
      (p) => p.pauseIndex === parsed.data.pauseIndex,
    );
    if (!pause) {
      return NextResponse.json({ error: "Pause not found in script." }, { status: 400 });
    }
    pauseIndex = pause.pauseIndex;
    textKey = pause.textKey;
    const context = pauseSearchContext(script, pause.pauseIndex);
    paragraphText = context
      ? `${context}\n\n${PAUSE_VISUAL_PROMPT}`
      : PAUSE_VISUAL_PROMPT;
  } else {
    const paragraph = listScriptSpeechParagraphs(script).find(
      (p) => p.speechIndex === parsed.data.speechIndex,
    );
    if (!paragraph) {
      return NextResponse.json({ error: "Paragraph not found in script." }, { status: 400 });
    }
    speechIndex = paragraph.speechIndex;
    textKey = paragraph.textKey;
    paragraphText = paragraph.text;
  }

  try {
    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const existingEntry = paragraphImageSearchForTarget(existingNotes, target);

    let result;
    const customKeyword = parsed.data.keyword?.trim();

    if (customKeyword) {
      const match = await runScriptCustomKeywordImageSearch({
        keyword: customKeyword,
        speechIndex,
        pauseIndex,
        textKey,
        existingKeywords: existingEntry?.keywords,
      });
      if (!match) {
        return NextResponse.json(
          { error: `No photos found for "${customKeyword}". Try a shorter or different phrase.` },
          { status: 404 },
        );
      }
      const baseEntry = existingEntry ?? {
        ...(pauseIndex !== undefined ? { pauseIndex } : { speechIndex: speechIndex! }),
        textKey,
        searchedAt: new Date().toISOString(),
        provider: "custom",
        keywords: [],
      };
      result = {
        ...baseEntry,
        searchedAt: new Date().toISOString(),
        keywords: [...baseEntry.keywords, match],
      };
    } else {
      const models = resolveProjectApiModels(project);
      const autoResult = await runScriptParagraphImageSearch({
        project,
        paragraphText,
        speechIndex,
        pauseIndex,
        textKey,
        llmModel: models.llmModel,
      });
      result =
        parsed.data.merge && existingEntry
          ? mergeParagraphImageSearch(existingEntry, autoResult)
          : autoResult;
    }

    const notes = upsertParagraphImageSearch(existingNotes, result);

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(notes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    return NextResponse.json({
      ok: true,
      paragraphImages: result,
      notes,
      addedKeywords: customKeyword
        ? 1
        : Math.max(0, result.keywords.length - (existingEntry?.keywords.length ?? 0)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image search failed" },
      { status: 500 },
    );
  }
}
