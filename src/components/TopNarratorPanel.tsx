"use client";

import * as React from "react";
import { ChevronDown, Loader2, Mic, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NARRATOR_PREVIEW_TARGET_SECONDS } from "@/lib/script-studio";
import type { ElevenLabsVoiceSettings, KokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";
import { voiceLabelForModel, narratorHeaderLabel } from "@/lib/project-api-models";
import { NarrationVoicePanel } from "@/components/NarrationVoicePanel";

interface Props {
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
  embedded?: boolean;
}

export function TopNarratorPanel({
  ttsModel,
  ttsVoice,
  voiceTone,
  ttsSpeed,
  elevenLabsSettings,
  kokoroSettings,
  hasSavedNarrator,
  rationale,
  deliveryNotes,
  previewing,
  previewUrl,
  previewAudioRef,
  onTtsModelChange,
  onTtsVoiceChange,
  onVoiceToneChange,
  onTtsSpeedChange,
  onElevenLabsSettingsChange,
  onKokoroSettingsChange,
  onPreview,
  embedded = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  function isClickInsidePanel(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (rootRef.current?.contains(target)) return true;
    if (!(target instanceof Element)) return false;
    // Radix Select menus render in a document portal — keep the voice panel open.
    return Boolean(
      target.closest("[data-radix-select-content]") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest('[role="listbox"]'),
    );
  }

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!isClickInsidePanel(e.target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const openSelect = document.querySelector('[data-radix-select-content][data-state="open"]');
      if (openSelect) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const voiceLabel = voiceLabelForModel(ttsModel, ttsVoice);
  const headerLabel = narratorHeaderLabel(ttsModel, ttsVoice);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-6 max-w-[11rem] items-center gap-1 rounded-md px-2 text-2xs font-medium transition-colors",
          embedded
            ? open
              ? "bg-background text-accent shadow-sm"
              : "text-foreground hover:bg-background/80"
            : open
              ? "border-accent/40 bg-accent/10 text-accent border"
              : "border-border bg-background text-foreground hover:bg-muted/40 border",
        )}
        aria-expanded={open}
        title={`Voice: ${voiceLabel}`}
      >
        <Mic className="h-3 w-3 shrink-0" />
        <span className="truncate">{headerLabel}</span>
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto p-3">
            <NarrationVoicePanel
              ttsModel={ttsModel}
              ttsVoice={ttsVoice}
              voiceTone={voiceTone}
              ttsSpeed={ttsSpeed}
              elevenLabsSettings={elevenLabsSettings}
              kokoroSettings={kokoroSettings}
              onTtsModelChange={onTtsModelChange}
              onTtsVoiceChange={onTtsVoiceChange}
              onVoiceToneChange={onVoiceToneChange}
              onTtsSpeedChange={onTtsSpeedChange}
              onElevenLabsSettingsChange={onElevenLabsSettingsChange}
              onKokoroSettingsChange={onKokoroSettingsChange}
            />

            {(rationale || deliveryNotes) && (
              <div className="space-y-1 rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
                {rationale && (
                  <p className="text-[10px] leading-snug text-muted-foreground">{rationale}</p>
                )}
                {deliveryNotes && (
                  <p className="text-[10px] italic leading-snug text-muted-foreground">
                    Delivery: {deliveryNotes}
                  </p>
                )}
              </div>
            )}

            {!hasSavedNarrator && (
              <p className="text-[10px] text-muted-foreground">
                Settings sync to the project — timeline and MP3 use the same voice.
              </p>
            )}

            <div className="space-y-2 border-t border-border/60 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onPreview}
                disabled={previewing}
              >
                {previewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Preview voice (~{NARRATOR_PREVIEW_TARGET_SECONDS}s)
              </Button>
              {(previewUrl || previewing) && (
                <audio
                  ref={previewAudioRef}
                  src={previewUrl ?? undefined}
                  controls
                  className="h-8 w-full"
                  preload="none"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
