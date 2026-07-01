import type { Avatar, Project } from "./db/schema";
import { normalizeProjectIdentity } from "./project-identity";
import { ENGLISH_VISUAL_PROMPT_LINE } from "./generation-language";
import {
  normalizeProjectScriptLanguage,
  scriptLanguageGenerationLine,
  scriptLanguageNarrationOnlyLine,
  type ProjectScriptLanguage,
} from "./project-language";
import { getGenreStoryHint } from "./story-prompts";
import {
  type OutlineOptions,
  outlineBeatMaxWords,
  outlineOptionsPromptLines,
} from "./script-outline-options";
import {
  researchContextForPrompt,
  type ScriptResearchAnalysis,
} from "./script-studio";

function scriptLang(project?: { scriptLanguage?: string | null }): ProjectScriptLanguage {
  return normalizeProjectScriptLanguage(project?.scriptLanguage);
}

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

export function buildScriptGenerationSystemPrompt(
  language: ProjectScriptLanguage = "en",
): string {
  return [
    "You are a senior copywriter and voice-over scriptwriter for short-form video narration.",
    scriptLanguageGenerationLine(language),
    "Your job: turn a project brief into ONE continuous narration script that a single narrator will read aloud over a video.",
    "Output STRICT JSON: { title: string, script: string, narrator: { voiceTone: string, ttsModel: string, ttsVoice: string, rationale: string, deliveryNotes: string } }.",
    "Script rules:",
    "- Plain prose. Paragraphs separated by ONE blank line. NO headings, NO scene labels, NO timestamps, NO speaker tags.",
    "- Optional breath / visual holds: a line with only [pause], [pause 3s], or --- between paragraphs (default ~2s). Narration stops; music and visuals continue.",
    "- Designed for ONE narrator reading continuously top to bottom.",
    "- MUST stay within target_word_budget words (hard cap ±10%). Short beats beat long prose.",
    "- Hook in the first 1-2 sentences. Clear arc (open, develop, climax, resolve).",
    "- Sentences short to mid-length; speakable; avoid quotes, bullet points and markdown.",
    "- When primary_character is provided, write in that character's emotional world (third person unless the brief implies first person).",
    "- When project_identity is provided, stay strictly on-brand with that series/brand DNA.",
    "- When verified_web_research is provided: enrich with real facts and curiosities; do not invent statistics or superlatives.",
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
  language: ProjectScriptLanguage = "en",
): string {
  const max = outlineBeatMaxWords(options);
  const optionLines = outlineOptionsPromptLines(options);
  return [
    "You are a senior YouTube/documentary script planner.",
    scriptLanguageGenerationLine(language),
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

export function buildScriptSkeletonFromScriptSystemPrompt(
  options: OutlineOptions,
  language: ProjectScriptLanguage = "en",
): string {
  const max = outlineBeatMaxWords(options);
  const optionLines = outlineOptionsPromptLines(options);
  return [
    "You compress an EXISTING narration script into a beat outline for editing — NOT a new story from the brief.",
    scriptLanguageGenerationLine(language),
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
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptExpandSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a senior voice-over scriptwriter expanding an APPROVED outline into speakable narration.",
    scriptLanguageGenerationLine(language),
    "Output STRICT JSON: { title?: string, script: string, narrator?: { voiceTone, ttsModel, ttsVoice, rationale, deliveryNotes } }.",
    "Rules:",
    "- Expand each outline beat into ONE short paragraph (1–3 sentences).",
    "- Keep the same beat order. Do NOT add new story beats.",
    "- MUST stay within target_word_budget words (±10%).",
    "- Plain prose, blank lines between paragraphs, optional [pause] lines preserved.",
    "- Speakable lines sized for a real narrator: one breath unit per paragraph (often 1–2 short sentences, ~8–22 words).",
    "- Do NOT chop every sentence into its own line — group natural beats; split long passages only where the narrator would breathe.",
    "- When verified_web_research is provided: weave 2–6 facts/curiosities naturally; never invent stats; fix wrong claims flagged in fact_checks.",
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
  research?: ScriptResearchAnalysis;
}): string {
  const {
    project,
    primaryAvatar,
    cast,
    resolvedIdentity,
    ttsModelOptions,
    targetWordBudget,
    outlineOptions,
    research,
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
      ...(researchContextForPrompt(research)
        ? { verified_web_research: researchContextForPrompt(research) }
        : {}),
      video_format: project.videoFormat ?? "horizontal",
      output_language: scriptLang(input.project),
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
  research?: ScriptResearchAnalysis;
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
      ...(researchContextForPrompt(input.research)
        ? { verified_web_research: researchContextForPrompt(input.research) }
        : {}),
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptReviewSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a senior script editor reviewing an EXISTING voice-over narration draft.",
    scriptLanguageGenerationLine(language),
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
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptDeliverySystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a senior voice-over director marking DELIVERY emphasis on an EXISTING narration script.",
    scriptLanguageGenerationLine(language),
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
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptPronunciationSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  const narrationLang =
    language === "pt" ? "Portuguese" : language === "es" ? "Spanish" : "English";
  return [
    `You are a voice-over coach fixing MISPRONUNCIATION of foreign words in a ${narrationLang} narration script.`,
    scriptLanguageGenerationLine(language),
    "Input is JSON: { current_script, project_context }.",
    `The narrator reads in ${narrationLang.toUpperCase()} but the script may contain proper nouns, place names, and loanwords from other languages.`,
    "The TTS engine is ElevenLabs Multilingual — it reads plain text aloud, NOT phonetic notation.",
    "Your job: find words likely mispronounced and give a plain-text SPOKEN alias the engine can read naturally.",
    "Output STRICT JSON:",
    "{ summary: string, hints: Array<{ id, written, spoken, lang?, note? }> }.",
    "Hint rules:",
    "- hints: 6–30 items for a full travel/documentary script; 2–6 for a short draft.",
    "- written MUST be copied VERBATIM from current_script (exact spelling, accents preserved).",
    "- spoken: ONE smooth word or phrase in LATIN LETTERS — how the TTS should read it aloud.",
    "  CRITICAL: NO hyphens, NO syllable breaks, NO IPA, NO stress CAPS, NO respelling like 'Kah-pee-TOH'.",
    "  Prefer accent-stripped native spelling the model can pronounce:",
    "  Example: written 'Capitólio' → spoken 'Capitolio'",
    "  Example: written 'Minas Gerais' → spoken 'Minas Gerais' (unchanged if already readable)",
    "  Example: written 'São Paulo' → spoken 'Sao Paulo'",
    "  Only if native spelling fails: one continuous English-style word (e.g. 'copitoleeo').",
    `- Focus on: place names, people, brands, and words from languages other than ${narrationLang}.`,
    "- Skip common English words and widely known names (Paris, Brazil as country name in English context).",
    "- lang: optional BCP-47 hint (e.g. pt-BR, es, fr).",
    "- note: optional 5–12 word note for the director (not read aloud).",
    "- summary: 1 sentence on pronunciation strategy for this script.",
    "- Do NOT rewrite the script — only provide the hints list.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptPronunciationUserPrompt(input: {
  currentScript: string;
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptMusicPausesSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a documentary film editor placing MUSIC SWELL moments in a voice-over script.",
    scriptLanguageGenerationLine(language),
    "Input is JSON: { current_script, speech_paragraph_count, target_pause_range, allowed_seconds, project_context }.",
    "Music moments are silent beats: narration stops, visuals continue, background music swells.",
    "They appear in the script as standalone lines like [pause 3s] between paragraphs.",
    "Your job: choose WHERE to insert pauses for dynamic pacing — do NOT rewrite narration text.",
    "Output STRICT JSON:",
    "{ overall_strategy: string, insertions: Array<{ id, after_speech_index, seconds, reason }> }.",
    "Insertion rules:",
    "- after_speech_index: 0-based index of a SPEECH paragraph (text blocks only — ignore sections and existing pauses).",
    "  Insert the pause AFTER that paragraph, before the next speech beat.",
    "- Use ONLY indices from 0 through speech_paragraph_count - 2 (never after the final paragraph).",
    "- Target count is target_pause_range.min through target_pause_range.max — prefer the middle of that range.",
    "- Space pauses at least 2 speech paragraphs apart (never back-to-back).",
    "- seconds MUST be one of allowed_seconds (typically 2, 3, 5, or 8).",
    "  - 2s: quick breath between related beats",
    "  - 3s: standard visual hold after a strong line",
    "  - 5s: emotional reveal, scale, or awe moment",
    "  - 8s: rare — major climax or breathtaking visual (max 1–2 per script)",
    "Best placement (prioritize):",
    "- After a hook or opening curiosity line (index 0 only if the next beat is a new scene)",
    "- After stats, scale, or surprising facts",
    "- After emotional peaks (wonder, tension, beauty)",
    "- Before a major pivot, contrast, or new chapter energy",
    "- After a punch line — let the image breathe before the next idea",
    "Avoid:",
    "- First paragraph if it flows directly into the second (unless a clear scene break)",
    "- Mid-thought or mid-argument paragraphs",
    "- Sponsor/CTA paragraphs unless transitioning out of them",
    "- More than one pause within 2 speech paragraphs",
    "- id: short unique label (p1, p2…). reason: max 12 words explaining the editorial choice.",
    "- overall_strategy: 1–2 sentences on pacing rhythm for this draft.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptMusicPausesUserPrompt(input: {
  currentScript: string;
  speechParagraphCount: number;
  targetPauseRange: { min: number; max: number };
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
}): string {
  return JSON.stringify(
    {
      current_script: input.currentScript,
      speech_paragraph_count: input.speechParagraphCount,
      target_pause_range: input.targetPauseRange,
      allowed_seconds: [2, 3, 5, 8],
      project_context: {
        story_description: input.project.storyDescription,
        genre: input.project.genre,
        voice_tone_hint: input.project.voiceTone,
        target_total_duration_seconds: input.project.targetDurationSeconds,
      },
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptApplyFixesSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You surgically edit an EXISTING voice-over narration script.",
    scriptLanguageGenerationLine(language),
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
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

/** @deprecated use buildScriptApplyFixesSystemPrompt */
export function buildScriptRefineSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return buildScriptApplyFixesSystemPrompt(language);
}

/** @deprecated use buildScriptApplyFixesUserPrompt */
export function buildScriptRefineUserPrompt(input: {
  currentScript: string;
  instruction: string;
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
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

export function buildScriptApplySystemPrompt(
  primaryCharacterName?: string | null,
  language: ProjectScriptLanguage = "en",
): string {
  const lines = [
    "You are a video storyboard editor. You receive an APPROVED voice-over script (paragraphs) and turn it into a continuous-narration storyboard for a video editor.",
    scriptLanguageNarrationOnlyLine(language),
    "Output STRICT JSON: { blocks: Array<{ segmentType, narrativeText, visualPrompt, durationSeconds, narrationGroupId, locationTag, characterName }> }.",
    "Rules:",
    "- DO NOT rewrite the script. The first (lead) block of each narration group MUST contain the exact paragraph text verbatim (you may only normalize whitespace).",
    "- For each paragraph in the input, create one narration group with id 'n1','n2','n3'…. The lead block carries narrativeText (the paragraph). Following blocks in the SAME group have narrativeText: '' (visual cuts only).",
    "- Lines with only [pause], [pause Ns], or --- in approved_script become silent visual-hold blocks (narrationGroupId 'pause1','pause2'…, empty narrativeText, cinematic visualPrompt, durationSeconds = pause length, default 2s). Music and picture continue; no narration.",
    "- Each narration group should have 2–5 visual cuts depending on paragraph length (~one cut per 4–8 seconds of speech).",
    "- When reference_images_by_paragraph is provided, create EXACTLY imageCount visual blocks in that narration group (first block = lead with narrativeText, rest = empty narrativeText). One imported photo maps to one visual cut.",
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
    "storyDescription" | "genre" | "visualStyle" | "voiceTone" | "videoFormat" | "cutPace" | "targetDurationSeconds" | "projectIdentity" | "scriptLanguage"
  >;
  approvedScript: string;
  resolvedIdentity?: string;
  primaryCharacter?: { name: string; description?: string | null } | null;
  referenceImagesByParagraph?: Array<{
    narrationGroupId: string;
    keywords: string[];
    imageCount: number;
  }>;
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
      ...(input.referenceImagesByParagraph?.length
        ? { reference_images_by_paragraph: input.referenceImagesByParagraph }
        : {}),
      ...(input.primaryCharacter
        ? {
            primary_character: {
              name: input.primaryCharacter.name,
              description: input.primaryCharacter.description ?? undefined,
            },
          }
        : {}),
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}

export function buildScriptResearchQuerySystemPrompt(): string {
  return [
    "You plan web searches to enrich a documentary/travel voice-over script.",
    "Input is JSON: { story_description, genre, current_script? }.",
    "Output STRICT JSON: { queries: string[] }.",
    "Rules:",
    "- queries: 3–5 specific English search queries (places, geology, history, culture, stats).",
    "- Include proper nouns from the brief/script (cities, landmarks, people).",
    "- Mix fact-check queries (dates, sizes, claims) with curiosity queries.",
    "- No generic queries like 'travel tips' — be specific to THIS story.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptResearchQueryUserPrompt(input: {
  storyDescription: string;
  genre: string;
  currentScript?: string;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription,
      genre: input.genre,
      ...(input.currentScript?.trim() ? { current_script: input.currentScript.trim() } : {}),
    },
    null,
    2,
  );
}

export function buildScriptResearchSynthesisSystemPrompt(
  language: ProjectScriptLanguage = "en",
): string {
  return [
    "You synthesize web search results into verified facts for a narration scriptwriter.",
    scriptLanguageGenerationLine(language),
    "Input is JSON: { story_description, current_script?, search_results }.",
    "Output STRICT JSON:",
    "{ summary, facts, curiosities, fact_checks? }.",
    "Item shapes:",
    "- facts/curiosities: Array<{ id, text, source_title?, source_url? }>",
    "- fact_checks (only if current_script provided): Array<{ id, quote, status, note, source_url? }>",
    "Rules:",
    "- facts: 4–12 speakable, verifiable statements grounded in search_results (not invented).",
    "- curiosities: 2–6 surprising but true details a narrator could mention.",
    "- Each item MUST cite a source from search_results when possible.",
    "- fact_checks: pick 2–8 claims from current_script; status = correct | wrong | unverified.",
    `- text fields: short (max 2 sentences), narration-ready ${language === "pt" ? "Brazilian Portuguese" : language === "es" ? "Spanish" : "English"}.`,
    "- summary: 1–2 sentences on what was found.",
    "- Do NOT include facts not supported by search_results.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptResearchSynthesisUserPrompt(input: {
  storyDescription: string;
  genre: string;
  currentScript?: string;
  searchResults: Array<{
    query: string;
    snippets: Array<{ title: string; url: string; content: string }>;
  }>;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription,
      genre: input.genre,
      ...(input.currentScript?.trim() ? { current_script: input.currentScript.trim() } : {}),
      search_results: input.searchResults,
    },
    null,
    2,
  );
}

export function buildScriptManifestSystemPrompt(): string {
  return [
    "You are a documentary editor planning B-roll for Adobe Premiere.",
    "Given narration segments with measured durations, suggest concrete visual coverage per paragraph.",
    "Output JSON only: { segments: [{ id, visual_intent, keywords, shots? }] }.",
    "visual_intent: one sentence — what the viewer should see (location, subject, mood, camera feel).",
    "keywords: 3–6 search terms for local footage folders (places, objects, actions).",
    "shots (optional): split a long paragraph into 2–4 sub-shots when durationSec > 8.",
    "Each shot: { durationSec, visual_intent, keywords? } — shot durations should sum to roughly the paragraph duration.",
    "Be specific to the story (real places, documentary tone). No stock clichés unless the script asks for them.",
    "Do not invent facts. Match the narration tone.",
  ].join(" ");
}

export function buildScriptManifestUserPrompt(input: {
  storyDescription: string;
  genre: string | null;
  visualStyle: string | null;
  segments: Array<{ id: string; text: string; durationSec: number }>;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription,
      genre: input.genre ?? undefined,
      visual_style: input.visualStyle ?? undefined,
      segments: input.segments,
    },
    null,
    2,
  );
}

export function buildScriptImageKeywordsSystemPrompt(targetCount?: number): string {
  const countLine =
    targetCount != null && targetCount > 0
      ? `Return exactly ${targetCount} keywords (or fewer only if the paragraph has fewer distinct visual subjects).`
      : "Return 3–5 short keywords";
  return [
    "You extract visual search keywords for documentary reference photos.",
    "Given a narration paragraph, output JSON: { keywords: string[] }.",
    `${countLine} Each keyword is 1–4 words: specific places, landmarks, subjects, actions.`,
    "Spread keywords across the paragraph beat — opening, detail, context — not synonyms of the same shot.",
    "Prefer searchable terms (e.g. 'Capitólio canyon Brazil', 'Furnas reservoir', 'waterfall Minas Gerais').",
    "Skip abstract concepts, emotions, and words already obvious from generic stock.",
    "Match the paragraph language when it helps (Portuguese place names are fine).",
  ].join(" ");
}

export function buildScriptImageKeywordsUserPrompt(input: {
  storyDescription: string | null;
  genre: string | null;
  paragraphText: string;
  targetCount?: number;
  visualStyle?: string | null;
  cutPace?: string | null;
  durationSeconds?: number;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription ?? undefined,
      genre: input.genre ?? undefined,
      visual_style: input.visualStyle ?? undefined,
      cut_pace: input.cutPace ?? undefined,
      paragraph_duration_seconds: input.durationSeconds ?? undefined,
      target_keyword_count: input.targetCount ?? undefined,
      paragraph: input.paragraphText,
    },
    null,
    2,
  );
}

export function buildScriptImageRankSystemPrompt(): string {
  return [
    "You are a documentary photo editor picking reference stills for one narration paragraph in a short video.",
    "Input is JSON with project context, paragraph text, and candidate photos grouped by keyword slot.",
    "Output STRICT JSON: { selections: [{ keyword: string, imageId: string }] }.",
    "Rules:",
    "- Each imageId MUST come from that keyword slot's candidates list.",
    "- Pick the photo that best matches the paragraph moment AND the video's genre, style, and format.",
    "- Ensure visual variety across slots — avoid near-duplicate subjects, angles, or compositions.",
    "- Prefer specific, well-described subjects over vague or generic titles.",
    "- For vertical video, prefer portrait or square compositions when dimensions are listed.",
    "- For horizontal video, prefer landscape compositions when dimensions are listed.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptImageRankUserPrompt(input: {
  storyDescription: string | null;
  genre: string | null;
  visualStyle: string | null;
  videoFormat: string | null;
  cutPace: string | null;
  paragraphText: string;
  durationSeconds: number;
  targetCount: number;
  slots: Array<{
    keyword: string;
    candidates: Array<{
      id: string;
      title: string;
      provider: string;
      width?: number;
      height?: number;
    }>;
  }>;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription ?? undefined,
      genre: input.genre ?? undefined,
      visual_style: input.visualStyle ?? undefined,
      video_format: input.videoFormat ?? "horizontal",
      cut_pace: input.cutPace ?? "balanced",
      paragraph: input.paragraphText,
      paragraph_duration_seconds: input.durationSeconds,
      target_image_count: input.targetCount,
      slots: input.slots,
    },
    null,
    2,
  );
}

export function buildScriptVideoSearchSystemPrompt(): string {
  return [
    "You suggest stock B-roll video search queries for a documentary narration paragraph.",
    "Input is JSON with project context and the paragraph text being narrated.",
    "Output STRICT JSON: { query: string, keywords: string[] }.",
    "Rules:",
    "- query: ONE best Pexels stock-video search phrase (4–10 words, concrete subjects/actions/places).",
    "- keywords: 2–4 alternate shorter phrases if the main query returns nothing.",
    "- Match THIS paragraph moment — what the viewer should see while this text is read.",
    "- Use story_description and genre for tone; paragraph for specific subjects.",
    "- Prefer documentary B-roll: nature, places, people in action, objects — not abstract mood words.",
    "- NEVER use meta phrases like 'cinematic', 'documentary style', 'B-roll montage'.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptVideoSearchUserPrompt(input: {
  storyDescription?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  videoFormat?: string | null;
  cutPace?: string | null;
  paragraphText: string;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription ?? undefined,
      genre: input.genre ?? undefined,
      visual_style: input.visualStyle ?? undefined,
      video_format: input.videoFormat ?? "horizontal",
      cut_pace: input.cutPace ?? undefined,
      paragraph: input.paragraphText,
    },
    null,
    2,
  );
}

export function buildScriptVideoRankSystemPrompt(): string {
  return [
    "You pick the best stock video clip for ONE narration paragraph in a documentary.",
    "Input is JSON with project context, paragraph text, and Pexels video candidates.",
    "Output STRICT JSON: { imageId: string }.",
    "Rules:",
    "- imageId MUST be one of the candidate ids.",
    "- Pick the clip that best matches what should be seen during THIS paragraph.",
    "- Prefer clips whose title/description matches concrete subjects in the paragraph.",
    "- Prefer landscape for horizontal video, portrait for vertical when dimensions are listed.",
    "- Avoid generic city skylines unless the paragraph is about cities.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptVideoRankUserPrompt(input: {
  storyDescription?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  videoFormat?: string | null;
  paragraphText: string;
  searchQuery: string;
  candidates: Array<{
    id: string;
    title: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
  }>;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription ?? undefined,
      genre: input.genre ?? undefined,
      visual_style: input.visualStyle ?? undefined,
      video_format: input.videoFormat ?? "horizontal",
      paragraph: input.paragraphText,
      search_query: input.searchQuery,
      candidates: input.candidates,
    },
    null,
    2,
  );
}

export function buildBlockKeyframeSearchSystemPrompt(): string {
  return [
    "You suggest stock-photo search queries for a documentary video keyframe.",
    "Input is JSON with project context and THIS scene's details.",
    "Output STRICT JSON: { query: string, keywords: string[] }.",
    "Rules:",
    "- query: ONE best Pexels/Wikimedia search phrase (4–10 words, concrete nouns/places/subjects).",
    "- keywords: 3–5 alternate short phrases (each 2–6 words) if the main query returns nothing.",
    "- Prefer specific places, landmarks, people, objects, weather, architecture — not mood words.",
    "- NEVER use meta phrases like 'visual hold', 'music swells', 'slow motion', 'cinematic', 'atmospheric'.",
    "- Use story_description and location for project identity; narration and visual_prompt for THIS scene.",
    "- If the scene is a pause/music moment, infer a still that fits the surrounding story beat.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildBlockKeyframeSearchUserPrompt(input: {
  storyDescription?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  editorialLine?: string | null;
  location?: string | null;
  segmentType?: string | null;
  narrativeText?: string | null;
  visualPrompt?: string | null;
  neighborHint?: string | null;
  isPauseBlock?: boolean;
}): string {
  return JSON.stringify(
    {
      story_description: input.storyDescription?.trim() || undefined,
      genre: input.genre?.trim() || undefined,
      visual_style: input.visualStyle?.trim() || undefined,
      editorial_line: input.editorialLine?.trim() || undefined,
      scene: {
        location: input.location?.trim() || undefined,
        segment_type: input.segmentType?.trim() || undefined,
        narration: input.narrativeText?.trim() || undefined,
        visual_prompt: input.visualPrompt?.trim() || undefined,
        is_pause_moment: input.isPauseBlock || undefined,
        neighbor_context: input.neighborHint?.trim() || undefined,
      },
    },
    null,
    2,
  );
}

export function buildScriptSplitLinesSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a senior documentary voice-over director preparing a script for RECORDING.",
    scriptLanguageGenerationLine(language),
    "Input is JSON with the current narration script and narrator context.",
    "Output STRICT JSON: { script: string }.",
    "Your job: split the script into locution paragraphs (blank line between each) so a narrator can record one comfortable take per paragraph.",
    "Hard rules:",
    "- Preserve EVERY spoken word in the original order — no shortening, paraphrasing, or dropping.",
    "- Preserve [pause], [pause Ns], --- and chapter/section markers exactly (same positions).",
    "- NOT one sentence per line by default — group short related sentences into one breath unit (~8–22 words).",
    "- Split long sentences only at natural narrator pauses (comma, em dash, semicolon, clause boundary).",
    "- Hooks, stats, and punch lines may stand alone when they need emphasis.",
    "- CTAs and questions often deserve their own paragraph.",
    "- Match voice_tone and delivery_notes when choosing breath boundaries.",
    "- Plain text only; blank lines between speech paragraphs.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildScriptSplitLinesUserPrompt(input: {
  sourceScript: string;
  project: Pick<
    Project,
    "storyDescription" | "genre" | "voiceTone" | "targetDurationSeconds" | "scriptLanguage"
  >;
  narrator?: NarratorSuggestion | null;
}): string {
  return JSON.stringify(
    {
      task: "split_for_narrator_locution",
      source_script: input.sourceScript,
      voice_tone: input.narrator?.voiceTone ?? input.project.voiceTone,
      delivery_notes: input.narrator?.deliveryNotes ?? undefined,
      narrator_rationale: input.narrator?.rationale ?? undefined,
      project_context: {
        story_description: input.project.storyDescription,
        genre: input.project.genre,
        target_total_duration_seconds: input.project.targetDurationSeconds,
      },
      output_language: scriptLang(input.project),
    },
    null,
    2,
  );
}
