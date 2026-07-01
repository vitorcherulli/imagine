import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { importScriptKeywordVideoMatch } from "@/lib/script-video-import-server";
import {
  runScriptCustomKeywordVideoSearch,
  runScriptParagraphVideoSearch,
  scriptVideoSearchProviderLabel,
} from "@/lib/script-video-search-server";
import { listScriptSpeechParagraphs } from "@/lib/script-narration-utils";
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
  keyword: z.string().min(1).max(120).optional(),
  /** When true (default for paragraph auto-search), import the best ranked clip immediately. */
  autoImport: z.boolean().optional().default(true),
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

    const customKeyword = parsed.data.keyword?.trim();
    const models = resolveProjectApiModels(project);
    let match;
    let searchQuery: string | undefined;

    if (customKeyword) {
      match = await runScriptCustomKeywordVideoSearch({
        keyword: customKeyword,
        speechIndex: paragraph.speechIndex,
        textKey: paragraph.textKey,
        existingKeywords: existingEntry?.keywords,
        videoFormat: project.videoFormat,
      });
      if (!match) {
        return NextResponse.json(
          { error: `No videos found for "${customKeyword}". Try a shorter or different phrase.` },
          { status: 404 },
        );
      }
    } else {
      const auto = await runScriptParagraphVideoSearch({
        project,
        paragraphText: paragraph.text,
        speechIndex: paragraph.speechIndex,
        textKey: paragraph.textKey,
        existingKeywords: existingEntry?.keywords,
        llmModel: models.llmModel,
      });
      if (!auto) {
        return NextResponse.json(
          { error: "No stock videos found for this paragraph. Try a specific search phrase." },
          { status: 404 },
        );
      }
      match = auto.match;
      searchQuery = auto.searchQuery;
    }

    const baseEntry = existingEntry ?? {
      speechIndex: paragraph.speechIndex,
      textKey: paragraph.textKey,
      searchedAt: new Date().toISOString(),
      provider: scriptVideoSearchProviderLabel(),
      keywords: [],
    };

    let keywords = [...baseEntry.keywords, match];
    let imported = false;

    if (parsed.data.autoImport) {
      const idx = keywords.length - 1;
      keywords[idx] = await importScriptKeywordVideoMatch(
        project.id,
        paragraph.speechIndex,
        keywords[idx]!,
        undefined,
        { userId },
      );
      imported = true;
    }

    const result = {
      ...baseEntry,
      searchedAt: new Date().toISOString(),
      provider: scriptVideoSearchProviderLabel(),
      keywords,
    };

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
      addedKeywords: 1,
      searchQuery,
      imported,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video search failed" },
      { status: 500 },
    );
  }
}
