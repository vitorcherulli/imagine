import type { ProjectDna, SocialArtBrandKit, SocialSlide } from "@/lib/db/schema";
import { HEX_COLOR_RE } from "@/lib/social-art/color";
import {
  DEFAULT_SOCIAL_ART_COLORS,
  DEFAULT_SOCIAL_ART_SETTINGS,
  DEFAULT_SOCIAL_SLIDE_ART,
  SOCIAL_REFERENCE_LIMIT,
  SOCIAL_TITLE_STYLE_IDS,
  SOCIAL_TITLE_STYLES,
  type SocialArtBrand,
  type SocialArtColors,
  type SocialArtFormat,
  type SocialArtPost,
  type SocialArtSettings,
  type SocialArtSlide,
  type SocialReference,
  type SocialReferenceAnalysis,
  type SocialReferenceItem,
  type SocialSlideArt,
  type SocialTitleStyleId,
} from "@/lib/social-art/types";
import { jsonSafeParse } from "@/lib/utils";
import { isProjectScriptLanguage } from "@/lib/project-language";

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseSocialSlideArt(raw: string | null | undefined): SocialSlideArt {
  const v = jsonSafeParse<Record<string, unknown>>(raw ?? "", {}) ?? {};
  const d = DEFAULT_SOCIAL_SLIDE_ART;
  return {
    ...(v.layout === "photo" || v.layout === "text" || v.layout === "number" ? { layout: v.layout } : {}),
    position: v.position === "top" || v.position === "bottom" ? v.position : d.position,
    ...(v.align === "left" || v.align === "center" ? { align: v.align } : {}),
    ...(v.overlay === "light" || v.overlay === "dark" ? { overlay: v.overlay } : {}),
    ...(v.supportSize === "small" || v.supportSize === "large" ? { supportSize: v.supportSize } : {}),
    lead: str(v.lead),
    tag: str(v.tag),
    focusX: num(v.focusX, 0, 100, d.focusX),
    focusY: num(v.focusY, 0, 100, d.focusY),
    zoom: num(v.zoom, 100, 220, d.zoom),
  };
}

export function parseSocialArtSettings(raw: string | null | undefined): SocialArtSettings {
  const v = jsonSafeParse<Record<string, unknown>>(raw ?? "", {}) ?? {};
  const d = DEFAULT_SOCIAL_ART_SETTINGS;
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  return {
    showHandle: bool(v.showHandle, d.showHandle),
    showLogo: bool(v.showLogo, d.showLogo),
    decor: typeof v.decor === "boolean" ? v.decor : null,
    showCounter: bool(v.showCounter, d.showCounter),
    titleStyle: isSocialTitleStyleId(v.titleStyle) ? v.titleStyle : null,
    colors: parseColorsStrict(v.colors),
  };
}

export function isSocialTitleStyleId(v: unknown): v is SocialTitleStyleId {
  return typeof v === "string" && SOCIAL_TITLE_STYLE_IDS.includes(v as SocialTitleStyleId);
}

/** Full, valid color set or null. */
export function parseColorsStrict(v: unknown): SocialArtColors | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const ok = (x: unknown): x is string => typeof x === "string" && HEX_COLOR_RE.test(x);
  return ok(c.dark) && ok(c.accent) && ok(c.light)
    ? { dark: c.dark.toLowerCase(), accent: c.accent.toLowerCase(), light: c.light.toLowerCase() }
    : null;
}

function parseColors(raw: string): SocialArtColors {
  const parsed = jsonSafeParse<Partial<SocialArtColors>>(raw, {}) ?? {};
  const pick = (key: keyof SocialArtColors) => {
    const v = parsed[key];
    return typeof v === "string" && HEX_COLOR_RE.test(v) ? v : DEFAULT_SOCIAL_ART_COLORS[key];
  };
  return { dark: pick("dark"), accent: pick("accent"), light: pick("light") };
}

export function parseSocialReferences(raw: string | null | undefined): SocialReference[] {
  const v = jsonSafeParse<unknown[]>(raw ?? "", []) ?? [];
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (r): r is SocialReference =>
        !!r &&
        typeof (r as SocialReference).assetId === "string" &&
        typeof (r as SocialReference).url === "string",
    )
    .slice(0, SOCIAL_REFERENCE_LIMIT);
}

export function parseSocialReferenceAnalysis(raw: string | null | undefined): SocialReferenceAnalysis | null {
  const v = jsonSafeParse<Record<string, unknown> | null>(raw ?? "", null);
  if (!v || typeof v !== "object") return null;
  const analysis: SocialReferenceAnalysis = {
    styleNotes: str(v.styleNotes).slice(0, 1500),
    contentNotes: str(v.contentNotes).slice(0, 1500),
    palette: parseColorsStrict(v.palette),
    titleStyle: isSocialTitleStyleId(v.titleStyle) ? v.titleStyle : null,
    items: parseSocialReferenceItems(v.items),
    language: isProjectScriptLanguage(v.language) ? v.language : null,
    mode: v.mode === "copy" ? "copy" : "inspire",
  };
  return analysis.styleNotes || analysis.contentNotes ? analysis : null;
}

