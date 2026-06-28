import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptExpandSystemPrompt,
  buildScriptExpandUserPrompt,
  buildScriptGenerationSystemPrompt,
  buildScriptGenerationUserPrompt,
  buildScriptSkeletonFromBriefSystemPrompt,
  buildScriptSkeletonFromScriptSystemPrompt,
  buildScriptSkeletonFromScriptUserPrompt,
  type GeneratedScript,
} from "@/lib/script-prompts";
import {
  TTS_MODEL_OPTIONS,
  resolveProjectApiModels,
  voiceOptionsForTtsModel,
} from "@/lib/project-api-models";
import { resolveProjectCast } from "@/lib/project-avatars";
import { resolveProjectAvatar } from "@/lib/avatar-block";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { targetWordBudget, targetOutlineBeatRange } from "@/lib/script-budget";
import { normalizeOutlineOptions } from "@/lib/script-outline-options";
import {
  computeScriptStats,
  compressScriptToOutlineBeats,
  countScriptStructure,
  normalizeScriptText,
  type ScriptDraftNotes,
} from "@/lib/script-studio";
import {
  listScriptVersionMeta,
  saveScriptDraft,
} from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  /** skeleton = beat outline; expand = outline → full script; full = one-shot generation */
  phase: z.enum(["skeleton", "expand", "full"]).optional().default("full"),
  /** Current draft — for expand (outline text) or skeleton (extract beats from full script). */
  script: z.string().max(32_000).optional(),
  /** @deprecated Use script */
  outline: z.string().max(8000).optional(),
  outlineOptions: z
    .object({
      beatLength: z.enum(["short", "balanced"]).optional(),
      preserveVoice: z.boolean().optional(),
      protectCta: z.boolean().optional(),
    })
    .optional(),
});

function ttsModelOptionsForPrompt() {
  return TTS_MODEL_OPTIONS.map((m) => ({
    value: m.value,
    label: m.label,
    voices: voiceOptionsForTtsModel(m.value).map((v) => ({
      value: v.value,
      label: v.label,
    })),
  }));
}

