import type { Project, SocialSlide } from "@/lib/db/schema";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import {
  normalizeProjectScriptLanguage,
  scriptLanguageGenerationLine,
  scriptLanguageOutputCode,
} from "@/lib/project-language";
import {
  parseSocialReferenceAnalysis,
  parseSocialReferences,
  parseSocialSlideArt,
  socialReferenceItemForSlide,
} from "@/lib/social-art/model";
import { SOCIAL_ART_TEXT_LIMITS } from "@/lib/social-art/types";

export interface SocialTitleOption {
  lead: string;
  headline: string;
  body: string;
}

const SYSTEM_PROMPT = [
  "You write the text printed on Instagram post images: an optional small lead line, the headline and optional supporting text.",
  "Output JSON: { options: [ { lead, headline, body } x6 ] }.",
  "Give 6 clearly different options — vary the angle: benefit, curiosity, number, question, bold claim, emotion.",
  "Every option has its own new headline: never repeat current_text or another option's headline. current_text is only context about the topic.",
  "Headlines are short and punchy, written to be read in one second over an image. Mark nothing with quotes or emojis.",
  "When reference_text is provided, every option copies its structure and proportions: lead only if the reference has one, a headline with about the same number of words (never more than 2 extra), body only if the reference has body text and about as long.",
  `Lead max ${SOCIAL_ART_TEXT_LIMITS.lead} characters. Without reference_text: lead empty or 2-5 words, headline max 8 words, body max 18 words.`,
  "When layout is number, headline is just the number or a very short figure (e.g. 3x, 90%, R$10k) and lead/body explain it.",
  "Follow instruction when provided. Respond ONLY with the JSON object.",
].join("\n");

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/^["“]|["”]$/g, "").trim().slice(0, max) : "");

export async function generateSlideTitleOptions(input: {
  project: Project;
  slide: SocialSlide;
  slides: SocialSlide[];
  instruction?: string;
}): Promise<SocialTitleOption[]> {
  const { project, slide } = input;
  const language = normalizeProjectScriptLanguage(project.scriptLanguage);
  const art = parseSocialSlideArt(slide.art);
  const analysis = parseSocialReferenceAnalysis(project.socialReferenceNotes);
  const reference =
    parseSocialReferences(project.socialReferences).length > 0
      ? socialReferenceItemForSlide(analysis, slide.position)
      : null;
  const identity = await resolveProjectIdentityForProject(project).catch(() => "");

  const user = {
    ...(identity ? { project_identity: identity } : {}),
    post_title: project.title,
    post_brief: project.storyDescription,
    post_kind: project.postKind,
    slide: `${slide.position + 1} of ${input.slides.length}`,
    slide_role: slide.slideRole,
    layout: art.layout ?? "photo",
    current_text: { lead: art.lead, headline: slide.headline, body: slide.bodyText },
    other_slides: input.slides
      .filter((s) => s.id !== slide.id)
      .map((s) => s.headline)
      .filter(Boolean),
    ...(reference && (reference.headline || reference.lead)
      ? { reference_text: { lead: reference.lead, headline: reference.headline, body: reference.body } }
      : {}),
    ...(analysis?.contentNotes ? { reference_content: analysis.contentNotes } : {}),
    ...(input.instruction?.trim() ? { instruction: input.instruction.trim() } : {}),
    output_language: scriptLanguageOutputCode(language),
  };

  const raw = await chatCompletion({
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n${scriptLanguageGenerationLine(language)}` },
      { role: "user", content: JSON.stringify(user, null, 2) },
    ],
    model: resolveProjectApiModels(project).llmModel,
    temperature: 0.9,
    response_format: { type: "json_object" },
  });
  const json = extractJson<{ options?: unknown }>(raw);
  const options = (Array.isArray(json.options) ? json.options : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      lead: clip(o.lead, SOCIAL_ART_TEXT_LIMITS.lead),
      headline: clip(o.headline, 200),
      body: clip(o.body, 1000),
    }))
    .filter((o) => o.headline);
  if (options.length === 0) throw new Error("The AI returned no titles. Try again.");
  return options.slice(0, 6);
}
