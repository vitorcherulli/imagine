export interface SocialArtFontOption {
  family: string;
  weights: number[];
}

export const SOCIAL_ART_FONT_OPTIONS: SocialArtFontOption[] = [
  { family: "Montserrat", weights: [500, 600, 700, 800] },
  { family: "Poppins", weights: [500, 600, 700, 800] },
  { family: "Inter", weights: [500, 600, 700, 800] },
  { family: "Raleway", weights: [500, 600, 700, 800] },
  { family: "Oswald", weights: [500, 600, 700] },
  { family: "Playfair Display", weights: [500, 600, 700, 800] },
  { family: "Lora", weights: [500, 600, 700] },
  { family: "Bebas Neue", weights: [400] },
];

export const SOCIAL_ART_FONT_FAMILIES = SOCIAL_ART_FONT_OPTIONS.map((f) => f.family);

export const SOCIAL_ART_GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  SOCIAL_ART_FONT_OPTIONS.map(
    (f) =>
      `family=${f.family.replace(/ /g, "+")}` +
      (f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(";")}` : ""),
  ).join("&") +
  "&display=swap";

const LINK_ID = "social-art-fonts";
const loaded = new Map<string, Promise<void>>();

/** Adds the Google Fonts stylesheet once; canvas text needs the faces in the document. */
export function injectSocialArtFonts(): void {
  if (typeof document === "undefined" || document.getElementById(LINK_ID)) return;
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = SOCIAL_ART_GOOGLE_FONTS_URL;
  document.head.appendChild(link);
}

/** Resolves when the family is ready to draw on canvas. */
export function ensureSocialArtFont(family: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  injectSocialArtFonts();
  let p = loaded.get(family);
  if (!p) {
    const weights = SOCIAL_ART_FONT_OPTIONS.find((f) => f.family === family)?.weights ?? [400, 700];
    p = Promise.all(weights.map((w) => document.fonts.load(`${w} 40px "${family}"`)))
      .then(() => undefined)
      .catch(() => undefined);
    loaded.set(family, p);
  }
  return p;
}