function clampNarratorToValidModel(
  narrator: GeneratedScript["narrator"],
): GeneratedScript["narrator"] {
  const validModels = new Set(TTS_MODEL_OPTIONS.map((m) => m.value));
  let { ttsModel, ttsVoice } = narrator;
  if (!validModels.has(ttsModel)) {
    ttsModel = TTS_MODEL_OPTIONS[0]?.value ?? "hexgrad/kokoro-82m";
  }
  const voiceList = voiceOptionsForTtsModel(ttsModel);
  if (!voiceList.some((v) => v.value === ttsVoice)) {
    ttsVoice = voiceList[0]?.value ?? "auto";
  }
  return { ...narrator, ttsModel, ttsVoice };
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

  const phase = parsed.data.phase;
  const outlineOptions = normalizeOutlineOptions(parsed.data.outlineOptions);

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
          ? cast.find((a) => a.id === project.avatarId) ?? null
          : resolveProjectAvatar(project, userAvatars);

    const resolvedIdentity = await resolveProjectIdentityForProject(project);
    const wordBudget = targetWordBudget(project.targetDurationSeconds ?? 30);
    const promptBase = {
      project,
      primaryAvatar,
      cast,
      resolvedIdentity: resolvedIdentity || undefined,
      ttsModelOptions: ttsModelOptionsForPrompt(),
      targetWordBudget: wordBudget,
    };

    let systemPrompt: string;
    let userContent: string;
    let temperature = 0.85;

    if (phase === "skeleton") {
      const sourceScript = normalizeScriptText(
        parsed.data.script ?? project.scriptDraft ?? "",
      );
      const sourceStructure = sourceScript ? countScriptStructure(sourceScript) : null;

      if (sourceScript && (sourceStructure?.speech ?? 0) > 0) {
        systemPrompt = buildScriptSkeletonFromScriptSystemPrompt(outlineOptions);
        userContent = buildScriptSkeletonFromScriptUserPrompt({
          sourceScript,
          project,
          resolvedIdentity: resolvedIdentity || undefined,
          speechParagraphCount: sourceStructure!.speech,
          pauseCount: sourceStructure!.pauses,
          outlineOptions,
        });
        temperature = 0.35;
      } else {
        const beatRange = targetOutlineBeatRange(project.targetDurationSeconds ?? 30);
        systemPrompt = buildScriptSkeletonFromBriefSystemPrompt(beatRange, outlineOptions);
        userContent = buildScriptGenerationUserPrompt({
          ...promptBase,
          outlineOptions,
        });
        temperature = 0.7;
      }
    } else if (phase === "expand") {
      const outline = normalizeScriptText(
        parsed.data.script ?? parsed.data.outline ?? project.scriptDraft ?? "",
      );
      if (!outline) {
        return NextResponse.json(
          { error: "Generate or paste an outline first, then expand." },
          { status: 400 },
        );
      }
      systemPrompt = buildScriptExpandSystemPrompt();
      userContent = buildScriptExpandUserPrompt({
        project,
        outline,
        resolvedIdentity: resolvedIdentity || undefined,
        targetWordBudget: wordBudget,
      });
      temperature = 0.65;
    } else {
      systemPrompt = buildScriptGenerationSystemPrompt();
      userContent = buildScriptGenerationUserPrompt(promptBase);
    }

    const raw = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      model: models.llmModel,
      temperature,
      response_format: { type: "json_object" },
    });

    const llmJson = extractJson<Partial<GeneratedScript>>(raw);
    let script = normalizeScriptText(llmJson.script ?? "");
    if (!script) {
      return NextResponse.json(
        { error: "LLM returned an empty script. Try again." },
        { status: 502 },
      );
    }

    if (phase === "skeleton") {
      const sourceScript = normalizeScriptText(
        parsed.data.script ?? project.scriptDraft ?? "",
      );
      if (sourceScript) {
        const sourceStructure = countScriptStructure(sourceScript);
        const outputStructure = countScriptStructure(script);
        const lostTooManyBeats =
          sourceStructure.speech > 0 &&
          outputStructure.speech < Math.ceil(sourceStructure.speech * 0.85);
        if (lostTooManyBeats) {
          script = compressScriptToOutlineBeats(sourceScript, outlineOptions);
        }
      }
    }

    const narrator = clampNarratorToValidModel({
      voiceTone: llmJson.narrator?.voiceTone || project.voiceTone || "Warm",
      ttsModel: llmJson.narrator?.ttsModel || models.ttsModel,
      ttsVoice: llmJson.narrator?.ttsVoice || models.ttsVoice,
      rationale: llmJson.narrator?.rationale || "",
      deliveryNotes: llmJson.narrator?.deliveryNotes || "",
    });

    const nowIso = new Date().toISOString();
    const notes: ScriptDraftNotes = {
      narrator,
      sourceMode: "ai",
      generatedAt: nowIso,
      updatedAt: nowIso,
    };

    const summary =
      phase === "skeleton"
        ? normalizeScriptText(parsed.data.script ?? project.scriptDraft ?? "")
          ? "Outline extracted from script"
          : "AI outline (beats)"
        : phase === "expand"
          ? "Expanded from outline"
          : llmJson.title?.trim() || "AI generated from brief";

    const saved = await saveScriptDraft(project, {
      script,
      notes,
      status: "draft",
      versionSource: "ai_generate",
      versionSummary: summary,
    });

    const versions = await listScriptVersionMeta(project.id, saved.currentVersion);

    return NextResponse.json({
      ok: true,
      phase,
      script: saved.script,
      notes: saved.notes,
      status: saved.status,
      currentVersion: saved.currentVersion,
      versionCreated: saved.versionCreated,
      versions,
      stats: computeScriptStats(saved.script),
      title: llmJson.title || undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Script generation failed" },
      { status: 500 },
    );
  }
}
