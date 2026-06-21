import type { LucideIcon } from "lucide-react";
import {
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
  { id: "Watercolor", label: "Watercolor", icon: Droplets },
  { id: "3D Render", label: "3D Render", icon: Box },
  { id: "Noir", label: "Noir", icon: Moon },
  { id: "Pixel Art", label: "Pixel Art", icon: Grid3x3 },
  { id: "Storybook", label: "Storybook", icon: BookOpen },
];

export const PROJECT_GENRE_IDS = PROJECT_GENRES.map((g) => g.id);
export const PROJECT_VISUAL_STYLE_IDS = PROJECT_VISUAL_STYLES.map((s) => s.id);
