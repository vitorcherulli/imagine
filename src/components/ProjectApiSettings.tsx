"use client";

import * as React from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMAGE_MODEL_OPTIONS,
  LLM_MODEL_OPTIONS,
  TTS_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  getDefaultTtsVoiceForModel,
  isGeminiTtsModel,
  isGrokTtsModel,
  isElevenLabsTtsModel,
  videoLabelForModel,
  videoOpenRouterBillingForModel,
  voiceLabelForModel,
  voiceOptionsForTtsModel,
  type ProjectApiModels,
} from "@/lib/project-api-models";
import { FavoriteVoiceSelect } from "@/components/FavoriteVoiceSelect";

const API_SETTINGS_COLLAPSED_KEY = "imagine-api-settings-collapsed";

function readApiSettingsCollapsed(defaultCollapsed: boolean): boolean {
  try {
    if (typeof window === "undefined") return defaultCollapsed;
    const stored = localStorage.getItem(API_SETTINGS_COLLAPSED_KEY);
    if (stored === null) return defaultCollapsed;
    return stored === "1";
  } catch {
    return defaultCollapsed;
  }
}

function writeApiSettingsCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(API_SETTINGS_COLLAPSED_KEY, "1");
    else localStorage.removeItem(API_SETTINGS_COLLAPSED_KEY);
  } catch {
    // ignore
  }
}

interface Props {
  value: ProjectApiModels;
  onChange: (patch: Partial<ProjectApiModels>) => void;
  /** Inline section on the create form */
  variant?: "inline" | "dialog";
}

export function ProjectApiSettings({ value, onChange, variant = "inline" }: Props) {
  const voiceOptions = voiceOptionsForTtsModel(value.ttsModel);
  const videoBillingName = videoOpenRouterBillingForModel(value.videoModel);
  const isInline = variant === "inline";
  const defaultCollapsed = isInline;
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    if (!isInline) return;
    setCollapsed(readApiSettingsCollapsed(defaultCollapsed));
  }, [isInline, defaultCollapsed]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (isInline) writeApiSettingsCollapsed(next);
      return next;
    });
  }

  const selectClass = variant === "inline" ? "h-8 text-xs" : "h-9 text-xs";
  const summary = apiModelsSummary(value);

  const fields = (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Story">
        <Select value={value.llmModel} onValueChange={(v) => onChange({ llmModel: v })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LLM_MODEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Image">
        <Select value={value.imageModel} onValueChange={(v) => onChange({ imageModel: v })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_MODEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Video">
        <Select value={value.videoModel} onValueChange={(v) => onChange({ videoModel: v })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_MODEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!collapsed && (
          <p className="mt-1 text-2xs text-muted-foreground">
            Clip length follows narration (4–15s), then ffmpeg fits to block duration.
            {videoBillingName && (
              <>
                {" "}
                OpenRouter usage shows <span className="font-medium">{videoBillingName}</span>{" "}
                (slug <span className="font-mono">{value.videoModel}</span>) — that is{" "}
                <span className="font-medium">Kling</span>, not Google Veo 3.1 (
                <span className="font-mono">google/veo-3.1</span>).
              </>
            )}
          </p>
        )}
      </Field>
      <Field label="Voice API">
        <Select
          value={value.ttsModel}
          onValueChange={(v) => {
            const nextVoiceOptions = voiceOptionsForTtsModel(v);
            const keepVoice = nextVoiceOptions.some((o) => o.value === value.ttsVoice);
            onChange({
              ttsModel: v,
              ttsVoice: keepVoice ? value.ttsVoice : getDefaultTtsVoiceForModel(v),
            });
          }}
        >
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTS_MODEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Voice" className="col-span-2">
        <FavoriteVoiceSelect
          ttsModel={value.ttsModel}
          value={value.ttsVoice}
          onValueChange={(v) => onChange({ ttsVoice: v })}
          options={voiceOptions}
          triggerClassName={selectClass}
          showFavoriteChips={!collapsed}
        />
        {!collapsed && isGeminiTtsModel(value.ttsModel) && (
          <p className="mt-1 text-2xs text-amber-600/90 dark:text-amber-400/90">
            Gemini may block some scripts (Google safety filter). If generation fails, the app
            auto-switches to Kokoro — or select Kokoro directly for fewer errors.
          </p>
        )}
        {!collapsed && isGrokTtsModel(value.ttsModel) && (
          <p className="mt-1 text-2xs text-muted-foreground">
            Natural prosody, 20+ languages, speech tags like [pause] and [laugh]. ~$15/M chars on
            OpenRouter.
          </p>
        )}
        {!collapsed && isElevenLabsTtsModel(value.ttsModel) && (
          <p className="mt-1 text-2xs text-muted-foreground">
            Premium voices via your ElevenLabs account. Set{" "}
            <span className="font-mono">ELEVENLABS_API_KEY</span> in .env.local. Supports Portuguese
            (multilingual v2).
          </p>
        )}
        {!collapsed &&
          !isGeminiTtsModel(value.ttsModel) &&
          !isGrokTtsModel(value.ttsModel) &&
          !isElevenLabsTtsModel(value.ttsModel) && (
          <p className="mt-1 text-2xs text-muted-foreground">
            Reliable narration for story blocks. Voice follows tone when set to Auto.
          </p>
        )}
      </Field>
    </div>
  );

  if (!isInline) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">API models</span>
          <span className="text-2xs text-muted-foreground">per project</span>
        </div>
        {fields}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={!collapsed}
      >
        <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">API models</span>
        <span className="text-2xs text-muted-foreground">per project</span>
        {collapsed && (
          <span className="ml-1 min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {summary}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && <div className="border-t border-border px-3 pb-3 pt-2">{fields}</div>}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-2xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function apiModelsSummary(models: ProjectApiModels): string {
  const llm = LLM_MODEL_OPTIONS.find((o) => o.value === models.llmModel)?.label ?? "Custom LLM";
  const video = videoLabelForModel(models.videoModel);
  const tts = TTS_MODEL_OPTIONS.find((o) => o.value === models.ttsModel)?.label ?? "Custom TTS";
  if (
    isGeminiTtsModel(models.ttsModel) ||
    isGrokTtsModel(models.ttsModel) ||
    isElevenLabsTtsModel(models.ttsModel)
  ) {
    const voice = voiceLabelForModel(models.ttsModel, models.ttsVoice);
    return `${llm} · ${video} · ${tts} · ${voice}`;
  }
  return `${llm} · ${video} · ${tts}`;
}
