import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptApplySystemPrompt,
  buildScriptApplyUserPrompt,
  type ScriptApplyBlock,
} from "@/lib/script-prompts";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveProjectCast } from "@/lib/project-avatars";
import {
  assignBlockAvatarFromStory,
  resolveProjectAvatar,
} from "@/lib/avatar-block";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import {
  clampContinuousCutDuration,
  clampVisualDuration,
} from "@/lib/cut-pace";
import {
  generateAndSaveAnchor,
  generateAndSaveStyleBible,
  normalizeLocationTag,
} from "@/lib/style-bible-server";
import {
  buildFallbackBlocksFromScript,
  normalizeScriptText,
  parseScriptDraftNotes,
  splitScriptIntoParagraphs,
} from "@/lib/script-studio";
import { createScriptVersion, saveScriptDraft } from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  /** When true, also apply narrator suggestion (voiceTone + ttsVoice) to the project. */
  applyNarrator: z.boolean().optional().default(true),
  /** Client's current draft — used when autosave has not flushed yet. */
  script: z.string().max(40_000).optional(),
});

function validateBlocks(blocks: unknown): ScriptApplyBlock[] {
  if (!Array.isArray(blocks)) return [];
  const result: ScriptApplyBlock[] = [];
  for (const b of blocks) {
    const obj = b as Partial<ScriptApplyBlock>;
    const groupId = (obj.narrationGroupId ?? "").trim();
    const narrativeText = typeof obj.narrativeText === "string" ? obj.narrativeText : "";
    const visualPrompt = typeof obj.visualPrompt === "string" ? obj.visualPrompt : "";
    if (!groupId) continue;
    if (!narrativeText.trim() && !visualPrompt.trim()) continue;
    result.push({
      narrativeText,
      visualPrompt,
      durationSeconds:
        typeof obj.durationSeconds === "number" && obj.durationSeconds > 0
          ? obj.durationSeconds
          : 6,
      segmentType:
        obj.segmentType === "intro" ||
        obj.segmentType === "climax" ||
        obj.segmentType === "resolution"
          ? obj.segmentType
          : "development",
      narrationGroupId: groupId,
      locationTag: typeof obj.locationTag === "string" ? obj.locationTag : null,
      characterName: typeof obj.characterName === "string" ? obj.characterName : null,
    });
  }
  return result;
}

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
  let approvedScript = normalizeScriptText(
    parsed.data.script ?? project.scriptDraft ?? "",
  );
  if (parsed.data.script !== undefined) {
    try {
      const synced = await saveScriptDraft(project, {
        script: parsed.data.script,
        status: "draft",
      });
      projectRow = {
        ...project,
        scriptDraft: synced.script || null,
        scriptDraftNotes: synced.notes
          ? JSON.stringify(synced.notes)
          : project.scriptDraftNotes,
        scriptDraftStatus: synced.status,
        scriptDraftVersion: synced.currentVersion,
      };
      approvedScript = synced.script;
    } catch (err) {
      console.error("[script/apply] draft sync failed:", err);
    }
  }
  if (!approvedScript) {
    return NextResponse.json(
      { error: "No script draft to apply." },
      { status: 400 },
    );
  }
  const paragraphs = splitScriptIntoParagraphs(approvedScript);
  if (paragraphs.length === 0) {
    return NextResponse.json(
      { error: "Script is empty after normalization." },
      { status: 400 },
    );
  }

  try {
    const models = resolveProjectApiModels(projectRow);
    const userAvatars = await db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId));
    const cast = resolveProjectCast(project, userAvatars);
    const projectAvatar =
      cast.length === 1
        ? cast[0]
        : cast.length > 1
          ? cast.find((a) => a.id === project.avatarId) ?? null
          : resolveProjectAvatar(project, userAvatars);

    const resolvedIdentity = await resolveProjectIdentityForProject(project);

    const raw = await chatCompletion({
      messages: [
        {
          role: "system",
          content: buildScriptApplySystemPrompt(projectAvatar?.name ?? null),
        },
        {
          role: "user",
          content: buildScriptApplyUserPrompt({
            project,
            approvedScript,
            resolvedIdentity: resolvedIdentity || undefined,
            primaryCharacter: projectAvatar
              ? { name: projectAvatar.name, description: projectAvatar.description }
              : null,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const llmJson = extractJson<{ blocks?: unknown }>(raw);
    let blocks = validateBlocks(llmJson.blocks);

    // Fallback: if LLM did not return usable blocks, build a minimal continuous
    // storyboard directly from paragraphs (one narration group per paragraph,
    // no extra visual cuts). This guarantees the user can always proceed.
    if (blocks.length === 0) {
      blocks = buildFallbackBlocksFromScript(approvedScript);
    }

    // Wipe existing story blocks, write new continuous ones.
    await db
      .delete(schema.storyBlocks)
      .where(eq(schema.storyBlocks.projectId, project.id));

    const now = new Date();
    const groupOrder = new Map<string, number>();
    for (const b of blocks) {
      if (!groupOrder.has(b.narrationGroupId)) {
        groupOrder.set(b.narrationGroupId, groupOrder.size);
      }
    }
    const groupLeadSeen = new Set<string>();
    const rows = blocks.map((b, i) => {
      const isLead = !groupLeadSeen.has(b.narrationGroupId) && b.narrativeText.trim().length > 0;
      if (isLead) groupLeadSeen.add(b.narrationGroupId);
      const duration = isLead
        ? clampVisualDuration(b.durationSeconds, project.cutPace)
        : clampContinuousCutDuration(b.durationSeconds, project.cutPace);
      const { avatarId, characterName } = assignBlockAvatarFromStory(
        b.characterName,
        projectAvatar,
        cast.length > 0 ? cast : userAvatars,
      );
      return {
        id: createId(),
        projectId: project.id,
        position: i,
        segmentType: b.segmentType,
        narrativeText: isLead ? b.narrativeText : "",
        visualPrompt: b.visualPrompt,
        locationTag: normalizeLocationTag(b.locationTag),
        durationSeconds: duration,
        narrationGroupId: b.narrationGroupId,
        avatarId,
        characterName,
        status: "draft" as const,
        createdAt: now,
        updatedAt: now,
      };
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Failed to build any story blocks from script." },
        { status: 502 },
      );
    }

    await db.insert(schema.storyBlocks).values(rows);

    const notes = parseScriptDraftNotes(projectRow.scriptDraftNotes);
    const appliedVersion = await createScriptVersion(project.id, {
      script: approvedScript,
      notes,
      source: "applied_snapshot",
      summary: "Applied to timeline",
    });

    const projectPatch: Record<string, unknown> = {
      status: "story_ready",
      narrationMode: "continuous",
      scriptDraftStatus: "applied",
      scriptDraftVersion: appliedVersion,
      updatedAt: now,
    };
    if (parsed.data.applyNarrator && notes.narrator) {
      projectPatch.voiceTone = notes.narrator.voiceTone || project.voiceTone;
      projectPatch.ttsModel = notes.narrator.ttsModel;
      projectPatch.ttsVoice = notes.narrator.ttsVoice;
    }
    await db
      .update(schema.projects)
      .set(projectPatch)
      .where(eq(schema.projects.id, project.id));

    // Best-effort: editorial style line + abstract anchor (same as story route).
    let styleBibleError: string | null = null;
    try {
      const fresh = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id))
        .limit(1);
      if (fresh[0]) {
        const bible = await generateAndSaveStyleBible(fresh[0]);
        await generateAndSaveAnchor(
          { ...fresh[0], styleBible: JSON.stringify(bible) },
          bible,
        );
      }
    } catch (e) {
      styleBibleError = e instanceof Error ? e.message : String(e);
      console.error("[script/apply] style bible generation failed:", styleBibleError);
    }

    return NextResponse.json({
      ok: true,
      blocks: rows,
      narrationMode: "continuous",
      styleBibleError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Script apply failed" },
      { status: 500 },
    );
  }
}
