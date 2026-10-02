import type { ProjectScriptLanguage } from "@/lib/project-language";

export type SocialArtFormat = "feed" | "square" | "story";
export type SocialArtLayout = "photo" | "text" | "number";
export type SocialArtTextPosition = "top" | "bottom";
export type SocialArtTextAlign = "left" | "center";
/** Wash behind the text on photos: light mist with dark text, or dark shade with light text. */
export type SocialArtOverlay = "light" | "dark";
/** Size of the small line and supporting text next to the headline. */
export type SocialArtSupportSize = "small" | "large";
export type SocialTitleTreatment = "gradient" | "solid" | "outline" | "highlight" | "shadow";
export type SocialTitleStyleId =
  | "metallic"
  | "bold"
  | "condensed"
  | "editorial"
  | "marker"
  | "outline"
  | "pop"
  | "elegant";

/** Inspiration image attached to a publication (media library asset). */
export interface SocialReference {
  assetId: string;
  url: string;
}

/** inspire = new posts in the references' style; copy = close variations of the references. */
export type SocialReferenceMode = "inspire" | "copy";

/** AI read of one reference image, in upload order. */
export interface SocialReferenceItem {
  /** What the picture shows, for recreating it (no text). */
  scene: string;
  /** Text written on the reference, verbatim. */
  lead: string;
  headline: string;
  body: string;
  layout: SocialArtLayout;
  position: SocialArtTextPosition;
  align: SocialArtTextAlign;
  overlay: SocialArtOverlay;
  supportSize: SocialArtSupportSize;
}

/** AI read of the reference images. */
export interface SocialReferenceAnalysis {
  styleNotes: string;
  contentNotes: string;
  palette: SocialArtColors | null;
  titleStyle: SocialTitleStyleId | null;
  items: SocialReferenceItem[];
  /** Language of the text written on the references; null when there is none. */
  language: ProjectScriptLanguage | null;
  /** Chosen by the user when creating the publication. */
  mode: SocialReferenceMode;
}

/** Per-slide art options, stored as JSON in `social_slides.art`. */
export interface SocialSlideArt {
  /** Unset = automatic: "photo" when the slide has an image, otherwise "text". */
  layout?: SocialArtLayout;
  position: SocialArtTextPosition;
  /** Unset = centered. */
  align?: SocialArtTextAlign;
  /** Unset = automatic: light mist for text on top, dark shade for text at the bottom. */
  overlay?: SocialArtOverlay;
  /** Unset = small. Large draws the small line and supporting text in the headline color. */
  supportSize?: SocialArtSupportSize;
  /** Small line drawn above the headline. */
  lead: string;
  /** Label under the big number (number layout). */
  tag: string;
  focusX: number;
  focusY: number;
  zoom: number;
}

/** Publication-level overlay toggles, stored as JSON in `projects.social_art`. */
export interface SocialArtSettings {
  showHandle: boolean;
  showLogo: boolean;
  /** null = follow the brand kit default. */
  decor: boolean | null;
  showCounter: boolean;
  /** null = the brand kit's title look. */
  titleStyle: SocialTitleStyleId | null;
  /** null = the brand kit's colors. */
  colors: SocialArtColors | null;
}

export interface SocialArtColors {
  /** Text-layout background and text over the light mist. */
  dark: string;
  /** Headline highlight. */
  accent: string;
  /** Mist gradient over photos. */
  light: string;
}

/** Brand look used by the renderer (Project DNA + art kit). */
export interface SocialArtBrand {
  dnaId: string | null;
  name: string;
  logoUrl: string;
  handle: string;
  colors: SocialArtColors;
  accentShine: boolean;
  fontHeading: string;
  fontBody: string;
  uppercaseTitles: boolean;
  titleTreatment: SocialTitleTreatment;
  titleScale: number;
  decorColor: string;
  decorDefault: boolean;
}

/** One slide resolved for drawing. */
export interface SocialArtSlide {
  id: string;
  layout: SocialArtLayout;
  position: SocialArtTextPosition;
  align?: SocialArtTextAlign;
  overlay?: SocialArtOverlay;
  supportSize?: SocialArtSupportSize;
  lead: string;
  title: string;
  body: string;
  tag: string;
  /** Image URL or "" for none. */
  photo: string;
  focusX: number;
  focusY: number;
  zoom: number;
}

export interface SocialArtPost {
  format: SocialArtFormat;
  slides: SocialArtSlide[];
  showHandle: boolean;
  showLogo: boolean;
  decor: boolean;
  showCounter: boolean;
}

export const SOCIAL_ART_FORMATS: Record<SocialArtFormat, { w: number; h: number; label: string }> = {
  feed: { w: 1080, h: 1350, label: "Feed 4:5" },
  square: { w: 1080, h: 1080, label: "Square 1:1" },
  story: { w: 1080, h: 1920, label: "Story 9:16" },
};

export const SOCIAL_ART_LAYOUT_LABELS: Record<SocialArtLayout, string> = {
  photo: "Photo + title",
  text: "Text on color",
  number: "Big number",
};

export const SOCIAL_ART_TEXT_LIMITS = {
  lead: 90,
  tag: 30,
} as const;

export const DEFAULT_SOCIAL_ART_COLORS: SocialArtColors = {
  dark: "#1f2937",
  accent: "#f59e0b",
  light: "#f3f4f6",
};

export const DEFAULT_SOCIAL_SLIDE_ART: SocialSlideArt = {
  position: "bottom",
  lead: "",
  tag: "",
  focusX: 50,
  focusY: 50,
  zoom: 100,
};

export const DEFAULT_SOCIAL_ART_SETTINGS: SocialArtSettings = {
  showHandle: true,
  showLogo: true,
  decor: null,
  showCounter: true,
  titleStyle: null,
  colors: null,
};

export const SOCIAL_TITLE_STYLES: Record<
  SocialTitleStyleId,
  {
    label: string;
    font: string;
    uppercase: boolean;
    treatment: SocialTitleTreatment;
    /** Multiplies the headline's largest size (narrow fonts need more). */
    scale?: number;
  }
> = {
  metallic: { label: "Metallic", font: "Montserrat", uppercase: true, treatment: "gradient" },
  bold: { label: "Bold", font: "Poppins", uppercase: true, treatment: "solid" },
  condensed: { label: "Condensed", font: "Bebas Neue", uppercase: true, treatment: "solid", scale: 1.45 },
  editorial: { label: "Editorial serif", font: "Playfair Display", uppercase: false, treatment: "solid" },
  marker: { label: "Marker", font: "Montserrat", uppercase: true, treatment: "highlight" },
  outline: { label: "Outline", font: "Oswald", uppercase: true, treatment: "outline" },
  pop: { label: "Pop shadow", font: "Poppins", uppercase: true, treatment: "shadow" },
  elegant: { label: "Elegant", font: "Lora", uppercase: false, treatment: "gradient" },
};

export const SOCIAL_TITLE_STYLE_IDS = Object.keys(SOCIAL_TITLE_STYLES) as SocialTitleStyleId[];

export const SOCIAL_REFERENCE_LIMIT = 6;
