import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  generateScriptParagraphSpeech,
} from "@/lib/script-narration-server";
import {
  listScriptSpeechParagraphs,
  mergeParagraphNarrationClip,
  narrationClipForSpeechIndex,
} from "@/lib/script-narration-utils";
import {
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
} from "@/lib/script-studio";
import { saveScriptDraft } from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  script: z.string().max(40_000).optional(),
  speechIndex: z.number().int().min(0).max(200).optional(),
  force: z.boolean().optional(),
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

  let projectRow = project;
  let script = normalizeScriptText(parsed.data.script ?? project.scriptDraft ?? "");
  if (parsed.data.script !== undefined) {
    try {
      const synced = await saveScriptDraft(project, { script: parsed.data.script, status: "draft" });
      projectRow = {
        ...project,
        scriptDraft: synced.script || null,
        scriptDraftNotes: synced.notes
          ? serializeScriptDraftNotes(synced.notes)
          : project.scriptDraftNotes,
      };
      script = synced.script;
    } catch (err) {
      console.error("[script/narration] draft sync failed:", err);
    }
  }

  if (!script) {
    return NextResponse.json({ error: "No script to narrate." }, { status: 400 });
  }

  const paragraphs = listScriptSpeechParagraphs(script);
  if (paragraphs.length === 0) {
    return NextResponse.json({ error: "Script has no speech paragraphs." }, { status: 400 });
  }

  const notes = parseScriptDraftNotes(projectRow.scriptDraftNotes);
  let clips = [...(notes.paragraphNarration ?? [])];
  const force = parsed.data.force ?? false;
  const targetIndex = parsed.data.speechIndex;

  const targets =
    targetIndex !== undefined
      ? paragraphs.filter((p) => p.speechIndex === targetIndex)
      : paragraphs;

  if (targets.length === 0) {
    return NextResponse.json({ error: "Paragraph not found." }, { status: 400 });
  }

  try {
    const generated: number[] = [];
    for (const paragraph of targets) {
      if (
        !force &&
        narrationClipForSpeechIndex(clips, paragraph.speechIndex, paragraph.textKey)
      ) {
        continue;
      }
      const clip = await generateScriptParagraphSpeech({
        project: projectRow,
        notes,
        speechText: paragraph.text,
        speechIndex: paragraph.speechIndex,
      });
      clips = mergeParagraphNarrationClip(clips, clip);
      generated.push(paragraph.speechIndex);
    }

    const nextNotes = {
      ...notes,
      paragraphNarration: clips,
      updatedAt: new Date().toISOString(),
    };

    await db
      .update(schema.projects)
      .set({
        scriptDraftNotes: serializeScriptDraftNotes(nextNotes),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    const readyCount = paragraphs.filter((p) =>
      narrationClipForSpeechIndex(clips, p.speechIndex, p.textKey),
    ).length;

    return NextResponse.json({
      ok: true,
      generated,
      paragraphNarration: clips,
      notes: nextNotes,
      readyCount,
      totalParagraphs: paragraphs.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paragraph narration failed" },
      { status: 500 },
    );
  }
}
