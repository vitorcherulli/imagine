import type { Avatar, Project } from "./db/schema";
import { normalizeProjectIdentity } from "./project-identity";
import {
  ENGLISH_ONLY_GENERATION_LINE,
} from "./generation-language";
import { getGenreStoryHint } from "./story-prompts";
import {
  type OutlineOptions,
  outlineBeatMaxWords,
  outlineOptionsPromptLines,
} from "./script-outline-options";

/**
 * Script Studio prompts — produces a plain-text narration draft (no visual
 * prompts, no per-block JSON). The user reviews this script in a document
 * view, optionally refines it, and only then promotes it to story blocks.
 */

export interface NarratorSuggestion {
  voiceTone: string;
  ttsModel: string;
  ttsVoice: string;
  rationale: string;
  deliveryNotes?: string;
}

export interface GeneratedScript {
  /** Full narration text, paragraphs separated by blank lines. */
  script: string;
  /** Short title for the script (~40 chars). */
  title?: string;
  narrator: NarratorSuggestion;
}

export function buildScriptGenerationSystemPrompt(): string {
  return [
    "You are a senior copywriter and voice-over scriptwriter for short-form video narration.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Your job: turn a project brief into ONE continuous narration script that a single narrator will read aloud over a video.",
    "Output STRICT JSON: { title: string, script: string, narrator: { voiceTone: string, ttsModel: string, ttsVoice: string, rationale: string, deliveryNotes: string } }.",
    "Script rules:",
    "- Plain prose. Paragraphs separated by ONE blank line. NO headings, NO scene labels, NO timestamps, NO speaker tags.",
    "- Optional breath / visual holds: a line with only [pause], [pause 1s], or --- between paragraphs (default ~0.6s).",
    "- Designed for ONE narrator reading continuously top to bottom.",
    "- MUST stay within target_word_budget words (hard cap ±10%). Short beats beat long prose.",
    "- Hook in the first 1-2 sentences. Clear arc (open, develop, climax, resolve).",
    "- Sentences short to mid-length; speakable; avoid quotes, bullet points and markdown.",
    "- When primary_character is provided, write in that character's emotional world (third person unless the brief implies first person).",
    "- When project_identity is provided, stay strictly on-brand with that series/brand DNA.",
    "Narrator suggestion rules:",
    "- ttsModel MUST be one of the provided tts_model_options values.",
    "- ttsVoice MUST be from the matching voice list provided for that model.",
    "- voiceTone is a short adjective ('Warm', 'Dramatic', 'Documentary', 'Energetic', etc).",
    "- rationale: 1 sentence explaining the pairing.",
    "- deliveryNotes: 1 sentence on pace/emphasis for the human director.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptSkeletonFromBriefSystemPrompt(
  beatRange: { min: number; max: number },
  options: OutlineOptions,
): string {
  const max = outlineBeatMaxWords(options);
  const optionLines = outlineOptionsPromptLines(options);
  return [
    "You are a senior YouTube/documentary script planner.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Output STRICT JSON: { title: string, script: string, narrator: { voiceTone, ttsModel, ttsVoice, rationale, deliveryNotes } }.",
    "The script field is an OUTLINE only — NOT full narration yet.",
    "Outline rules:",
    `- Produce ${beatRange.min}–${beatRange.max} speech beats separated by ONE blank line (scale to target_total_duration_seconds).`,
    `- Each speech beat: max ~${max} words.`,
    "- Optional standalone line: [pause], [pause 1s], or --- for a visual beat (keep between speech beats).",
    "- Telegraphic but specific: names, places and facts from the brief — not generic filler.",
    "- Total outline word count should be roughly 15–25% of target_word_budget (outline is short, not the final script).",
    "- NO full speakable paragraphs yet. Each beat is a planning line the writer will expand later.",
    ...optionLines,
    "Narrator rules: same as full script generation (valid ttsModel + ttsVoice from options).",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

/** @deprecated Use buildScriptSkeletonFromBriefSystemPrompt */
export function buildScriptSkeletonSystemPrompt(): string {
  return buildScriptSkeletonFromBriefSystemPrompt(
    { min: 4, max: 6 },
    { beatLength: "balanced", preserveVoice: true, protectCta: true },
  );
}

export function buildScriptSkeletonFromScriptSystemPrompt(options: OutlineOptions): string {
  const max = outlineBeatMaxWords(options);
  const optionLines = outlineOptionsPromptLines(options);
  return [
    "You compress an EXISTING narration script into a beat outline for editing — NOT a new story from the brief.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Output STRICT JSON: { title?: string, script: string, narrator?: { voiceTone, ttsModel, ttsVoice, rationale, deliveryNotes } }.",
    "Hard rules:",
    "- source_script is the ONLY story source. Do NOT rewrite from project brief or invent beats.",
    "- ONE outline line per speech paragraph in source_script — same count, same order.",
    "- Preserve every [pause], [pause Ns], or --- line exactly as its own block (same positions).",
    `- Each speech beat: compress to max ~${max} words keeping names, places, facts and emotional turn.`,
    "- Do NOT merge paragraphs. Do NOT drop paragraphs. Do NOT add paragraphs.",
    `- If a paragraph is already short (under ~${max} words), keep it almost verbatim.`,
    "- Outline lines are planning beats, slightly telegraphic, but must map 1:1 to the source.",
    ...optionLines,
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptSkeletonFromScriptUserPrompt(input: {
  sourceScript: string;
  project: Pick<Project, "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds">;
  resolvedIdentity?: string;
  speechParagraphCount: number;
  pauseCount: number;
  outlineOptions: OutlineOptions;
}): string {
  return JSON.stringify(
    {
      task: "extract_outline_from_existing_script",
      source_script: input.sourceScript,
      required_speech_beats: input.speechParagraphCount,
      required_pause_lines: input.pauseCount,
      outline_options: input.outlineOptions,
      ...(input.resolvedIdentity ? { project_identity: input.resolvedIdentity } : {}),
      story_description: input.project.storyDescription,
      genre: input.project.genre,
      voice_tone_hint: input.project.voiceTone,
      target_total_duration_seconds: input.project.targetDurationSeconds,
      output_language: "en",
    },
    null,
    2,
  );
}

export function buildScriptExpandSystemPrompt(): string {
  return [
    "You are a senior voice-over scriptwriter expanding an APPROVED outline into speakable narration.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Output STRICT JSON: { title?: string, script: string, narrator?: { voiceTone, ttsModel, ttsVoice, rationale, deliveryNotes } }.",
    "Rules:",
    "- Expand each outline beat into ONE short paragraph (1–3 sentences).",
    "- Keep the same beat order. Do NOT add new story beats.",
    "- MUST stay within target_word_budget words (±10%).",
    "- Plain prose, blank lines between paragraphs, optional [pause] lines preserved.",
    "- Speakable, short sentences, documentary/YouTube pacing.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptGenerationUserPrompt(input: {
  project: Project;
  primaryAvatar?: Pick<Avatar, "name" | "description"> | null;
  cast: Array<Pick<Avatar, "name" | "description">>;
  resolvedIdentity?: string;
  ttsModelOptions: Array<{ value: string; label: string; voices: Array<{ value: string; label: string }> }>;
  targetWordBudget?: number;
  outlineOptions?: OutlineOptions;
}): string {
  const {
    project,
    primaryAvatar,
    cast,
    resolvedIdentity,
    ttsModelOptions,
    targetWordBudget,
    outlineOptions,
  } = input;
  const identity = resolvedIdentity ?? normalizeProjectIdentity(project.projectIdentity);
  const genreHint = getGenreStoryHint(project.genre);
  const wordBudget =
    targetWordBudget ??
    Math.round((project.targetDurationSeconds ?? 30) * 2.5);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      story_description: project.storyDescription,
      genre: project.genre,
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      visual_style: project.visualStyle,
      voice_tone_hint: project.voiceTone,
      target_total_duration_seconds: project.targetDurationSeconds,
      target_word_budget: wordBudget,
      ...(outlineOptions ? { outline_options: outlineOptions } : {}),
      video_format: project.videoFormat ?? "horizontal",
      output_language: "en",
      ...(primaryAvatar
        ? {
            primary_character: {
              name: primaryAvatar.name,
              description: primaryAvatar.description ?? undefined,
            },
          }
        : cast.length > 0
          ? {
              characters: cast.map((c) => ({
                name: c.name,
                description: c.description ?? undefined,
              })),
            }
          : {}),
      tts_model_options: ttsModelOptions,
    },
    null,
    2,
  );
}

export function buildScriptExpandUserPrompt(input: {
  project: Project;
  outline: string;
  resolvedIdentity?: string;
  targetWordBudget?: number;
}): string {
  const wordBudget =
    input.targetWordBudget ??
    Math.round((input.project.targetDurationSeconds ?? 30) * 2.5);
  const identity =
    input.resolvedIdentity ?? normalizeProjectIdentity(input.project.projectIdentity);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      approved_outline: input.outline,
      story_description: input.project.storyDescription,
      genre: input.project.genre,
      voice_tone_hint: input.project.voiceTone,
      target_total_duration_seconds: input.project.targetDurationSeconds,
      target_word_budget: wordBudget,
      output_language: "en",
    },
    null,
    2,
  );
}

export function buildScriptReviewSystemPrompt(): string {
  return [
    "You are a senior script editor reviewing an EXISTING voice-over narration draft.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Input is JSON: { current_script, instruction, project_context }.",
    "Your job is editorial REVIEW — NOT rewriting the script.",
    "Output STRICT JSON:",
    "{ overall_summary: string, strengths: string[], suggestions: Array<{ id, quote, issue, recommendation, severity, category }> }.",
    "Rules:",
    "- Do NOT output a rewritten script. Only analysis and pinpointed notes.",
    "- suggestions: 3–10 items. Each quote MUST be copied VERBATIM from current_script (15–200 characters).",
    "- quote must appear exactly once or be a unique substring — pick the most relevant span.",
    "- issue: what is weak or could be better (1 sentence).",
    "- recommendation: concrete direction to fix it WITHOUT writing the replacement line (1 sentence).",
    "- severity: high (hook/clarity/story-breaking), medium (flow/tone), low (polish).",
    "- category: hook | pacing | tone | clarity | wording | structure | emotion | length.",
    "- overall_summary: 2–3 sentences on the draft as a whole.",
    "- strengths: 1–3 things that already work.",
    "- Respect the user's instruction as the review lens when provided.",
    "- If the user pasted their own text, treat it as the draft to improve — do not suggest replacing the whole piece.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptReviewUserPrompt(input: {
  currentScript: string;
  instruction?: string;
  project: Pick<Project, "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds">;
}): string {
  return JSON.stringify(
    {
      current_script: input.currentScript,
      instruction: input.instruction?.trim() || "Review this draft and mark what should be improved.",
      project_context: {
        story_description: input.project.storyDescription,
        genre: input.project.genre,
        voice_tone_hint: input.project.voiceTone,
        target_total_duration_seconds: input.project.targetDurationSeconds,
      },
      output_language: "en",
    },
    null,
    2,
  );
}

export function buildScriptDeliverySystemPrompt(): string {
  return [
    "You are a senior voice-over director marking DELIVERY emphasis on an EXISTING narration script.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Input is JSON: { current_script, project_context }.",
    "Your job is to mark SHORT phrases where the narrator should add intonation, emotion, pause, or weight — NOT to rewrite the script.",
    "Output STRICT JSON:",
    "{ overall_pace: string, spans: Array<{ id, quote, kind, hint }> }.",
    "Span rules:",
    "- spans: 8–24 items for a full script; 2–4 for a short draft.",
    "- quote MUST be copied VERBATIM from current_script — a SHORT phrase (3–14 words), never a full paragraph.",
    "- Mark the exact words to stress, not the whole sentence unless the sentence is under 12 words.",
    "- Max ~3 spans per paragraph (text between blank lines).",
    "- kind: hook | question | stat | contrast | emotion | punch | cta",
    "  - hook: opening curiosity (first paragraph only, 1 span max)",
    "  - question: rising intonation on a question",
    "  - stat: numbers, scale, dates — clear grounded delivery",
    "  - contrast: pivot words (not/never/but) or reframe moments",
    "  - emotion: wonder, warmth, awe, quiet power",
    "  - punch: landing lines, memorable closings within a paragraph",
    "  - cta: sponsor, link, call-to-action — friendly and direct",
    "- hint: one short direction for the narrator (max 12 words), e.g. 'Slow down; let the number land'.",
    "- overall_pace: 1–2 sentences on documentary pacing for this draft.",
    "- Prioritize iconic lines, hooks, stats, emotional turns, and CTA — skip filler connective tissue.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptDeliveryUserPrompt(input: {
  currentScript: string;
  project: Pick<Project, "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds">;
}): string {
  return JSON.stringify(
    {
      current_script: input.currentScript,
      project_context: {
        story_description: input.project.storyDescription,
        genre: input.project.genre,
        voice_tone_hint: input.project.voiceTone,
        target_total_duration_seconds: input.project.targetDurationSeconds,
      },
      output_language: "en",
    },
    null,
    2,
  );
}

export function buildScriptApplyFixesSystemPrompt(): string {
  return [
    "You surgically edit an EXISTING voice-over narration script.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Input is JSON: { current_script, instruction, focus_quotes?, project_context }.",
    "Apply ONLY the requested improvements to the EXISTING text — this is NOT a rewrite from scratch.",
    "Output STRICT JSON: { script: string, change_summary: string, applied_fixes: string[] }.",
    "Hard rules:",
    "- Keep the same story, facts, names, and paragraph structure unless the instruction explicitly requires restructuring.",
    "- At least ~70% of sentences must remain recognizably the same (same beats, same order).",
    "- Change only passages that the instruction targets; leave strong sections untouched.",
    "- When focus_quotes is provided, prioritize editing those exact spans.",
    "- Plain prose, paragraphs separated by ONE blank line, no headings, no markdown, no review markers.",
    "- change_summary: one sentence listing what you touched.",
    "- applied_fixes: ids or short labels of what you fixed.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptApplyFixesUserPrompt(input: {
  currentScript: string;
  instruction: string;
  focusQuotes?: string[];
  project: Pick<Project, "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds">;
}): string {
  return JSON.stringify(
    {
      current_script: input.currentScript,
      instruction: input.instruction,
      ...(input.focusQuotes?.length ? { focus_quotes: input.focusQuotes } : {}),
      project_context: {
        story_description: input.project.storyDescription,
        genre: input.project.genre,
        voice_tone_hint: input.project.voiceTone,
        target_total_duration_seconds: input.project.targetDurationSeconds,
      },
      output_language: "en",
    },
    null,
    2,
  );
}

/** @deprecated use buildScriptApplyFixesSystemPrompt */
export function buildScriptRefineSystemPrompt(): string {
  return buildScriptApplyFixesSystemPrompt();
}

/** @deprecated use buildScriptApplyFixesUserPrompt */
export function buildScriptRefineUserPrompt(input: {
  currentScript: string;
  instruction: string;
  project: Pick<Project, "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds">;
}): string {
  return buildScriptApplyFixesUserPrompt(input);
}

/**
 * Second pass: takes an APPROVED script and produces story blocks in
 * CONTINUOUS narration mode (one narration group per paragraph, with N
 * silent visual cuts under each).
 */

export interface ScriptApplyBlock {
  /** Non-empty only for the lead block of a narration group. */
  narrativeText: string;
  visualPrompt: string;
  durationSeconds: number;
  segmentType: "intro" | "development" | "climax" | "resolution";
  /** Shared across cuts of the same paragraph. */
  narrationGroupId: string;
  locationTag?: string | null;
  characterName?: string | null;
}

export function buildScriptApplySystemPrompt(primaryCharacterName?: string | null): string {
  const lines = [
    "You are a video storyboard editor. You receive an APPROVED voice-over script (paragraphs) and turn it into a continuous-narration storyboard for a video editor.",
    ENGLISH_ONLY_GENERATION_LINE,
    "Output STRICT JSON: { blocks: Array<{ segmentType, narrativeText, visualPrompt, durationSeconds, narrationGroupId, locationTag, characterName }> }.",
    "Rules:",
    "- DO NOT rewrite the script. The first (lead) block of each narration group MUST contain the exact paragraph text verbatim (you may only normalize whitespace).",
    "- For each paragraph in the input, create one narration group with id 'n1','n2','n3'…. The lead block carries narrativeText (the paragraph). Following blocks in the SAME group have narrativeText: '' (visual cuts only).",
    "- Lines with only [pause], [pause Ns], or --- in approved_script become silent visual-hold blocks (narrationGroupId 'pause1','pause2'…, empty narrativeText, cinematic visualPrompt, durationSeconds = pause length, default 0.6s).",
    "- Each narration group should have 2–5 visual cuts depending on paragraph length (~one cut per 4–8 seconds of speech).",
    "- durationSeconds: lead block = its share of the paragraph reading time (~150 wpm). Visual cuts: 3–8 seconds each. Sum across the group ≈ paragraph reading time.",
    "- visualPrompt: ONE concise cinematographic line describing lighting, camera, subject and action. Start with a short palette/light phrase (e.g. 'Warm amber rim light, deep teal shadows. ...') and keep it CONSISTENT across all blocks so the film feels coherent. No quotation marks, no new lines.",
    "- locationTag: short snake_case tag for THIS scene's setting (reuse same tag for consecutive cuts in the same place).",
    "- segmentType across the whole film: exactly one 'intro' (first paragraph lead), one 'climax', one 'resolution' (last). Others are 'development'. Assign to narration leads.",
  ];
  if (primaryCharacterName) {
    lines.push(
      `- characterName: when the character "${primaryCharacterName}" appears on screen, use exactly that name; otherwise null.`,
      `- visualPrompt must describe "${primaryCharacterName}" consistently when they appear.`,
    );
  } else {
    lines.push("- characterName: null (no named characters in this project).");
  }
  lines.push("Respond ONLY with the JSON object.");
  return lines.join("\n");
}

export function buildScriptApplyUserPrompt(input: {
  project: Pick<
    Project,
    "storyDescription" | "genre" | "visualStyle" | "voiceTone" | "videoFormat" | "cutPace" | "targetDurationSeconds" | "projectIdentity"
  >;
  approvedScript: string;
  resolvedIdentity?: string;
  primaryCharacter?: { name: string; description?: string | null } | null;
}): string {
  const identity = input.resolvedIdentity ?? normalizeProjectIdentity(input.project.projectIdentity);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      approved_script: input.approvedScript,
      genre: input.project.genre,
      visual_style: input.project.visualStyle,
      voice_tone: input.project.voiceTone,
      video_format: input.project.videoFormat ?? "horizontal",
      cut_pace: input.project.cutPace ?? "balanced",
      target_total_duration_seconds: input.project.targetDurationSeconds,
      ...(input.primaryCharacter
        ? {
            primary_character: {
              name: input.primaryCharacter.name,
              description: input.primaryCharacter.description ?? undefined,
            },
          }
        : {}),
      output_language: "en",
    },
    null,
    2,
  );
}
