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
import { assignBlockAvatarFromStory, resolveProjectAvatar } from "@/lib/avatar-block";
import { resolveProjectCast } from "@/lib/project-avatars";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import {
  generateAndSaveAnchor,
  generateAndSaveStyleBible,
  normalizeLocationTag,
} from "@/lib/style-bible-server";
import {
  clampContinuousCutDuration,
  clampVisualDuration,
  isVisualCutOnly,
  normalizeNarrationMode,
} from "@/lib/cut-pace";

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
    const storyCharacters = cast.length > 0 ? cast : userAvatars;
    const projectAvatar =
      cast.length === 1
        ? cast[0]
        : cast.length > 1
          ? cast.find((a) => a.id === project.avatarId) ?? null
          : resolveProjectAvatar(project, userAvatars);
    const hasCharacters = storyCharacters.length > 0;
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
            storyCharacters.map((c) => ({ name: c.name, description: c.description })),
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

    const continuous = normalizeNarrationMode(project.narrationMode) === "continuous";

    await db.delete(schema.storyBlocks).where(eq(schema.storyBlocks.projectId, project.id));

    const now = new Date();
    const rows = blocks.map((b, i) => {
      const draft: BlockDraft = {
        ...b,
        narrationGroupId: b.narrationGroupId?.trim() || null,
        narrativeText: b.narrativeText ?? "",
      };
      const visualOnly =
        continuous &&
        isVisualCutOnly({
          narrationGroupId: draft.narrationGroupId ?? null,
          narrativeText: draft.narrativeText,
        });
      const durationSeconds = visualOnly
        ? clampContinuousCutDuration(b.durationSeconds ?? 4, project.cutPace)
        : clampVisualDuration(b.durationSeconds ?? 8, project.cutPace);
      const { avatarId, characterName } = assignBlockAvatarFromStory(
        b.characterName,
        projectAvatar,
        cast.length > 0 ? cast : userAvatars,
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
