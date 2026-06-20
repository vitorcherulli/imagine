"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
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
  videoLabelForModel,
  videoOpenRouterBillingForModel,
  voiceLabelForModel,
  voiceOptionsForTtsModel,
  type ProjectApiModels,
} from "@/lib/project-api-models";

interface Props {
  value: ProjectApiModels;
  onChange: (patch: Partial<ProjectApiModels>) => void;
  /** Inline section on the create form */
  variant?: "inline" | "dialog";
}

export function ProjectApiSettings({ value, onChange, variant = "inline" }: Props) {
  const voiceOptions = voiceOptionsForTtsModel(value.ttsModel);
  const videoBillingName = videoOpenRouterBillingForModel(value.videoModel);

  const selectClass = variant === "inline" ? "h-8 text-xs" : "h-9 text-xs";

  return (
    <div
      className={
        variant === "inline"
          ? "rounded-md border border-border bg-muted/30 p-3"
          : "space-y-3"
      }
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">API models</span>
        <span className="text-2xs text-muted-foreground">per project</span>
      </div>
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
          <Select value={value.ttsVoice} onValueChange={(v) => onChange({ ttsVoice: v })}>
            <SelectTrigger className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {voiceOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isGeminiTtsModel(value.ttsModel) && (
            <p className="mt-1 text-2xs text-amber-600/90 dark:text-amber-400/90">
              Gemini may block some scripts (Google safety filter). If generation fails, the app
              auto-switches to Kokoro — or select Kokoro directly for fewer errors.
            </p>
          )}
          {!isGeminiTtsModel(value.ttsModel) && (
            <p className="mt-1 text-2xs text-muted-foreground">
              Reliable narration for story blocks. Voice follows tone when set to Auto.
            </p>
          )}
        </Field>
      </div>
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
  if (isGeminiTtsModel(models.ttsModel)) {
    const voice = voiceLabelForModel(models.ttsModel, models.ttsVoice);
    return `${llm} · ${video} · ${tts} · ${voice}`;
  }
  return `${llm} · ${video} · ${tts}`;
}
