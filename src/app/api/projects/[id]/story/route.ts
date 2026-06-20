import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildStorySystemPrompt,
  buildStoryUserPrompt,
  type BlockDraft,
} from "@/lib/story-prompts";
import { matchAvatarByName } from "@/lib/avatar-block";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  generateAndSaveAnchor,
  generateAndSaveStyleBible,
  normalizeLocationTag,
} from "@/lib/style-bible-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const models = resolveProjectApiModels(project);
    const userAvatars = await db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId));
    const hasCharacters = userAvatars.length > 0;
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildStorySystemPrompt(hasCharacters) },
        { role: "user", content: buildStoryUserPrompt(project, userAvatars) },
      ],
      model: models.llmModel,
      temperature: 0.85,
      response_format: { type: "json_object" },
    });
    const json = extractJson<{ blocks: BlockDraft[] }>(raw);
    const blocks = (json.blocks ?? []).slice(0, 30);
    if (blocks.length === 0) {
      return NextResponse.json({ error: "LLM returned no blocks" }, { status: 502 });
    }

    await db.delete(schema.storyBlocks).where(eq(schema.storyBlocks.projectId, project.id));

    const now = new Date();
    const rows = blocks.map((b, i) => {
      const characterName = b.characterName?.trim() || null;
      const matched = matchAvatarByName(characterName, userAvatars);
      let avatarId: string | null = null;
      if (characterName && matched) {
        avatarId = matched.id;
      } else if (!characterName && userAvatars.length === 1) {
        avatarId = userAvatars[0].id;
      }
      return {
        id: createId(),
        projectId: project.id,
        position: i,
        segmentType: ["intro", "development", "climax", "resolution"].includes(b.segmentType)
          ? b.segmentType
          : "development",
        narrativeText: b.narrativeText ?? "",
        visualPrompt: b.visualPrompt ?? "",
        locationTag: normalizeLocationTag(b.locationTag),
        durationSeconds: Math.min(12, Math.max(4, Math.round(b.durationSeconds ?? 8))),
        avatarId,
        characterName,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
    });
    await db.insert(schema.storyBlocks).values(rows);

    await db
      .update(schema.projects)
      .set({ status: "story_ready", updatedAt: now })
      .where(eq(schema.projects.id, project.id));

    // Best-effort: editorial line (text bible + abstract reference image).
    let styleBible: Awaited<ReturnType<typeof generateAndSaveStyleBible>> | null = null;
    let anchorImageUrl: string | null = null;
    let styleBibleError: string | null = null;
    try {
      const fresh = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id))
        .limit(1);
      if (fresh[0]) {
        styleBible = await generateAndSaveStyleBible(fresh[0]);
        const withBible = { ...fresh[0], styleBible: JSON.stringify(styleBible) };
        const anchor = await generateAndSaveAnchor(withBible, styleBible);
        anchorImageUrl = anchor.anchorImageUrl;
      }
    } catch (e) {
      styleBibleError = e instanceof Error ? e.message : String(e);
      console.error("[story] style bible / anchor generation failed:", styleBibleError);
    }

    return NextResponse.json({
      blocks: rows,
      styleBible,
      anchorImageUrl,
      styleBibleError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Story generation failed" },
      { status: 500 },
    );
  }
}
