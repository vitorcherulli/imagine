import { z } from "zod";
import { HEX_COLOR_RE } from "@/lib/social-art/color";
import { SOCIAL_ART_FONT_FAMILIES } from "@/lib/social-art/fonts";
import {
  SOCIAL_ART_TEXT_LIMITS,
  SOCIAL_REFERENCE_LIMIT,
  SOCIAL_TITLE_STYLE_IDS,
  type SocialTitleStyleId,
} from "@/lib/social-art/types";

const hex = z.string().regex(HEX_COLOR_RE);
const font = z.string().refine((f) => SOCIAL_ART_FONT_FAMILIES.includes(f), "Unknown font");

export const socialSlideArtSchema = z.object({
  layout: z.enum(["photo", "text", "number"]).optional(),
  position: z.enum(["top", "bottom"]),
  align: z.enum(["left", "center"]).optional(),
  overlay: z.enum(["light", "dark"]).optional(),
  supportSize: z.enum(["small", "large"]).optional(),
  lead: z.string().max(SOCIAL_ART_TEXT_LIMITS.lead),
  tag: z.string().max(SOCIAL_ART_TEXT_LIMITS.tag),
  focusX: z.number().min(0).max(100),
  focusY: z.number().min(0).max(100),
  zoom: z.number().min(100).max(220),
});

export const socialArtColorsSchema = z.object({ dark: hex, accent: hex, light: hex });

export const socialTitleStyleSchema = z.enum(SOCIAL_TITLE_STYLE_IDS as [SocialTitleStyleId, ...SocialTitleStyleId[]]);

export const socialArtSettingsSchema = z.object({
  showHandle: z.boolean(),
  showLogo: z.boolean(),
  decor: z.boolean().nullable(),
  showCounter: z.boolean(),
  titleStyle: socialTitleStyleSchema.nullable().optional(),
  colors: socialArtColorsSchema.nullable().optional(),
});

export const socialReferenceIdsSchema = z.array(z.string().min(1)).max(SOCIAL_REFERENCE_LIMIT);

export const socialReferenceModeSchema = z.enum(["inspire", "copy"]);

export const socialReferenceAnalysisSchema = z.object({
  styleNotes: z.string().max(1500),
  contentNotes: z.string().max(1500),
  palette: socialArtColorsSchema.nullable(),
  titleStyle: socialTitleStyleSchema.nullable(),
  items: z
    .array(
      z.object({
        scene: z.string().max(1200),
        lead: z.string().max(300).default(""),
        headline: z.string().max(300),
        body: z.string().max(600),
        layout: z.enum(["photo", "text", "number"]),
        position: z.enum(["top", "bottom"]),
        align: z.enum(["left", "center"]).default("center"),
        overlay: z.enum(["light", "dark"]).default("light"),
        supportSize: z.enum(["small", "large"]).default("small"),
      }),
    )
    .max(SOCIAL_REFERENCE_LIMIT)
    .default([]),
  language: z.enum(["en", "pt", "es"]).nullable().default(null),
  mode: socialReferenceModeSchema.default("inspire"),
});

export const publicationArtPatchSchema = z.object({
  settings: socialArtSettingsSchema.optional(),
  slides: z
    .array(
      z.object({
        id: z.string().min(1),
        headline: z.string().max(200).optional(),
        bodyText: z.string().max(1000).optional(),
        visualPrompt: z.string().max(4000).optional(),
        art: socialSlideArtSchema.optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const socialArtKitPatchSchema = z.object({
  handle: z.string().max(60).optional(),
  colors: socialArtColorsSchema.optional(),
  accentShine: z.boolean().optional(),
  fontHeading: font.optional(),
  fontBody: font.optional(),
  uppercaseTitles: z.boolean().optional(),
  decorColor: hex.optional(),
  decorDefault: z.boolean().optional(),
});

export type PublicationArtPatch = z.infer<typeof publicationArtPatchSchema>;
export type SocialArtKitPatch = z.infer<typeof socialArtKitPatchSchema>;
