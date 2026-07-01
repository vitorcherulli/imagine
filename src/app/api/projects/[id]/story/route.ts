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
import { assignBlockAvatarFromStory } from "@/lib/avatar-block";
import { resolveProjectCast } from "@/lib/project-avatars";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import {
  generateAndSaveStyleBible,
  normalizeLocationTag,
} from "@/lib/style-bible-server";
import {
  clampContinuousCutDuration,
  clampVisualDuration,
  isVisualCutOnly,
} from "@/lib/cut-pace";
import { storyBlocksToScriptDraft } from "@/lib/story-to-script";
import { saveScriptDraft } from "@/lib/script-versions-server";

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
    const cast = resolveProjectCast(project, userAvatars);
    const projectAvatar =
      cast.length === 1
        ? cast[0]
        : cast.length > 1
          ? cast.find((a) => a.id === project.avatarId) ?? cast[0] ?? null
          : null;
    const hasCharacters = cast.length > 0;
    const resolvedIdentity = await resolveProjectIdentityForProject(project);
    const raw = await chatCompletion({
      messages: [
        {
          role: "system",
          content: buildStorySystemPrompt(
            project,
            hasCharacters,
            cast.length <= 1 ? projectAvatar?.name ?? null : null,
          ),
        },
        {
          role: "user",
          content: buildStoryUserPrompt(
            project,
            cast.map((c) => ({ name: c.name, description: c.description })),
            cast.length <= 1 ? projectAvatar : null,
            resolvedIdentity || undefined,
          ),
        },
      ],
      model: models.llmModel,
      temperature: 0.85,
      response_format: { type: "json_object" },
    });
    const json = extractJson<{ blocks: BlockDraft[] }>(raw);
    const blocks = (json.blocks ?? []).slice(0, 45);
    if (blocks.length === 0) {
      return NextResponse.json({ error: "LLM returned no blocks" }, { status: 502 });
    }


    await db.delete(schema.storyBlocks).where(eq(schema.storyBlocks.projectId, project.id));

    const now = new Date();
    const rows = blocks.map((b, i) => {
      const draft: BlockDraft = {
        ...b,
        narrationGroupId: b.narrationGroupId?.trim() || null,
        narrativeText: b.narrativeText ?? "",
      };
      const visualOnly = isVisualCutOnly({
        narrationGroupId: draft.narrationGroupId ?? null,
        narrativeText: draft.narrativeText,
      });
      const durationSeconds = visualOnly
        ? clampContinuousCutDuration(b.durationSeconds ?? 4, project.cutPace)
        : clampVisualDuration(b.durationSeconds ?? 8, project.cutPace);
      const { avatarId, characterName } = assignBlockAvatarFromStory(
        b.characterName,
        projectAvatar,
        cast,
      );
      return {
        id: createId(),
        projectId: project.id,
        position: i,
        segmentType: ["intro", "development", "climax", "resolution"].includes(b.segmentType)
          ? b.segmentType
          : "development",
        narrativeText: draft.narrativeText,
        visualPrompt: b.visualPrompt ?? "",
        locationTag: normalizeLocationTag(b.locationTag),
        durationSeconds,
        narrationGroupId: draft.narrationGroupId,
        avatarId,
        characterName,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
    });
    await db.insert(schema.storyBlocks).values(rows);

    const scriptDraftText = storyBlocksToScriptDraft(
      rows.map(({ narrativeText, narrationGroupId, position }) => ({
        narrativeText,
        narrationGroupId: narrationGroupId ?? null,
        position,
      })),
    );
    let scriptDraftResult: Awaited<ReturnType<typeof saveScriptDraft>> | null = null;
    if (scriptDraftText) {
      scriptDraftResult = await saveScriptDraft(project, {
        script: scriptDraftText,
        status: "draft",
        versionSource: "ai_generate",
        versionSummary: "Storyboard story",
      });
    }

    await db
      .update(schema.projects)
      .set({ status: "story_ready", updatedAt: now })
      .where(eq(schema.projects.id, project.id));

    // Best-effort: editorial line text (per-block images are generated in Style dialog).
    let styleBible: Awaited<ReturnType<typeof generateAndSaveStyleBible>> | null = null;
    let styleBibleError: string | null = null;
    try {
      const fresh = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id))
        .limit(1);
      if (fresh[0]) {
        styleBible = await generateAndSaveStyleBible(fresh[0]);
      }
    } catch (e) {
      styleBibleError = e instanceof Error ? e.message : String(e);
      console.error("[story] style bible generation failed:", styleBibleError);
    }

    return NextResponse.json({
      blocks: rows,
      scriptDraft: scriptDraftResult?.script ?? scriptDraftText,
      scriptDraftStatus: scriptDraftResult?.status ?? (scriptDraftText ? "draft" : "none"),
      scriptDraftVersion: scriptDraftResult?.currentVersion ?? null,
      styleBible,
      styleBibleError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Story generation failed" },
      { status: 500 },
    );
  }
}
