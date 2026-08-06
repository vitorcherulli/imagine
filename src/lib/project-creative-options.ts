import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  Baby,
  BookOpen,
  Box,
  Camera,
  Clapperboard,
  Droplets,
  FileVideo,
  Flame,
  Ghost,
  Grid3x3,
  Heart,
  Laugh,
  Moon,
  Rocket,
  Search,
  Smartphone,
  Smile,
  Sparkles,
  Theater,
  TrendingUp,
  Zap,
} from "lucide-react";

export interface CreativeOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const PROJECT_GENRES: CreativeOption[] = [
  { id: "Drama", label: "Drama", icon: Theater },
  { id: "Thriller", label: "Thriller", icon: Zap },
  { id: "Horror", label: "Horror", icon: Ghost },
  { id: "Sci-Fi", label: "Sci-Fi", icon: Rocket },
  { id: "Fantasy", label: "Fantasy", icon: Sparkles },
  { id: "Motivational", label: "Motivational", icon: TrendingUp },
  { id: "Documentary", label: "Documentary", icon: FileVideo },
  { id: "Children", label: "Children", icon: Baby },
  { id: "Comedy", label: "Comedy", icon: Laugh },
  { id: "Mystery", label: "Mystery", icon: Search },
  { id: "Romance", label: "Romance", icon: Heart },
  { id: "OF / Sexy", label: "OF / Sexy", icon: Flame },
];

export const PROJECT_VISUAL_STYLES: CreativeOption[] = [
  { id: "Cinematic", label: "Cinematic", icon: Clapperboard },
  { id: "Anime", label: "Anime", icon: Sparkles },
  { id: "Cartoon", label: "Cartoon", icon: Smile },
  { id: "Realistic", label: "Realistic", icon: Camera },
  { id: "Ultra Realistic", label: "Ultra Realistic", icon: Aperture },
  { id: "Phone / UGC", label: "Phone / UGC", icon: Smartphone },
  { id: "Watercolor", label: "Watercolor", icon: Droplets },
  { id: "3D Render", label: "3D Render", icon: Box },
  { id: "Noir", label: "Noir", icon: Moon },
  { id: "Pixel Art", label: "Pixel Art", icon: Grid3x3 },
  { id: "Storybook", label: "Storybook", icon: BookOpen },
];

export const PROJECT_GENRE_IDS = PROJECT_GENRES.map((g) => g.id);
export const PROJECT_VISUAL_STYLE_IDS = PROJECT_VISUAL_STYLES.map((s) => s.id);

/**
 * Rich prompt fragments per visual style. The picker only stores a short label,
 * but image/video models need a descriptive cue to reliably hit the look —
 * especially for photorealism. Keyed by the style id.
 */
export const VISUAL_STYLE_PROMPT_DESCRIPTORS: Record<string, string> = {
  Cinematic:
    "cinematic film still, anamorphic lens, filmic color grade, dramatic motivated lighting, subtle film grain, shallow depth of field",
  Anime: "anime illustration, clean cel shading, expressive linework, vibrant palette",
  Cartoon: "stylized cartoon illustration, bold outlines, flat shading, playful proportions",
  Realistic:
    "realistic photography, natural lighting, true-to-life colors and textures, believable materials",
  "Ultra Realistic":
    "hyper-photorealistic photograph, shot on a full-frame camera with a 50mm lens, natural light, lifelike skin and material texture, real-world imperfections, shallow depth of field, high dynamic range, indistinguishable from a real photo — absolutely no illustration, painting or CGI look",
  "Phone / UGC":
    "authentic amateur smartphone photo, casually shot on a modern phone camera, handheld candid framing, natural available light (sometimes flat or slightly harsh with on-phone HDR), everyday family-safe real-life moment, fully clothed subject, fully clothed people in neutral non-sexual context, mild digital sensor noise and slight motion blur, deep phone-lens focus (little to no bokeh), no color grading, looks exactly like real user-generated content posted to social media or a vlog — absolutely NOT cinematic, NOT staged, NOT a professional studio shoot, no film grain, no dramatic lighting, no suggestive posing",
  Watercolor:
    "watercolor painting, soft pigment bleeds, visible paper texture, gentle washes",
  "3D Render":
    "polished 3D render, physically based materials, soft global illumination, subtle ambient occlusion",
  Noir: "high-contrast black-and-white noir, hard chiaroscuro lighting, deep shadows, moody atmosphere",
  "Pixel Art": "retro pixel art, limited palette, crisp dithering, 16-bit aesthetic",
  Storybook:
    "children's storybook illustration, warm hand-drawn textures, soft edges, whimsical charm",
};

/** Expand a visual style label into a descriptive prompt cue (falls back to the label). */
export function visualStylePromptCue(style: string | null | undefined): string {
  const key = (style ?? "").trim();
  if (!key) return "";
  return VISUAL_STYLE_PROMPT_DESCRIPTORS[key] ?? key;
}
