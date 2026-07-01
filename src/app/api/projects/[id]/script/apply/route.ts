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
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import {
  clampContinuousCutDuration,
  clampVisualDuration,
} from "@/lib/cut-pace";
import {
  generateAndSaveStyleBible,
  normalizeLocationTag,
} from "@/lib/style-bible-server";
import { buildDeterministicApplyBlocks, hasImportedReferenceImages } from "@/lib/script-apply-blocks";
import { inheritPauseBlockVisualFields, isStoryBlockPause } from "@/lib/script-pause";
import { promoteScriptReferenceVideoToBlock } from "@/lib/stock-video-import-server";
import {
  buildFallbackBlocksFromScript,
  importedMediaForSpeechIndex,
  importedMediaForPauseIndex,
  normalizeScriptText,
  parseScriptDraftNotes,
  splitScriptIntoParagraphs,
} from "@/lib/script-studio";
import {
  narrationClipForSpeechIndex,
  pauseIndexFromNarrationGroupId,
  scriptParagraphTextKey,
  speechIndexFromNarrationGroupId,
} from "@/lib/script-narration-utils";
import type { StoryBlock } from "@/lib/db/schema";
import { withCacheBuster } from "@/lib/storage";
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

    const narrationNotes = parseScriptDraftNotes(projectRow.scriptDraftNotes);
    const referenceImagesByParagraph = (narrationNotes.paragraphImages ?? [])
      .map((entry) => {
        if (entry.pauseIndex !== undefined || entry.speechIndex === undefined) return null;
        const imported = entry.keywords.filter((kw) => Boolean(kw.importedUrl?.trim()));
        if (imported.length === 0) return null;
        return {
          narrationGroupId: `n${entry.speechIndex + 1}`,
          keywords: imported.map((kw) => kw.keyword),
          imageCount: imported.length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const paragraphClips = narrationNotes.paragraphNarration ?? [];
    const useImportedImages = hasImportedReferenceImages(narrationNotes);

    let blocks: ScriptApplyBlock[];
    if (useImportedImages) {
      // Deterministic: one narration group per script paragraph, N visual cuts per imported photo.
      blocks = buildDeterministicApplyBlocks(
        approvedScript,
        narrationNotes,
        project.cutPace,
        paragraphClips,
      );
    } else {
      const raw = await chatCompletion({
        messages: [
          {
            role: "system",
            content: buildScriptApplySystemPrompt(
              projectAvatar?.name ?? null,
              normalizeProjectScriptLanguage(project.scriptLanguage),
            ),
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
              referenceImagesByParagraph:
                referenceImagesByParagraph.length > 0 ? referenceImagesByParagraph : undefined,
            }),
          },
        ],
        model: models.llmModel,
        temperature: 0.6,
        response_format: { type: "json_object" },
      });

      const llmJson = extractJson<{ blocks?: unknown }>(raw);
      blocks = validateBlocks(llmJson.blocks);

      if (blocks.length === 0) {
        blocks = buildFallbackBlocksFromScript(approvedScript);
      }
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

    const blocksPerGroup = new Map<string, number>();
    for (const b of blocks) {
      blocksPerGroup.set(b.narrationGroupId, (blocksPerGroup.get(b.narrationGroupId) ?? 0) + 1);
    }

    const groupLeadSeen = new Set<string>();
    const groupVisualIndex = new Map<string, number>();
    let lastVisualSource: Parameters<typeof inheritPauseBlockVisualFields>[0] = null;
    const rows: Array<typeof schema.storyBlocks.$inferInsert> = [];

    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i]!;
      const isLead = !groupLeadSeen.has(b.narrationGroupId) && b.narrativeText.trim().length > 0;
      if (isLead) groupLeadSeen.add(b.narrationGroupId);

      let duration = isLead
        ? clampVisualDuration(b.durationSeconds, project.cutPace)
        : clampContinuousCutDuration(b.durationSeconds, project.cutPace);

      let audioUrl: string | null = null;
      let keyframeUrl: string | null = null;
      let blockStatus: StoryBlock["status"] = "draft";
      let pendingVideoSource: string | null = null;

      if (isLead && b.narrativeText.trim()) {
        const speechIdx = speechIndexFromNarrationGroupId(b.narrationGroupId);
        if (speechIdx !== null) {
          const clip = narrationClipForSpeechIndex(
            paragraphClips,
            speechIdx,
            scriptParagraphTextKey(b.narrativeText),
          );
          if (clip) {
            audioUrl = withCacheBuster(clip.audioUrl);
            const groupSize = blocksPerGroup.get(b.narrationGroupId) ?? 1;
            if (groupSize <= 1) {
              duration = clampVisualDuration(
                Math.max(duration, Math.ceil(clip.durationSeconds)),
                project.cutPace,
              );
            }
            blockStatus = "audio_ready";
          }
        }
      }

      const speechIdx = speechIndexFromNarrationGroupId(b.narrationGroupId);
      if (speechIdx !== null) {
        const mediaItems = importedMediaForSpeechIndex(narrationNotes, speechIdx);
        if (mediaItems.length > 0) {
          const visualIdx = groupVisualIndex.get(b.narrationGroupId) ?? 0;
          groupVisualIndex.set(b.narrationGroupId, visualIdx + 1);
          if (visualIdx < mediaItems.length) {
            const item = mediaItems[visualIdx]!;
            if (item.mediaKind === "video") {
              pendingVideoSource = item.url;
            } else {
              keyframeUrl = withCacheBuster(item.url);
              blockStatus = blockStatus === "audio_ready" ? blockStatus : "image_ready";
            }
          }
        }
      }

      const pauseIdx = pauseIndexFromNarrationGroupId(b.narrationGroupId);
      if (pauseIdx !== null) {
        const pauseMedia = importedMediaForPauseIndex(narrationNotes, pauseIdx);
        if (pauseMedia.length > 0) {
          const item = pauseMedia[0]!;
          if (item.mediaKind === "video") {
            pendingVideoSource = item.url;
            keyframeUrl = null;
          } else {
            keyframeUrl = withCacheBuster(item.url);
            pendingVideoSource = null;
            blockStatus = "image_ready";
          }
        }
      }

      const { avatarId, characterName } = assignBlockAvatarFromStory(
        b.characterName,
        projectAvatar,
        cast,
      );

      let finalKeyframeUrl = keyframeUrl;
      let finalVideoUrl: string | null = null;
      let finalSceneAudioUrl: string | null = null;
      let finalLocationTag = normalizeLocationTag(b.locationTag);
      let finalStatus: StoryBlock["status"] = blockStatus;

      const blockId = createId();

      if (pendingVideoSource) {
        try {
          const promoted = await promoteScriptReferenceVideoToBlock({
            projectId: project.id,
            blockId,
            sourceVideoUrl: pendingVideoSource,
            durationSeconds: duration,
            previewMode: project.previewMode,
            userId,
          });
          finalVideoUrl = promoted.videoUrl;
          finalSceneAudioUrl = promoted.sceneAudioUrl;
          finalStatus = audioUrl ? "ready" : "video_ready";
        } catch (err) {
          return NextResponse.json(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Could not prepare imported stock video for timeline.",
            },
            { status: 500 },
          );
        }
      }

      if (isStoryBlockPause({ narrationGroupId: b.narrationGroupId, narrativeText: b.narrativeText })) {
        if (!keyframeUrl && !pendingVideoSource) {
          const inherited = inheritPauseBlockVisualFields(lastVisualSource);
          finalKeyframeUrl = inherited.keyframeUrl;
          finalVideoUrl = inherited.videoUrl;
          finalLocationTag = inherited.locationTag ?? finalLocationTag;
          finalStatus = inherited.status ?? finalStatus;
        }
      }

      const row = {
        id: blockId,
        projectId: project.id,
        position: i,
        segmentType: b.segmentType,
        narrativeText: isLead ? b.narrativeText : "",
        visualPrompt: b.visualPrompt,
        locationTag: finalLocationTag,
        durationSeconds: duration,
        narrationGroupId: b.narrationGroupId,
        audioUrl,
        keyframeUrl: finalKeyframeUrl,
        videoUrl: finalVideoUrl,
        sceneAudioUrl: finalSceneAudioUrl,
        avatarId,
        characterName,
        status: finalStatus,
        createdAt: now,
        updatedAt: now,
      };

      if (finalKeyframeUrl || finalVideoUrl) {
        lastVisualSource = {
          id: row.id,
          keyframeUrl: finalKeyframeUrl,
          videoUrl: finalVideoUrl,
          videoJobId: null,
          videoPollingUrl: null,
          locationTag: finalLocationTag,
          status: finalStatus,
        };
      }

      rows.push(row);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Failed to build any story blocks from script." },
        { status: 502 },
      );
    }

    await db.insert(schema.storyBlocks).values(rows);

    const narrationClipsAttached = rows.filter(
      (r) => r.audioUrl && r.narrativeText.trim().length > 0,
    ).length;

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

    // Best-effort: editorial line text only (block images in Style dialog).
    let styleBibleError: string | null = null;
    try {
      const fresh = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id))
        .limit(1);
      if (fresh[0]) {
        await generateAndSaveStyleBible(fresh[0]);
      }
    } catch (e) {
      styleBibleError = e instanceof Error ? e.message : String(e);
      console.error("[script/apply] style bible generation failed:", styleBibleError);
    }

    return NextResponse.json({
      ok: true,
      blocks: rows,
      narrationMode: "continuous",
      narrationClipsAttached,
      styleBibleError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Script apply failed" },
      { status: 500 },
    );
  }
}
