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
  postKindPromptHint,
  type PostKind,
} from "./social-content";
import { getSocialFramingHint, normalizeSocialAspectRatio } from "./social-aspect-ratio";
import { dnaVisualPromptLines } from "./dna-style";
import type { ProjectDna } from "./db/schema";
import { getGenreStoryHint } from "./story-prompts";
import { parseSocialReferenceAnalysis, socialReferencePromptText } from "./social-art/model";
import type { SocialReferenceItem, SocialReferenceMode } from "./social-art/types";

export function buildSocialSuggestionSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You are a creative social-media content strategist.",
    scriptLanguageGenerationLine(language),
    "Given a brand DNA, visual style and post type, output JSON: { ideas: [ { title, summary } x5 ] }.",
    "Ideas must work as Instagram/feed posts — carousels people save, share or comment on.",
    "Each title is a post hook; each summary is 2-3 sentences describing the angle and slide flow.",
    "When project_identity is provided, ideas must fit that brand line and audience.",
    "When reference_posts is provided with reference_mode inspire, the client wants more posts like those references — same subject area, kind of themes, format and look, adapted to the brand. Vary the angles; never copy them.",
    "When reference_mode is copy, the client wants to copy the reference post(s) and make variations: every idea keeps the same subject, format, slide structure, headline pattern and kind of image as the references, changing only the wording, the angle or small details. Titles follow the reference headline pattern (same length and construction).",
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
  referenceNotes?: string;
  referenceMode?: SocialReferenceMode;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
}) {
  const genreHint = getGenreStoryHint(input.genre);
  const identity = normalizeProjectIdentity(input.projectIdentity);
  const language = normalizeProjectScriptLanguage(input.scriptLanguage);
  const postFormat = normalizePostFormat(input.postFormat);
  const slideCount = clampSlideCount(input.slideCount ?? (postFormat === "single" ? 1 : 7), postFormat);

  const fromReferences = Boolean(input.referenceNotes?.trim());
  const payload = {
    ...(fromReferences ? {} : { genre: input.genre, visual_style: input.visualStyle }),
    voice_tone: input.voiceTone,
    post_format: postFormat,
    post_kind: normalizePostKind(input.postKind),
    post_kind_guidance: postKindPromptHint(input.postKind),
    slide_count: slideCount,
    aspect_ratio: normalizeSocialAspectRatio(input.socialAspectRatio),
    platform: normalizeSocialAspectRatio(input.socialAspectRatio) === "9:16" ? "Instagram Stories" : "Instagram feed",
    ...(identity ? { project_identity: identity } : {}),
    ...(input.referenceNotes?.trim()
      ? { reference_posts: input.referenceNotes.trim(), reference_mode: input.referenceMode ?? "inspire" }
      : {}),
    ...(genreHint && !fromReferences ? { genre_guidance: genreHint } : {}),
    output_language: scriptLanguageOutputCode(language),
  };

  return JSON.stringify(payload, null, 2);
}

