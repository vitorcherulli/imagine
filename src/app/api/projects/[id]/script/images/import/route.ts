import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  importScriptKeywordImageMatch,
  importScriptKeywordImageMatches,
} from "@/lib/script-image-import-server";
import {
  paragraphImageSearchForTarget,
  refineParagraphImageTarget,
  scriptParagraphImageTargetFields,
} from "@/lib/script-paragraph-image-target";
import {
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  upsertParagraphImageSearch,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = refineParagraphImageTarget(
  scriptParagraphImageTargetFields
    .extend({
      keyword: z.string().min(1).max(80).optional(),
      imageId: z.string().min(1).max(80).optional(),
      importAll: z.boolean().optional(),
    })
    .refine((data) => data.importAll || Boolean(data.keyword?.trim()), {
      message: "keyword required unless importAll is set",
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

  const target = {
    speechIndex: parsed.data.speechIndex,
    pauseIndex: parsed.data.pauseIndex,
  };
  const notes = parseScriptDraftNotes(project.scriptDraftNotes);
  const entry = paragraphImageSearchForTarget(notes, target);
  if (!entry) {
    return NextResponse.json(
      { error: "Search images for this paragraph first." },
      { status: 400 },
    );
  }

  const speechIndex = entry.speechIndex ?? 0;
  const pauseIndex = entry.pauseIndex;

  try {
    let keywords = [...entry.keywords];
    const importErrors: string[] = [];

    if (parsed.data.importAll) {
      const imported = await importScriptKeywordImageMatches(
        params.id,
        speechIndex,
        keywords,
        { videoFormat: project.videoFormat, userId, pauseIndex },
      );
      keywords = imported.keywords;
      importErrors.push(...imported.importErrors);
    } else {
      const keyword = parsed.data.keyword?.trim();
      if (!keyword) {
        return NextResponse.json({ error: "keyword required" }, { status: 400 });
      }
      const idx = keywords.findIndex((k) => k.keyword === keyword);
      if (idx < 0) {
        return NextResponse.json({ error: "Keyword not found on this paragraph." }, { status: 400 });
      }
      keywords[idx] = await importScriptKeywordImageMatch(
        params.id,
        speechIndex,
        keywords[idx]!,
        parsed.data.imageId,
        { videoFormat: project.videoFormat, userId, pauseIndex },
      );
    }

    const updatedEntry = { ...entry, keywords };
    const nextNotes = upsertParagraphImageSearch(notes, updatedEntry);

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(nextNotes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    return NextResponse.json({
      ok: true,
      paragraphImages: updatedEntry,
      notes: nextNotes,
      importErrors: importErrors.length > 0 ? importErrors : undefined,
      partial: importErrors.length > 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image import failed" },
      { status: 500 },
    );
  }
}
