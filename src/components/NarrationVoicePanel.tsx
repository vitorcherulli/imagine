"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  NARRATION_SPEED_OPTIONS,
  narrationSpeedIdForValue,
  ttsSpeedForId,
  type NarrationSpeedId,
} from "@/lib/narration-speed";
import type {
  ElevenLabsVoiceSettings,
  KokoroExpressiveness,
  KokoroVoiceSettings,
} from "@/lib/elevenlabs-voice-settings";
import { DEFAULT_ELEVENLABS_VOICE_SETTINGS } from "@/lib/elevenlabs-voice-settings";
import {
  TTS_MODEL_OPTIONS,
  getDefaultTtsVoiceForModel,
  isElevenLabsTtsModel,
  isGeminiTtsModel,
  isGrokTtsModel,
  isKokoroTtsModel,
  voiceOptionsForTtsModel,
} from "@/lib/project-api-models";
import { FavoriteVoiceSelect } from "@/components/FavoriteVoiceSelect";

const VOICE_TONES = [
  "Documentary",
  "Dramatic",
  "Calm",
  "Energetic",
  "Warm",
  "Suspenseful",
  "Mysterious",
  "Playful",
] as const;

interface Props {
  ttsModel: string;
  ttsVoice: string;
  voiceTone: string;
  ttsSpeed: number;
  elevenLabsSettings?: ElevenLabsVoiceSettings;
  kokoroSettings?: KokoroVoiceSettings;
  onTtsModelChange: (model: string) => void;
  onTtsVoiceChange: (voice: string) => void;
  onVoiceToneChange: (tone: string) => void;
  onTtsSpeedChange: (speed: number) => void;
  onElevenLabsSettingsChange?: (patch: Partial<ElevenLabsVoiceSettings>) => void;
  onKokoroSettingsChange?: (patch: Partial<KokoroVoiceSettings>) => void;
  className?: string;
}

