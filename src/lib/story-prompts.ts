import type { Avatar, Project } from "./db/schema";
import { buildCutPacePromptLines } from "./cut-pace";
import { normalizeProjectIdentity } from "./project-identity";
import {
  normalizeProjectScriptLanguage,
  scriptLanguageGenerationLine,
  scriptLanguageNarrationOnlyLine,
  scriptLanguageOutputCode,
  type ProjectScriptLanguage,
} from "./project-language";
import { getVisualFramingHint, getVideoFormatSpec } from "./video-format";

/** Extra guidance when genre needs platform-safe provocative framing. */
export function getGenreStoryHint(genre: string): string | null {
  if (genre === "OF / Sexy") {
    return [
      "Genre is suggestive social-media content (OnlyFans-style marketing, Reels, TikTok):",
      "teasing, confident, glamorous, fashion/beauty/lifestyle energy.",
      "Provocative and attention-grabbing but platform-safe — no explicit nudity, no sexual acts, no pornographic detail.",
      "Strong hooks, slow reveals, confident poses, luxury settings, cinematic lighting.",
    ].join(" ");
  }
  return null;
}

export interface BlockDraft {
  segmentType: "intro" | "development" | "climax" | "resolution";
  narrativeText: string;
  visualPrompt: string;
  durationSeconds: number;
  characterName?: string | null;
  locationTag?: string | null;
  narrationGroupId?: string | null;
}

export function buildStorySystemPrompt(
  project: Pick<
    Project,
    "cutPace" | "narrationMode" | "targetDurationSeconds" | "scriptLanguage"
  >,
  hasCharacters: boolean,
  primaryCharacterName?: string | null,
) {
  const language = normalizeProjectScriptLanguage(project.scriptLanguage);
  const base = [
    "You are an expert screenwriter and video story-board author for short-form online videos.",
    "Given a project brief, output a JSON object with a 'blocks' array of narrative blocks.",
    "Each block has: segmentType ('intro' | 'development' | 'climax' | 'resolution'), narrativeText (the voice-over script, complete sentences — or empty string for visual-only cuts), visualPrompt (concise cinematographic description of the visual to generate), durationSeconds (integer), locationTag (short snake_case identifier for THIS scene's unique setting, e.g. garden_gate, purple_tunnel, sunlit_meadow).",
    "Each block may also have narrationGroupId (string): blocks sharing the same id form one narration unit with multiple visual cuts.",
  ];
  if (primaryCharacterName) {
    base.push(
      `Each block also has characterName (string or null). This project has ONE designated main character: "${primaryCharacterName}".`,
      `When that character is visible on screen, characterName MUST be exactly "${primaryCharacterName}" — never any other name.`,
      "Use null for characterName only on wide shots, scenery, objects, or scenes with no person on screen.",
      `visualPrompt must describe "${primaryCharacterName}" consistently when they appear.`,
    );
  } else if (hasCharacters) {
    base.push(
      "Each block also has characterName (string or null): the name of the main character visible in this shot, chosen EXACTLY from the provided characters list. Use null for wide shots, scenery, objects, or scenes with no named character on screen.",
      "Distribute characters across the story — different blocks may feature different characters when the story has multiple personas.",
    );
  }
  base.push(
    "Constraints:",
    scriptLanguageNarrationOnlyLine(language),
    ...buildCutPacePromptLines(project),
    "- visualPrompt must NOT contain quotation marks or new lines; it should describe lighting, camera, subjects, action, mood for THIS specific scene.",
    "- Framing: follow the project's video_format in the brief (horizontal 16:9 widescreen vs vertical 9:16 mobile portrait). Compose every shot for that aspect ratio.",
    "- locationTag: a short unique snake_case name for the physical setting of this block (reuse the same tag when consecutive blocks share the same place). Different story beats MUST use different tags when the location changes.",
    "- IMPORTANT visual continuity: every visualPrompt must START with one short phrase establishing color palette and key light (e.g. 'Warm amber rim light, deep teal shadows. ...'). Use a CONSISTENT palette and lighting across all blocks so the scenes feel like one coherent film. Vary location, action, framing and emotion — not the film's color/light identity.",
    "- The story must be self-contained and follow the user's description, genre and tone.",
    "- When project_identity is provided, every block must stay on-brand with that fixed series/brand DNA — same audience, voice and universe — while this episode's story_description drives the plot.",
    "- Respond ONLY with the JSON object, no prose.",
  );
  return base.join("\n");
}

export function buildStoryUserPrompt(
  project: Project,
  characters: Array<Pick<Avatar, "name" | "description">>,
  primaryAvatar?: Pick<Avatar, "name" | "description"> | null,
  resolvedIdentity?: string,
) {
  const genreHint = getGenreStoryHint(project.genre);
  const identity = resolvedIdentity ?? normalizeProjectIdentity(project.projectIdentity);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      story_description: project.storyDescription,
      genre: project.genre,
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      visual_style: project.visualStyle,
      voice_tone: project.voiceTone,
      video_format: project.videoFormat ?? "horizontal",
      visual_framing: getVisualFramingHint(project.videoFormat),
      target_total_duration_seconds: project.targetDurationSeconds,
      cut_pace: project.cutPace ?? "balanced",
      narration_mode: "continuous",
      output_language: scriptLanguageOutputCode(normalizeProjectScriptLanguage(project.scriptLanguage)),
      ...(primaryAvatar
        ? {
            primary_character: {
              name: primaryAvatar.name,
              description: primaryAvatar.description ?? undefined,
            },
          }
        : characters.length > 0
          ? {
              characters: characters.map((c) => ({
                name: c.name,
                description: c.description ?? undefined,
              })),
            }
          : {}),
    },
    null,
    2,
  );
}

