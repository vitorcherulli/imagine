import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { resolveProjectAvatar } from "@/lib/avatar-block";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveProjectCast } from "@/lib/project-avatars";
import { runScriptParagraphImageGenerate } from "@/lib/script-image-generate-server";
import { listScriptSpeechParagraphs } from "@/lib/script-narration-utils";
import {
  normalizeScriptText,
  paragraphImageSearchForSpeech,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  upsertParagraphImageSearch,
} from "@/lib/script-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const speechIndex =
    typeof json.speechIndex === "number" && Number.isInteger(json.speechIndex)
      ? json.speechIndex
      : null;
  const prompt =
    typeof json.prompt === "string" && json.prompt.trim() ? json.prompt.trim().slice(0, 500) : undefined;
  const script = normalizeScriptText(
    typeof json.script === "string" ? json.script : project.scriptDraft ?? "",
  );

  if (speechIndex === null || speechIndex < 0 || speechIndex > 200) {
    return NextResponse.json({ error: "Invalid speechIndex" }, { status: 400 });
  }

  const paragraph = listScriptSpeechParagraphs(script).find((p) => p.speechIndex === speechIndex);
  if (!paragraph) {
    return NextResponse.json({ error: "Paragraph not found in script." }, { status: 400 });
  }

  try {
    const models = resolveProjectApiModels(project);
    const userAvatars = await db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId));
    const cast = resolveProjectCast(project, userAvatars);
    const primaryAvatar =
      cast.length === 1
        ? cast[0]
        : cast.length > 1
          ? cast.find((a) => a.id === project.avatarId) ?? cast[0] ?? null
          : resolveProjectAvatar(project, userAvatars);

    const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
    const existingEntry = paragraphImageSearchForSpeech(
      existingNotes,
      paragraph.speechIndex,
      paragraph.textKey,
    );

    const match = await runScriptParagraphImageGenerate({
      project,
      projectId: project.id,
      speechIndex: paragraph.speechIndex,
      paragraphText: paragraph.text,
      imageModel: models.imageModel,
      primaryAvatar,
      userPrompt: prompt,
      existingKeywords: existingEntry?.keywords,
    });

    const baseEntry = existingEntry ?? {
      speechIndex: paragraph.speechIndex,
      textKey: paragraph.textKey,
      searchedAt: new Date().toISOString(),
      provider: "ai",
      keywords: [],
    };

    const result = {
      ...baseEntry,
      searchedAt: new Date().toISOString(),
      provider: existingEntry?.provider === "pexels" || existingEntry?.provider === "wikimedia"
        ? existingEntry.provider
        : "ai",
      keywords: [...baseEntry.keywords, match],
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
      match,
      paragraphImages: result,
      notes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI image generation failed" },
      { status: 500 },
    );
  }
}
