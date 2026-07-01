import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  keepImportedParagraphImagesOnly,
  parseScriptDraftNotes,
  removeKeywordFromParagraphImageSearch,
  serializeScriptDraftNotes,
} from "@/lib/script-studio";
import {
  paragraphImageSearchForTarget,
  refineParagraphImageTarget,
  scriptParagraphImageTargetFields,
} from "@/lib/script-paragraph-image-target";

export const dynamic = "force-dynamic";

const bodySchema = refineParagraphImageTarget(
  scriptParagraphImageTargetFields
    .extend({
      keyword: z.string().min(1).max(80).optional(),
      keepImportedOnly: z.boolean().optional(),
    })
    .refine((data) => data.keepImportedOnly || Boolean(data.keyword?.trim()), {
      message: "keyword required unless keepImportedOnly is set",
    }),
);

/** Remove a keyword bubble, or keep only imported photos for a paragraph. */
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

  const target =
    parsed.data.pauseIndex !== undefined
      ? { pauseIndex: parsed.data.pauseIndex }
      : { speechIndex: parsed.data.speechIndex! };

  const notes = parseScriptDraftNotes(project.scriptDraftNotes);
  const entry = paragraphImageSearchForTarget(notes, target);
  if (!entry) {
    return NextResponse.json({ error: "Paragraph image search not found." }, { status: 400 });
  }

  let nextNotes;
  let removedCount = 0;

  if (parsed.data.keepImportedOnly) {
    const before = entry.keywords.length;
    nextNotes = keepImportedParagraphImagesOnly(notes, target);
    const after = paragraphImageSearchForTarget(nextNotes, target)?.keywords.length ?? 0;
    removedCount = before - after;
  } else {
    const keyword = parsed.data.keyword!.trim();
    if (!entry.keywords.some((kw) => kw.keyword === keyword)) {
      return NextResponse.json({ error: "Keyword not found." }, { status: 400 });
    }
    nextNotes = removeKeywordFromParagraphImageSearch(notes, target, keyword);
    removedCount = 1;
  }

  await db
    .update(schema.projects)
    .set({
      scriptDraftNotes: serializeScriptDraftNotes(nextNotes),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  const paragraphImages = paragraphImageSearchForTarget(nextNotes, target);

  return NextResponse.json({
    ok: true,
    removedCount,
    paragraphImages: paragraphImages ?? null,
    notes: nextNotes,
  });
}
