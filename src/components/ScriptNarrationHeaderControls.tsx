"use client";

import * as React from "react";
import { AudioLines, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopNarratorPanel } from "@/components/TopNarratorPanel";
import type { ElevenLabsVoiceSettings, KokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";

interface Props {
  readyCount: number;
  totalParagraphs: number;
  generating: boolean;
  generateDisabled: boolean;
  onGenerate: () => void;
  ttsModel: string;
  ttsVoice: string;
  voiceTone: string;
  ttsSpeed: number;
  elevenLabsSettings: ElevenLabsVoiceSettings;
  kokoroSettings: KokoroVoiceSettings;
  hasSavedNarrator: boolean;
  rationale?: string;
  deliveryNotes?: string;
  previewing: boolean;
  previewUrl: string | null;
  previewAudioRef: React.RefObject<HTMLAudioElement>;
  onTtsModelChange: (model: string) => void;
  onTtsVoiceChange: (voice: string) => void;
  onVoiceToneChange: (tone: string) => void;
  onTtsSpeedChange: (speed: number) => void;
  onElevenLabsSettingsChange: (patch: Partial<ElevenLabsVoiceSettings>) => void;
  onKokoroSettingsChange: (patch: Partial<KokoroVoiceSettings>) => void;
  onPreview: () => void;
}

export function ScriptNarrationHeaderControls({
  readyCount,
  totalParagraphs,
  generating,
  generateDisabled,
  onGenerate,
  ...voiceProps
}: Props) {
  const generateLabel =
    totalParagraphs === 0
      ? "Generate"
      : readyCount >= totalParagraphs
        ? `Audio · ${readyCount}/${totalParagraphs}`
        : readyCount > 0
          ? `Generate · ${readyCount}/${totalParagraphs}`
          : "Generate all";

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/20 p-0.5">
      <TopNarratorPanel embedded {...voiceProps} />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-6 gap-1 px-2 text-2xs font-medium"
        onClick={onGenerate}
        disabled={generateDisabled}
        title={
          readyCount >= totalParagraphs && totalParagraphs > 0
            ? "All paragraphs narrated — click to re-generate missing after edits"
            : "Generate paragraph narration for the script"
        }
      >
        {generating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <AudioLines className="h-3 w-3" />
        )}
        {generateLabel}
      </Button>
    </div>
  );
}
