"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconChipPicker } from "@/components/IconChipPicker";
import { PROJECT_GENRES, PROJECT_VISUAL_STYLES } from "@/lib/project-creative-options";
import type { DnaStyleDefaults } from "@/lib/dna-style";

const TONES = [
  "Dramatic",
  "Calm",
  "Energetic",
  "Suspenseful",
  "Warm",
  "Mysterious",
  "Documentary",
  "Playful",
  "Seductive",
];

export interface DnaStyleFormValue {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  colorPalette: string;
  visualMood: string;
}

export const EMPTY_DNA_STYLE_FORM: DnaStyleFormValue = {
  genre: "",
  visualStyle: "",
  voiceTone: "",
  colorPalette: "",
  visualMood: "",
};

export function dnaStyleFormFromRecord(
  dna: {
    genre?: string | null;
    visualStyle?: string | null;
    voiceTone?: string | null;
    colorPalette?: string | null;
    visualMood?: string | null;
  },
): DnaStyleFormValue {
  return {
    genre: dna.genre?.trim() ?? "",
    visualStyle: dna.visualStyle?.trim() ?? "",
    voiceTone: dna.voiceTone?.trim() ?? "",
    colorPalette: dna.colorPalette?.trim() ?? "",
    visualMood: dna.visualMood?.trim() ?? "",
  };
}

export function DnaStyleFieldsForm({
  value,
  onChange,
  compact,
}: {
  value: DnaStyleFormValue;
  onChange: (next: DnaStyleFormValue) => void;
  compact?: boolean;
}) {
  function patch(partial: Partial<DnaStyleFormValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-2xs text-muted-foreground">
        Saved visual identity — auto-fills new videos and publications when you pick this DNA.
      </p>
      <div>
        <Label>Genre</Label>
        <div className="mt-1">
          <IconChipPicker
            options={PROJECT_GENRES}
            value={value.genre}
            onChange={(genre) => patch({ genre })}
            ariaLabel="DNA genre"
          />
        </div>
      </div>
      <div>
        <Label>Visual style</Label>
        <div className="mt-1">
          <IconChipPicker
            options={PROJECT_VISUAL_STYLES}
            value={value.visualStyle}
            onChange={(visualStyle) => patch({ visualStyle })}
            ariaLabel="DNA visual style"
          />
        </div>
      </div>
      <div>
        <Label>Voice tone</Label>
        <Select
          value={value.voiceTone || undefined}
          onValueChange={(voiceTone) => patch({ voiceTone })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick tone" />
          </SelectTrigger>
          <SelectContent>
            {TONES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="dna-colors">Color palette</Label>
        <Textarea
          id="dna-colors"
          value={value.colorPalette}
          onChange={(e) => patch({ colorPalette: e.target.value })}
          placeholder="e.g. sky blue, sunny yellow, coral orange, mint green"
          rows={2}
        />
      </div>
      <div>
        <Label htmlFor="dna-mood">Visual mood (optional)</Label>
        <Textarea
          id="dna-mood"
          value={value.visualMood}
          onChange={(e) => patch({ visualMood: e.target.value })}
          placeholder="e.g. glossy toy-like 3D, soft studio light, kid-friendly energy"
          rows={2}
        />
      </div>
    </div>
  );
}
