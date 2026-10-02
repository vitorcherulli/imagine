import { getOwnedMediaLibraryAsset } from "@/lib/media-library-server";
import { chatCompletion, extractJson, type ChatContentPart } from "@/lib/openrouter/llm";
import { isSocialTitleStyleId, parseColorsStrict, parseSocialReferenceItems } from "@/lib/social-art/model";
import {
  SOCIAL_REFERENCE_LIMIT,
  SOCIAL_TITLE_STYLES,
  type SocialReference,
  type SocialReferenceAnalysis,
} from "@/lib/social-art/types";
import { readImageAsDataUrl } from "@/lib/storage";
import { isProjectScriptLanguage } from "@/lib/project-language";

/** Keeps only the user's own image assets, in order, without duplicates. */
export async function resolveOwnedSocialReferences(
  userId: string,
  assetIds: string[],
): Promise<SocialReference[]> {
  const unique = Array.from(new Set(assetIds)).slice(0, SOCIAL_REFERENCE_LIMIT);
  const assets = await Promise.all(unique.map((id) => getOwnedMediaLibraryAsset(id, userId)));
  return assets
    .filter((a): a is NonNullable<typeof a> => !!a && a.kind === "image" && !!a.url)
    .map((a) => ({ assetId: a.id, url: a.url }));
}

export async function socialReferenceDataUrls(refs: SocialReference[], limit: number): Promise<string[]> {
  const urls = await Promise.all(
    refs.slice(0, limit).map((r) => readImageAsDataUrl(r.url).catch(() => "")),
  );
  return urls.filter(Boolean);
}

const TITLE_STYLE_GUIDE = Object.entries(SOCIAL_TITLE_STYLES)
  .map(([id, s]) => `${id}: ${s.label} — ${s.font}, ${s.uppercase ? "uppercase" : "sentence case"}, ${s.treatment} fill`)
  .join("\n");

const ANALYSIS_SYSTEM_PROMPT = [
  "You are an art director for Instagram brands. You receive reference posts a client likes.",
  "Describe what they have in common so new posts can match them.",
  "Output JSON: { style_notes, content_notes, palette: { dark, accent, light }, title_style, language, items }.",
  "language: the language of the text written on the images — \"pt\" (Portuguese), \"en\" (English) or \"es\" (Spanish); null when there is no text or it is another language.",
  "style_notes: 2-4 sentences for an image generator — photography or illustration style, lighting, composition, framing, textures, mood. Never mention text, logos or brand names.",
  "content_notes: 1-2 sentences — what kind of posts these are (themes, formats, slide structure, headline pattern, tone).",
  "palette: hex colors (#rrggbb). dark = deep background/text color, accent = the color the headline text is actually painted in, light = soft light tone.",
  "title_style: the closest headline style id from this list:",
  TITLE_STYLE_GUIDE,
  "items: one object per image, in the order given: { scene, lead, headline, body, layout, position, align, overlay, support_size }.",
  "scene: 2-3 sentences detailed enough to recreate the picture behind the text — main subject, setting, camera angle and distance, framing, lighting, colors. No text, logos or brand names.",
  "Copy text verbatim in its original language, \"\" when absent. headline: the biggest or most emphasized words. lead: the smaller text right before the headline that leads into it. body: the smaller text after the headline. When one sentence mixes sizes or weights (e.g. regular words around bold capitals), split it: regular part before → lead, emphasized part → headline, regular part after → body. Skip handles, logos and page counters.",
  "layout: photo (text over a photo/illustration), text (text on a plain color background) or number (a big number is the focus).",
  "position: top or bottom — where the headline sits.",
  "align: left or center — how the text block is aligned.",
  "overlay: dark when the text is light-colored over a dark area, light when the text is dark over a light area.",
  "support_size: compare the font size of the lead/body lines with the headline. large when they are display-sized — their letters are about as tall as the headline's (often the same color, only a lighter weight); small only when they read like a caption, clearly under half the headline's size.",
  "Write the notes and scenes in English. Respond ONLY with the JSON object.",
].join("\n");

export async function analyzeSocialReferences(refs: SocialReference[]): Promise<SocialReferenceAnalysis> {
  const images = await socialReferenceDataUrls(refs, SOCIAL_REFERENCE_LIMIT);
  if (images.length === 0) throw new Error("Could not read the reference images.");

  const content: ChatContentPart[] = [
    { type: "text", text: `Analyze these ${images.length} reference post image(s).` },
    ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  const raw = await chatCompletion({
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });
  const json = extractJson<Record<string, unknown>>(raw);
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 1500) : "");
  const analysis: SocialReferenceAnalysis = {
    styleNotes: text(json.style_notes),
    contentNotes: text(json.content_notes),
    palette: parseColorsStrict(json.palette),
    titleStyle: isSocialTitleStyleId(json.title_style) ? json.title_style : null,
    items: parseSocialReferenceItems(json.items).slice(0, images.length),
    language: isProjectScriptLanguage(json.language) ? json.language : null,
    mode: "inspire",
  };
  if (!analysis.styleNotes && !analysis.contentNotes) {
    throw new Error("The AI could not describe the references.");
  }
  return analysis;
}