export function parseSocialReferenceItems(v: unknown): SocialReferenceItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, SOCIAL_REFERENCE_LIMIT)
    .map((x) => ({
      scene: str(x.scene).trim().slice(0, 1200),
      lead: str(x.lead).trim().slice(0, 300),
      headline: str(x.headline).trim().slice(0, 300),
      body: str(x.body).trim().slice(0, 600),
      layout: x.layout === "text" || x.layout === "number" ? x.layout : "photo",
      position: x.position === "top" ? "top" : "bottom",
      align: x.align === "left" ? "left" : "center",
      overlay: x.overlay === "dark" ? "dark" : "light",
      supportSize: x.supportSize === "large" || x.support_size === "large" ? "large" : "small",
    }));
}

/** Copy mode: slide N follows reference N, wrapping around. */
export function socialReferenceIndexForSlide(analysis: SocialReferenceAnalysis | null, position: number, count: number): number | null {
  if (!analysis || analysis.mode !== "copy" || count === 0) return null;
  return ((position % count) + count) % count;
}

/** Text layout pattern for a slide (both modes): slide N follows reference N, wrapping around. */
export function socialReferenceItemForSlide(
  analysis: SocialReferenceAnalysis | null,
  position: number,
): SocialReferenceItem | null {
  const items = analysis?.items ?? [];
  if (items.length === 0) return null;
  return items[((position % items.length) + items.length) % items.length];
}

/** Reference notes for text prompts. */
export function socialReferencePromptText(analysis: SocialReferenceAnalysis | null): string {
  if (!analysis) return "";
  const lines = [
    analysis.styleNotes ? `Visual style: ${analysis.styleNotes}` : "",
    analysis.contentNotes ? `Content: ${analysis.contentNotes}` : "",
  ];
  if (analysis.mode === "copy") {
    analysis.items.forEach((item, i) => {
      const text = [
        item.lead && `lead line "${item.lead}"`,
        item.headline && `headline "${item.headline}"`,
        item.body && `text "${item.body}"`,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `Reference ${i + 1}: ${item.scene}${text ? ` On-image ${text}.` : " No text on the image."} Layout ${item.layout}, title at the ${item.position}.`,
      );
    });
  }
  return lines.filter(Boolean).join("\n");
}

/** Publication title style and colors layered over the brand kit. */
export function resolveSocialArtBrand(brand: SocialArtBrand, settings: SocialArtSettings): SocialArtBrand {
  const preset = settings.titleStyle ? SOCIAL_TITLE_STYLES[settings.titleStyle] : null;
  return {
    ...brand,
    ...(settings.colors ? { colors: settings.colors } : {}),
    ...(preset
      ? {
          fontHeading: preset.font,
          uppercaseTitles: preset.uppercase,
          titleTreatment: preset.treatment,
          titleScale: preset.scale ?? 1,
          accentShine: preset.treatment === "gradient" ? true : brand.accentShine,
        }
      : {}),
  };
}

/** Without a DNA or kit, returns the defaults a fresh kit would have. */
export function toSocialArtBrand(
  dna: Pick<ProjectDna, "id" | "name" | "logoUrl"> | null,
  kit: SocialArtBrandKit | null,
  fallbackName = "",
): SocialArtBrand {
  return {
    dnaId: dna?.id ?? null,
    name: dna?.name ?? fallbackName,
    logoUrl: dna?.logoUrl ?? "",
    handle: kit?.handle ?? "",
    colors: parseColors(kit?.colors ?? "{}"),
    accentShine: kit?.accentShine ?? true,
    fontHeading: kit?.fontHeading ?? "Montserrat",
    fontBody: kit?.fontBody ?? "Montserrat",
    uppercaseTitles: kit?.uppercaseTitles ?? true,
    titleTreatment: "gradient",
    titleScale: 1,
    decorColor:
      kit && HEX_COLOR_RE.test(kit.decorColor) ? kit.decorColor : DEFAULT_SOCIAL_ART_COLORS.accent,
    decorDefault: kit?.decorDefault ?? false,
  };
}

export function socialArtFormat(aspectRatio: string | null | undefined): SocialArtFormat {
  if (aspectRatio === "1:1") return "square";
  if (aspectRatio === "9:16") return "story";
  return "feed";
}

export function toSocialArtSlide(
  slide: Pick<SocialSlide, "id" | "headline" | "bodyText" | "imageUrl">,
  art: SocialSlideArt,
): SocialArtSlide {
  return {
    id: slide.id,
    layout: art.layout ?? (slide.imageUrl ? "photo" : "text"),
    position: art.position,
    align: art.align,
    overlay: art.overlay,
    supportSize: art.supportSize,
    lead: art.lead,
    title: slide.headline,
    body: slide.bodyText,
    tag: art.tag,
    photo: slide.imageUrl ?? "",
    focusX: art.focusX,
    focusY: art.focusY,
    zoom: art.zoom,
  };
}

export function buildSocialArtPost(input: {
  aspectRatio: string | null | undefined;
  slides: Array<Pick<SocialSlide, "id" | "headline" | "bodyText" | "imageUrl"> & { art: SocialSlideArt }>;
  settings: SocialArtSettings;
  brand: SocialArtBrand;
}): SocialArtPost {
  return {
    format: socialArtFormat(input.aspectRatio),
    slides: input.slides.map((s) => toSocialArtSlide(s, s.art)),
    showHandle: input.settings.showHandle,
    showLogo: input.settings.showLogo,
    decor: input.settings.decor ?? input.brand.decorDefault,
    showCounter: input.settings.showCounter,
  };
}

export function socialArtSlug(text: string): string {
  return (
    String(text || "post")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "post"
  );
}
