import { chatCompletion, extractJson, type ChatContentPart } from "@/lib/openrouter/llm";
import { isCreativeFormat, CREATIVE_LANGUAGES, toNameSlug, toProductCode } from "@/lib/creatives";
import type { ContentAnalysis } from "@/lib/creatives-import";

export const ANALYZE_MAX_ITEMS = 12;
const MAX_FRAMES = 3;
const MAX_FRAME_CHARS = 400_000;

const SYSTEM_PROMPT = [
  "You organize a company's ad creatives (Meta / Instagram ads) into a library.",
  "Each item is one file: an image, or a few frames from a video (first seconds, then later).",
  "File names and folders are only hints — they are often messy legacy names like \"A2.1 - IA.png\".",
  "For every item return an object with:",
  "key: echo the item key.",
  "product: the specific product, feature or offer advertised, one short word or acronym in UPPERCASE without spaces (e.g. EXTRATOR, CRM, IA). Reuse a known product when it fits. Never the company / brand name when the piece is about one of its products or features (a brand \"Acme\" advertising its AI assistant → IA).",
  "angle: the core promise or idea in 2-4 plain words, in the ad's language (e.g. \"Vende sozinha\").",
  "hook: the headline or first line exactly as written on the piece, verbatim, original language, max 140 characters. For videos use the on-screen text or captions of the first seconds. \"\" when there is none.",
  "format: IMG (static image), CARR (carousel card), VID (edited or motion video with nobody talking to the camera) or UGC (a person talking to the camera).",
  "creator: for UGC, the first name of the person on camera when a known creator or the file name says it; otherwise \"\".",
  "language: PT, EN or ES — the language of the text on the piece.",
  "group: concept id. Items carrying the same hook / message / idea are one concept and MUST share the group, even when the picture, layout or size differs. When an item is the same concept as one in known_groups, use that group id. Otherwise create a short new id like \"n1\", reused for its siblings.",
  "variant: inside a group, items that are the SAME design (same picture and same text, only resized or cropped to another aspect ratio) share the variant id. A different execution (other picture, layout, wording, edit or cut) gets another variant id.",
  "note: one short sentence describing what the piece shows, in the ad's language.",
  "Respond ONLY with JSON: { \"items\": [ ... ] } in the order given.",
].join("\n");

export type AnalyzeItem = {
  key: string;
  name: string;
  path: string;
  isVideo: boolean;
  ratio: string | null;
  /** JPEG data URLs. */
  frames: string[];
};

export type AnalyzeContext = {
  products: string[];
  creators: string[];
  /** Concepts the files may belong to: library concepts ("C005") and groups from earlier batches. */
  knownGroups: { group: string; product: string; angle: string; hook: string }[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Reads each piece (image or video frames) and suggests product, angle, hook, format and concept grouping. */
export async function analyzeCreativeContent(rawItems: unknown[], rawCtx: Partial<AnalyzeContext>): Promise<ContentAnalysis[]> {
  const items: AnalyzeItem[] = rawItems.slice(0, ANALYZE_MAX_ITEMS).map((v) => {
    const it = (v ?? {}) as Record<string, unknown>;
    return {
      key: str(it.key, 40),
      name: str(it.name, 200),
      path: str(it.path, 300),
      isVideo: !!it.isVideo,
      ratio: str(it.ratio, 8) || null,
      frames: (Array.isArray(it.frames) ? it.frames : [])
        .filter((f): f is string => typeof f === "string" && f.startsWith("data:image/") && f.length <= MAX_FRAME_CHARS)
        .slice(0, MAX_FRAMES),
    };
  });
  if (!items.length) return [];

  const context = {
    known_products: (rawCtx.products ?? []).slice(0, 50).map((p) => str(p, 30)),
    known_creators: (rawCtx.creators ?? []).slice(0, 30).map((c) => str(c, 30)),
    known_groups: (rawCtx.knownGroups ?? []).slice(0, 80).map((v) => {
      const g = (v ?? {}) as Record<string, unknown>;
      return { group: str(g.group, 20), product: str(g.product, 20), angle: str(g.angle, 60), hook: str(g.hook, 160) };
    }),
  };

  const content: ChatContentPart[] = [{ type: "text", text: `Context: ${JSON.stringify(context)}` }];
  for (const it of items) {
    content.push({
      type: "text",
      text: `Item key=${it.key} · file "${it.path || it.name}" · ${it.isVideo ? "video" : "image"}${it.ratio ? ` · ratio ${it.ratio}` : ""}${it.frames.length ? "" : " · (no preview available — use the file name)"}`,
    });
    for (const url of it.frames) content.push({ type: "image_url", image_url: { url } });
  }

  const raw = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });
  const json = extractJson<{ items?: Record<string, unknown>[] }>(raw);
  const keys = new Set(items.map((i) => i.key));
  return (json.items ?? [])
    .filter((r) => keys.has(str(r.key, 40)))
    .map((r) => {
      const language = str(r.language, 2).toUpperCase();
      const format = str(r.format, 4).toUpperCase();
      return {
        key: str(r.key, 40),
        product: toProductCode(str(r.product, 30)),
        angle: toNameSlug(str(r.angle, 80)),
        hook: str(r.hook, 300),
        format: isCreativeFormat(format) ? format : null,
        creator: toNameSlug(str(r.creator, 30), 16),
        language: (CREATIVE_LANGUAGES as readonly string[]).includes(language) ? language : null,
        group: str(r.group, 20) || null,
        variant: str(r.variant, 20) || null,
        note: str(r.note, 200),
      };
    });
}