export function buildSuggestionSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You are a creative story-idea generator for online short videos.",
    scriptLanguageGenerationLine(language),
    "Given a genre, visual style and target duration, output JSON: { ideas: [ { title, summary } x5 ] }.",
    "When project_identity is provided, ideas must fit that fixed series/brand DNA and feel like episodes in the same line.",
    "Each summary is 2-3 sentences. Keep it punchy and clearly differentiated.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildSuggestionUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  targetDurationSeconds: number;
  videoFormat?: string;
  projectIdentity?: string;
  projectDnaId?: string | null;
  scriptLanguage?: ProjectScriptLanguage;
}) {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  const payload = {
    ...input,
    ...(identity ? { project_identity: identity } : {}),
    ...(genreHint ? { genre_guidance: genreHint } : {}),
    output_language: scriptLanguageOutputCode(language),
  };
  delete (payload as { projectIdentity?: string }).projectIdentity;
  delete (payload as { projectDnaId?: string | null }).projectDnaId;
  return JSON.stringify(payload, null, 2);
}

export function buildTrendQuerySystemPrompt(): string {
  return [
    "You plan web searches to discover what is trending RIGHT NOW for short-form video ideas.",
    "Input is JSON: { genre, visual_style, voice_tone, video_format?, project_identity?, output_language, today_iso, month_year_label }.",
    "Output STRICT JSON: { queries: string[] }.",
    "Rules:",
    "- queries: exactly 3 search strings for breaking news / viral moments from the LAST 24–48 HOURS.",
    "- Include today_iso or month_year_label in at least one query (e.g. 'travel news June 2026 today').",
    "- Prefer: 'breaking', 'today', 'this week', 'viral now' — NOT annual roundups or '2025 trends' style evergreen lists.",
    "- Mix news queries and YouTube/social queries (e.g. 'site:youtube.com {topic} viral this week').",
    "- Match output_language region (Brazil for pt, Spain/LatAm for es).",
    "- Be specific to genre and project_identity.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildTrendQueryUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  videoFormat?: string;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
  todayIso?: string;
  monthYearLabel?: string;
}): string {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  return JSON.stringify(
    {
      genre: input.genre,
      visual_style: input.visualStyle,
      voice_tone: input.voiceTone,
      video_format: input.videoFormat ?? "horizontal",
      today_iso: input.todayIso,
      month_year_label: input.monthYearLabel,
      ...(identity ? { project_identity: identity } : {}),
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      output_language: scriptLanguageOutputCode(language),
    },
    null,
    2,
  );
}

export function buildTrendSynthesisSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You turn FRESH web search snippets into short-video story pitches about what is happening NOW.",
    scriptLanguageGenerationLine(language),
    "Input is JSON: { genre, visual_style, voice_tone, target_duration_seconds, video_format?, project_identity?, today_iso, month_year_label, freshness_window, search_results }.",
    "Output STRICT JSON: { trends: [ { title, summary, trend_topic, source_url?, source_title?, source_type? } x5 ] }.",
    "Rules:",
    "- trends: exactly 5 distinct pitches grounded in search_results — only CURRENT stories (last 24–72h).",
    "- REJECT last year's annual roundups, undated '2025 trends' listicles, and evergreen guides unless the snippet date says today/this week.",
    "- title: catchy episode title — must feel timely THIS WEEK, not a retrospective.",
    "- summary: 2-3 sentences — what broke recently + hook for viewers now.",
    "- trend_topic: short label (e.g. 'Protesta hoje', 'Lançamento Apple').",
    "- source_url/source_title: cite the freshest matching snippet.",
    "- source_type: news | search | youtube.",
    "- When project_identity is provided, every pitch must fit that series/brand.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildTrendSynthesisUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  targetDurationSeconds: number;
  videoFormat?: string;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
  todayIso?: string;
  monthYearLabel?: string;
  freshnessWindow?: string;
  searchResults: Array<{
    query: string;
    snippets: Array<{
      title: string;
      url: string;
      content: string;
      sourceType?: string;
      publishedLabel?: string;
    }>;
  }>;
}): string {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  return JSON.stringify(
    {
      genre: input.genre,
      visual_style: input.visualStyle,
      voice_tone: input.voiceTone,
      target_duration_seconds: input.targetDurationSeconds,
      video_format: input.videoFormat ?? "horizontal",
      today_iso: input.todayIso,
      month_year_label: input.monthYearLabel,
      freshness_window: input.freshnessWindow ?? "24h",
      ...(identity ? { project_identity: identity } : {}),
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      output_language: scriptLanguageOutputCode(language),
      search_results: input.searchResults,
    },
    null,
    2,
  );
}

