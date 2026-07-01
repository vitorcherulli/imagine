import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
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

const bodySchema = refineParagraphImageTarget(
  scriptParagraphImageTargetFields.extend({
    keyword: z.string().min(1).max(80),
    imageId: z.string().min(1).max(80),
  }),
);

/** Pick a different search result for a keyword (before import). */
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
    return NextResponse.json({ error: "Paragraph image search not found." }, { status: 400 });
  }

  const idx = entry.keywords.findIndex((k) => k.keyword === parsed.data.keyword);
  if (idx < 0) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 400 });
  }

  const kw = entry.keywords[idx]!;
  if (!kw.results.some((r) => r.id === parsed.data.imageId)) {
    return NextResponse.json({ error: "Image not in results for this keyword." }, { status: 400 });
  }

  const keywords = [...entry.keywords];
  keywords[idx] = {
    ...kw,
    selectedId: parsed.data.imageId,
    importedUrl: undefined,
    importedAt: undefined,
  };

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
  });
}
