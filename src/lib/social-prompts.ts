import type { Avatar, Project, SocialSlide } from "./db/schema";
import { normalizeProjectIdentity } from "./project-identity";
import {
  normalizeProjectScriptLanguage,
  scriptLanguageGenerationLine,
  scriptLanguageOutputCode,
  type ProjectScriptLanguage,
} from "./project-language";
import {
  clampSlideCount,
  normalizePostFormat,
  normalizePostKind,
  type PostKind,
} from "./social-content";
import { getSocialFramingHint, normalizeSocialAspectRatio } from "./social-aspect-ratio";
import { dnaVisualPromptLines } from "./dna-style";
import type { ProjectDna } from "./db/schema";
import { getGenreStoryHint } from "./story-prompts";

export function buildSocialSuggestionSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You are a creative social-media content strategist.",
    scriptLanguageGenerationLine(language),
    "Given a brand DNA, visual style and post type, output JSON: { ideas: [ { title, summary } x5 ] }.",
    "Ideas must work as Instagram/feed posts — carousels people save, share or comment on.",
    "Each title is a post hook; each summary is 2-3 sentences describing the angle and slide flow.",
    "When project_identity is provided, ideas must fit that brand line and audience.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildSocialSuggestionUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  postFormat?: string;
  postKind?: string;
  slideCount?: number;
  socialAspectRatio?: string;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
}) {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  const postFormat = normalizePostFormat(input.postFormat);
  const slideCount = clampSlideCount(input.slideCount ?? (postFormat === "single" ? 1 : 7), postFormat);

  const payload = {
    genre: input.genre,
    visual_style: input.visualStyle,
    voice_tone: input.voiceTone,
    post_format: postFormat,
    post_kind: normalizePostKind(input.postKind),
    slide_count: slideCount,
    aspect_ratio: normalizeSocialAspectRatio(input.socialAspectRatio),
    platform: "Instagram feed",
    ...(identity ? { project_identity: identity } : {}),
    ...(genreHint ? { genre_guidance: genreHint } : {}),
    output_language: scriptLanguageOutputCode(language),
  };

  return JSON.stringify(payload, null, 2);
}

export function buildSlideStructureSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You are an expert Instagram carousel author and art director.",
    scriptLanguageGenerationLine(language),
    "Output JSON: { slides: [ { position, role, headline, body_text, visual_prompt } ] }.",
    "Roles: hook | body | cta | cover (cover only when it fits).",
    "headline: short on-slide title (max ~8 words). body_text: 1-3 lines for the slide.",
    "visual_prompt: one paragraph describing the BACKGROUND image only — mood, lighting, composition.",
    "Do NOT put the headline text inside visual_prompt — text is added in the app overlay later.",
    "When use_avatar is false: no people, faces, or characters in visual_prompt — use objects, scenery, abstract, typography-friendly layouts.",
    "When use_avatar is true: feature the named character as focal subject; do not describe face/hair/skin — reference photos supply identity.",
    "Keep a consistent color palette and lighting across all slides.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildSlideStructureUserPrompt(input: {
  project: Pick<
    Project,
    | "title"
    | "storyDescription"
    | "genre"
    | "visualStyle"
    | "voiceTone"
    | "postFormat"
    | "postKind"
    | "slideCount"
    | "socialAspectRatio"
    | "socialUseAvatar"
    | "scriptLanguage"
    | "projectIdentity"
  >;
  resolvedIdentity?: string;
  avatar?: Pick<Avatar, "name" | "description"> | null;
}) {
  const identity = input.resolvedIdentity ?? normalizeProjectIdentity(input.project.projectIdentity);
  const postFormat = normalizePostFormat(input.project.postFormat);
  const slideCount = clampSlideCount(input.project.slideCount ?? 7, postFormat);
  const aspect = normalizeSocialAspectRatio(input.project.socialAspectRatio);
  const useAvatar = Boolean(input.project.socialUseAvatar && input.avatar);

  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      post_title: input.project.title,
      post_brief: input.project.storyDescription,
      genre: input.project.genre,
      visual_style: input.project.visualStyle,
      voice_tone: input.project.voiceTone,
      post_format: postFormat,
      post_kind: normalizePostKind(input.project.postKind),
      slide_count: slideCount,
      aspect_ratio: aspect,
      visual_framing: getSocialFramingHint(aspect),
      use_avatar: useAvatar,
      ...(useAvatar && input.avatar
        ? {
            character: {
              name: input.avatar.name,
              description: input.avatar.description ?? undefined,
            },
          }
        : {}),
      output_language: scriptLanguageOutputCode(
        normalizeProjectScriptLanguage(input.project.scriptLanguage),
      ),
    },
    null,
    2,
  );
}

export function buildSlideVisualPrompt(input: {
  project: Pick<Project, "genre" | "visualStyle" | "voiceTone" | "socialAspectRatio" | "socialUseAvatar">;
  slide: Pick<SocialSlide, "visualPrompt" | "headline" | "bodyText" | "slideRole">;
  avatarHint?: string | null;
  postKind?: PostKind;
  dna?: Pick<ProjectDna, "colorPalette" | "visualMood" | "visualStyle" | "genre"> | null;
  hasClientReference?: boolean;
}) {
  const parts = [
    `Social feed background image, ${input.project.visualStyle} style, ${input.project.genre} genre, ${input.project.voiceTone} mood.`,
    getSocialFramingHint(input.project.socialAspectRatio),
    "Leave clear negative space for text overlay — do not render letters or words in the image.",
    ...dnaVisualPromptLines(input.dna),
    input.hasClientReference
      ? "Use the provided reference photo as the compositional base — preserve real subjects, products or scenery from the reference while adapting to the brand palette and slide brief."
      : "",
    input.slide.visualPrompt.trim(),
  ];
  if (input.avatarHint) {
    parts.push(input.avatarHint);
  } else if (!input.project.socialUseAvatar) {
    parts.push("No people or faces. Graphic, scenic or object-focused composition.");
  }
  return parts.filter(Boolean).join(" ");
}

export function buildSocialCaptionSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You write Instagram feed captions that drive saves and comments.",
    scriptLanguageGenerationLine(language),
    "Output JSON: { hook_line, caption, hashtags, slide_notes }.",
    "hook_line: first line before 'more' break — punchy.",
    "caption: full post body with line breaks, 2-4 short paragraphs, ends with CTA.",
    "hashtags: array of 10-15 strings without #.",
    "slide_notes: optional array of short strings — one per slide for reference.",
    "Match brand voice from project_identity when provided.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildSocialCaptionUserPrompt(input: {
  project: Pick<
    Project,
    "title" | "storyDescription" | "genre" | "voiceTone" | "postFormat" | "postKind" | "scriptLanguage" | "projectIdentity"
  >;
  resolvedIdentity?: string;
  slides: Array<Pick<SocialSlide, "position" | "headline" | "bodyText" | "slideRole">>;
}) {
  const identity = input.resolvedIdentity ?? normalizeProjectIdentity(input.project.projectIdentity);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      post_title: input.project.title,
      post_brief: input.project.storyDescription,
      genre: input.project.genre,
      voice_tone: input.project.voiceTone,
      post_format: normalizePostFormat(input.project.postFormat),
      post_kind: normalizePostKind(input.project.postKind),
      slides: input.slides.map((s) => ({
        position: s.position,
        role: s.slideRole,
        headline: s.headline,
        body_text: s.bodyText,
      })),
      output_language: scriptLanguageOutputCode(
        normalizeProjectScriptLanguage(input.project.scriptLanguage),
      ),
    },
    null,
    2,
  );
}