export function buildTopPicksSystemPrompt(language: ProjectScriptLanguage = "en"): string {
  return [
    "You are a senior creative producer picking the best short-video ideas from a mixed list.",
    scriptLanguageGenerationLine(language),
    "Input is JSON: { genre, visual_style, voice_tone, target_duration_seconds, video_format?, project_identity?, candidates }.",
    "Each candidate has: id, source (ai|trend), title, summary, and optional trend fields.",
    "Output STRICT JSON: { picks: [ { rank, candidate_id, rationale } x3 ] }.",
    "Rules:",
    "- picks: exactly 3 entries with rank 1, 2, 3 (1 = strongest recommendation).",
    "- candidate_id MUST match an id from candidates exactly — no invented ideas.",
    "- Use each candidate at most once.",
    "- Balance creative fit (DNA, genre, style, tone, duration) with timeliness when source=trend.",
    "- rank 1 should be the single best video to make RIGHT NOW — explain why in rationale (1-2 sentences).",
    "- rationale: short producer note in output_language — why this beat the others.",
    "- Prefer at least one trend pick when trends are timely and on-brand.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildTopPicksUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  targetDurationSeconds: number;
  videoFormat?: string;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
  candidates: Array<{
    id: string;
    source: string;
    title: string;
    summary: string;
    trend_topic?: string;
  }>;
}): string {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  return JSON.stringify(
    {
      genre: input.genre,
      visual_style: input.visualStyle,
      voice_tone: input.voiceTone,
      target_duration_seconds: input.targetDurationSeconds,
      video_format: input.videoFormat ?? "horizontal",
      ...(identity ? { project_identity: identity } : {}),
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      output_language: scriptLanguageOutputCode(language),
      candidates: input.candidates,
    },
    null,
    2,
  );
}

export function buildMusicPromptDefault(project: Project, resolvedIdentity?: string): string {
  const tone = project.voiceTone || project.genre || "cinematic";
  const style = project.visualStyle || "cinematic";
  const identity = resolvedIdentity ?? normalizeProjectIdentity(project.projectIdentity);
  return [
    ...(identity ? [`Series/brand identity: ${identity}.`] : []),
    `Background score for a ${project.genre || "story"} short video.`,
    `Mood: ${tone}, ${style}.`,
    "Instrumental only (no vocals or lyrics).",
    "Subtle, atmospheric, sits behind voice-over narration — low to moderate dynamics, leave space for spoken word.",
    "Mid-tempo, evolving texture; smooth intro and gentle outro suitable for looping.",
  ].join(" ");
}

export function buildYoutubeMetadataSystemPrompt(
  hasCharacter = false,
  videoFormat: Project["videoFormat"] = "horizontal",
  thumbnailMode: "with_title" | "image_only" = "with_title",
  language: ProjectScriptLanguage = "en",
) {
  const spec = getVideoFormatSpec(videoFormat);
  const platform =
    spec.id === "vertical"
      ? "Instagram Reels, YouTube Shorts and TikTok"
      : "YouTube";
  const langLabel =
    language === "pt" ? "Brazilian Portuguese" : language === "es" ? "Spanish" : "English";
  const lines = [
    `You produce upload metadata and cover art prompts for ${platform}.`,
    scriptLanguageNarrationOnlyLine(language),
    `Output JSON: { titles: string[5], description: string, tags: string[10-15], thumbnailPrompt: string }.`,
    `- titles: 5 SEO+CTR-optimized titles in ${langLabel}, each 30-65 chars, no clickbait emojis, no quotes.`,
    `- description: 600-900 chars in ${langLabel}, includes a hook in the first 2 lines, then a brief synopsis, then a TIMESTAMPS section using the provided block list (format 'mm:ss Title'), then 3-5 ${langLabel} hashtags on the last line.`,
    `- tags: comma-friendly short ${langLabel} keywords (no '#'), specific to the topic.`,
  ];
  if (thumbnailMode === "image_only") {
    lines.push(
      `- thumbnailPrompt: a vivid single-paragraph image prompt for a ${spec.aspectRatio} ${spec.thumbnailSizeLabel} cover image for ${platform}. Describe the most impactful scene, lighting, mood and composition. Do NOT mention text, typography, words or letters.`,
    );
  } else {
    lines.push(
      `- thumbnailPrompt: a vivid single-paragraph image prompt for a ${spec.aspectRatio} ${spec.thumbnailSizeLabel} cover/thumbnail for ${platform}. Describe the most impactful scene plus large clear typography space for a short headline (the headline text will be added separately).`,
    );
  }
  if (hasCharacter) {
    lines.push(
      "- thumbnailPrompt MUST feature the provided main character (use their exact name) as the focal subject.",
      "- thumbnailPrompt must describe ONLY scene composition, lighting, mood, pose, wardrobe style and setting. Do NOT describe face, hair color, skin tone, age, or body type — those come from reference photos.",
    );
  }
  lines.push("Respond ONLY with the JSON object.");
  return lines.join("\n");
}