export function NarrationVoicePanel({
  ttsModel,
  ttsVoice,
  voiceTone,
  ttsSpeed,
  elevenLabsSettings,
  kokoroSettings,
  onTtsModelChange,
  onTtsVoiceChange,
  onVoiceToneChange,
  onTtsSpeedChange,
  onElevenLabsSettingsChange,
  onKokoroSettingsChange,
  className,
}: Props) {
  const voiceOptions = voiceOptionsForTtsModel(ttsModel);
  const speedId = narrationSpeedIdForValue(ttsSpeed);
  const isElevenLabs = isElevenLabsTtsModel(ttsModel);
  const isKokoro = isKokoroTtsModel(ttsModel);

  function handleModelChange(model: string) {
    const nextVoices = voiceOptionsForTtsModel(model);
    const keepVoice = nextVoices.some((v) => v.value === ttsVoice);
    onTtsModelChange(model);
    if (!keepVoice) {
      onTtsVoiceChange(getDefaultTtsVoiceForModel(model));
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-1 gap-2">
        <div>
          <Label className="mb-1 block text-2xs text-muted-foreground">Voice API</Label>
          <Select value={ttsModel} onValueChange={handleModelChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FavoriteVoiceSelect
          ttsModel={ttsModel}
          value={ttsVoice}
          onValueChange={onTtsVoiceChange}
          options={voiceOptions}
          triggerClassName="h-8 text-xs"
          showFavoriteChips
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block text-2xs text-muted-foreground">Tone</Label>
            <Select value={voiceTone} onValueChange={onVoiceToneChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                {VOICE_TONES.map((tone) => (
                  <SelectItem key={tone} value={tone} className="text-xs">
                    {tone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-2xs text-muted-foreground">Speed</Label>
            <div className="flex h-8 overflow-hidden rounded-md border border-border bg-muted/20 p-0.5">
              {NARRATION_SPEED_OPTIONS.map((opt) => {
                const selected = speedId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={`${opt.label} (${opt.speed}×)`}
                    onClick={() => onTtsSpeedChange(ttsSpeedForId(opt.id))}
                    className={cn(
                      "flex-1 rounded-sm px-0.5 text-[10px] font-medium leading-none transition-colors",
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.id === "faster" ? "V.Fast" : opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isElevenLabs && elevenLabsSettings && onElevenLabsSettingsChange && (
        <ElevenLabsTuningCollapsible
          settings={elevenLabsSettings}
          onChange={onElevenLabsSettingsChange}
        />
      )}

      {isKokoro && kokoroSettings && onKokoroSettingsChange && (
        <KokoroEmotionCollapsible
          expressiveness={kokoroSettings.expressiveness}
          onChange={(expressiveness) => onKokoroSettingsChange({ expressiveness })}
        />
      )}

      {!isElevenLabs && !isKokoro && (
        <p className="text-[10px] leading-snug text-muted-foreground">{providerHint(ttsModel)}</p>
      )}
    </div>
  );
}

const KOKORO_EXPRESSIVENESS: Array<{ id: KokoroExpressiveness; label: string }> = [
  { id: "subtle", label: "Subtle" },
  { id: "natural", label: "Natural" },
  { id: "expressive", label: "Expressive" },
];

function KokoroEmotionCollapsible({
  expressiveness,
  onChange,
}: {
  expressiveness: KokoroExpressiveness;
  onChange: (value: KokoroExpressiveness) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const label =
    KOKORO_EXPRESSIVENESS.find((o) => o.id === expressiveness)?.label ?? "Expressive";

  return (
    <div className="overflow-hidden rounded border border-border/50 bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/30"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="text-[10px] font-medium text-foreground">Emotion</span>
        {!open && (
          <span className="ml-auto truncate text-[9px] text-muted-foreground">{label}</span>
        )}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/40 px-2 pb-1.5 pt-1">
          <div className="flex h-7 overflow-hidden rounded-md border border-border bg-muted/20 p-0.5">
            {KOKORO_EXPRESSIVENESS.map((opt) => {
              const selected = expressiveness === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange(opt.id)}
                  className={cn(
                    "flex-1 rounded-sm px-0.5 text-[9px] font-medium leading-none transition-colors",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[9px] leading-snug text-muted-foreground">
            Kokoro only supports voice + speed — no native emotion. &quot;Expressive&quot; strengthens
            pauses from <strong className="font-medium text-foreground">Analyze delivery</strong>.
            For dramatic emotion, try{" "}
            <strong className="font-medium text-foreground">ElevenLabs</strong> or{" "}
            <strong className="font-medium text-foreground">Grok Voice</strong>.
          </p>
        </div>
      )}
    </div>
  );
}

function ElevenLabsTuningCollapsible({
  settings,
  onChange,
}: {
  settings: ElevenLabsVoiceSettings;
  onChange: (patch: Partial<ElevenLabsVoiceSettings>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isDefault =
    settings.stability === DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability &&
    settings.similarityBoost === DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarityBoost &&
    settings.style === DEFAULT_ELEVENLABS_VOICE_SETTINGS.style &&
    settings.speakerBoost === DEFAULT_ELEVENLABS_VOICE_SETTINGS.speakerBoost;

  return (
    <div className="overflow-hidden rounded border border-border/50 bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/30"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="text-[10px] font-medium text-foreground">Voice tuning</span>
        {!open && (
          <span className="ml-auto truncate text-[9px] text-muted-foreground">
            {isDefault
              ? "Optimized for narration"
              : `${pct(settings.stability)} · ${pct(settings.similarityBoost)} · ${pct(settings.style)}`}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-1 border-t border-border/40 px-2 pb-1.5 pt-1">
          <div className="grid grid-cols-1 gap-1">
            <VoiceSlider
              label="Stability"
              hint="Lower = expressive · higher = steady"
              value={settings.stability}
              onChange={(v) => onChange({ stability: v })}
            />
            <VoiceSlider
              label="Similarity"
              hint="Match to reference voice"
              value={settings.similarityBoost}
              onChange={(v) => onChange({ similarityBoost: v })}
            />
            <VoiceSlider
              label="Style"
              hint="Style exaggeration"
              value={settings.style}
              onChange={(v) => onChange({ style: v })}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-border accent-accent"
              checked={settings.speakerBoost}
              onChange={(e) => onChange({ speakerBoost: e.target.checked })}
            />
            <span className="text-[9px] text-muted-foreground">Speaker boost</span>
          </label>
          {!isDefault && (
            <button
              type="button"
              className="text-[9px] text-accent hover:underline"
              onClick={() => onChange({ ...DEFAULT_ELEVENLABS_VOICE_SETTINGS })}
            >
              Reset to optimized
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function VoiceSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-14 shrink-0 text-[9px] text-muted-foreground" title={hint}>
        {label}
      </Label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-accent"
        title={hint}
      />
      <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

function providerHint(model: string): string {
  if (isElevenLabsTtsModel(model)) {
    return "ElevenLabs — multilingual voices. Tuning + speed apply to preview, paragraph takes and timeline.";
  }
  if (isKokoroTtsModel(model)) {
    return "Kokoro — reliable narration. Use Emotion + Analyze delivery for emphasis.";
  }
  if (isGeminiTtsModel(model)) {
    return "Gemini may block some scripts; Kokoro is more reliable for long narration.";
  }
  if (isGrokTtsModel(model)) {
    return "Grok — natural prosody, speech tags like [pause] and [laugh].";
  }
  return "Kokoro — reliable for story blocks. Speed affects all new narration.";
}

export function narrationVoiceSummary(
  ttsModel: string,
  ttsVoice: string,
  ttsSpeed: number,
  voiceLabel: string,
): string {
  const model = TTS_MODEL_OPTIONS.find((m) => m.value === ttsModel)?.label ?? "TTS";
  const speed =
    NARRATION_SPEED_OPTIONS.find((o) => o.id === narrationSpeedIdForValue(ttsSpeed))?.label ??
    "Normal";
  const shortVoice = voiceLabel.split(" — ")[0]?.split(" (")[0] ?? voiceLabel;
  return `${shortVoice} · ${speed} · ${model.split(" ")[0]}`;
}

export type { NarrationSpeedId };