export function buildSlideStructureSystemPrompt(language: ProjectScriptLanguage = "en") {
  return [
    "You are an expert Instagram carousel author and art director.",
    scriptLanguageGenerationLine(language),
    "Output JSON: { slides: [ { position, role, lead, headline, body_text, visual_prompt } ] }.",
    "lead: optional small line printed above the headline (\"\" when not used).",
    "Roles: hook | body | cta | cover (cover only when it fits).",
    "headline: short on-slide title (max ~8 words). body_text: 1-3 lines for the slide.",
    "visual_prompt: one paragraph describing the BACKGROUND image only — mood, lighting, composition.",
    "Do NOT put the headline text inside visual_prompt — text is added in the app overlay later. Never mention text, typography, overlays, copy space or empty panels in visual_prompt; just say which part of the scene is simple background.",
    "When use_avatar is false and there are no reference_posts: no people, faces, or characters in visual_prompt — use objects, scenery, abstract, typography-friendly layouts. With reference_posts, show people only when the references do.",
    "When use_avatar is true: feature the named character as focal subject; do not describe face/hair/skin — reference photos supply identity.",
    "Keep a consistent color palette and lighting across all slides.",
    "When reference_slides is provided, slide N follows reference_slides[N] (wrapping around) for its text: same structure and proportions — lead (small line above the headline, max 90 characters) only when the reference has one, a headline about as long as the reference headline (same word count range, same emphasis), body_text only when the reference has body text and about as long. Rewrite the wording for post_title and post_brief. Never make the headline much longer than the reference's.",
    "In copy mode the visual_prompt is that reference scene with small variations (moment, angle, details) — same subject, framing and light. In inspire mode it is a new scene in the same style and composition (subject placed the same way, text area in the same place).",
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
    | "socialReferenceNotes"
  >;
  resolvedIdentity?: string;
  avatar?: Pick<Avatar, "name" | "description"> | null;
}) {
  const referenceAnalysis = parseSocialReferenceAnalysis(input.project.socialReferenceNotes);
  const refItems = referenceAnalysis?.items ?? [];
  const copyMode = referenceAnalysis?.mode === "copy";
  const referenceNotes = socialReferencePromptText(
    referenceAnalysis ? { ...referenceAnalysis, items: [], mode: "inspire" } : null,
  );
  const identity = input.resolvedIdentity ?? normalizeProjectIdentity(input.project.projectIdentity);
  const postFormat = normalizePostFormat(input.project.postFormat);
  const slideCount = clampSlideCount(input.project.slideCount ?? 7, postFormat);
  const aspect = normalizeSocialAspectRatio(input.project.socialAspectRatio);
  const useAvatar = Boolean(input.project.socialUseAvatar && input.avatar);
  const genreHint = getGenreStoryHint(input.project.genre);

  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      post_title: input.project.title,
      post_brief: input.project.storyDescription,
      ...(referenceNotes
        ? {}
        : {
            genre: input.project.genre,
            ...(genreHint ? { genre_guidance: genreHint } : {}),
            visual_style: input.project.visualStyle,
          }),
      voice_tone: input.project.voiceTone,
      post_format: postFormat,
      post_kind: normalizePostKind(input.project.postKind),
      post_kind_guidance: postKindPromptHint(input.project.postKind),
      slide_count: slideCount,
      aspect_ratio: aspect,
      visual_framing: getSocialFramingHint(aspect),
      ...(referenceNotes
        ? {
            reference_posts: referenceNotes,
            reference_mode: copyMode ? "copy" : "inspire",
            reference_guidance: copyMode
              ? "Copy mode: make this post a close variation of reference_slides."
              : "Inspire mode: new content in the references' subject area, with the same text structure and proportions as reference_slides and every visual_prompt in their visual style.",
          }
        : {}),
      ...(refItems.length > 0
        ? {
            reference_slides: refItems.map((item, i) => ({
              reference: i + 1,
              scene: item.scene,
              lead: item.lead,
              headline: item.headline,
              body_text: item.body,
              layout: item.layout,
            })),
          }
        : {}),
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
  project: Pick<
    Project,
    "genre" | "visualStyle" | "voiceTone" | "socialAspectRatio" | "socialUseAvatar" | "socialReferenceNotes"
  >;
  slide: Pick<SocialSlide, "visualPrompt" | "headline" | "bodyText" | "slideRole">;
  avatarHint?: string | null;
  postKind?: PostKind;
  dna?: Pick<ProjectDna, "colorPalette" | "visualMood" | "visualStyle" | "genre"> | null;
  hasClientReference?: boolean;
  hasStyleReferences?: boolean;
  /** Copy mode: the one reference image this slide recreates is attached. */
  copyReference?: SocialReferenceItem | null;
  /** Reference this slide's text layout follows (both modes). */
  textReference?: SocialReferenceItem | null;
}) {
  const referenceStyle = parseSocialReferenceAnalysis(input.project.socialReferenceNotes)?.styleNotes ?? "";
  const textZone = (item: SocialReferenceItem) =>
    `${item.align === "left" ? "Place the main subject on the right side. " : ""}The backdrop continues seamlessly across the whole frame; the ${item.position === "top" ? "upper" : "lower"}${item.align === "left" ? " left" : ""} part just has fewer details and softer light, blending naturally into the rest — no shapes, blocks or panels there.`;
  const fullBleed =
    "Full-bleed picture filling the entire frame edge to edge — no borders, frames, letterbox bars, blank bands, picture-in-picture, and no empty panels, cards, boxes or placeholders.";
  if (input.copyReference) {
    return [
      "Recreate the attached reference image as a close variation for a social post.",
      "Keep the same subject, setting, camera angle, framing, lighting, color grading and mood, so it reads as the same series.",
      "Change only small details (moment, pose, minor background elements) so it is a fresh picture, not a pixel copy.",
      "Remove every text, letter, number, logo, watermark and graphic overlay — deliver the clean picture only.",
      textZone(input.copyReference),
      fullBleed,
      getSocialFramingHint(input.project.socialAspectRatio),
      input.copyReference.scene ? `The reference shows: ${input.copyReference.scene}` : "",
      referenceStyle ? `Style: ${referenceStyle}` : "",
      input.slide.visualPrompt.trim() ? `Variation for this slide: ${input.slide.visualPrompt.trim()}` : "",
      input.avatarHint ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const parts = [
    referenceStyle
      ? `Social feed background image, ${input.project.voiceTone} mood.`
      : `Social feed background image, ${input.project.visualStyle} style, ${input.project.genre} genre, ${input.project.voiceTone} mood.`,
    getSocialFramingHint(input.project.socialAspectRatio),
    fullBleed,
    input.textReference
      ? `${textZone(input.textReference)} Do not render letters or words in the image.`
      : "Keep part of the background simple and uncluttered — do not render letters or words in the image.",
    ...dnaVisualPromptLines(input.dna),
    input.hasClientReference
      ? "Use the provided reference photo as the compositional base — preserve real subjects, products or scenery from the reference while adapting to the brand palette and slide brief."
      : "",
    referenceStyle ? `Match this reference look: ${referenceStyle}` : "",
    input.hasStyleReferences
      ? "The attached images are style references — match their photographic style, palette, lighting and mood, but create a new scene and do not copy any text, logos or watermarks from them."
      : "",
    input.slide.visualPrompt.trim(),
  ];
  if (input.avatarHint) {
    parts.push(input.avatarHint);
  } else if (referenceStyle) {
    parts.push("Feature people only if the references do — then a different, generic person in the same kind of pose and wardrobe.");
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
  const genreHint = getGenreStoryHint(input.project.genre);
  return JSON.stringify(
    {
      ...(identity ? { project_identity: identity } : {}),
      post_title: input.project.title,
      post_brief: input.project.storyDescription,
      genre: input.project.genre,
      ...(genreHint ? { genre_guidance: genreHint } : {}),
      voice_tone: input.project.voiceTone,
      post_format: normalizePostFormat(input.project.postFormat),
      post_kind: normalizePostKind(input.project.postKind),
      post_kind_guidance: postKindPromptHint(input.project.postKind),
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
