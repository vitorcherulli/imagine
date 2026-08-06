"use client";

import * as React from "react";
import { Mic, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  isElevenLabsTtsModel,
  type ProjectApiModels,
} from "@/lib/project-api-models";
import { ProjectApiCategoryFields } from "@/components/ProjectApiSettings";

interface Props {
  models: ProjectApiModels;
  useVoiceClone: boolean;
  clonedVoiceId?: string | null;
  onApiChange: (patch: Partial<ProjectApiModels>) => void;
  onChangeCloneVoice: (v: boolean) => void;
}

export function DubbingApiSettings({
  models,
  useVoiceClone,
  clonedVoiceId,
  onApiChange,
  onChangeCloneVoice,
}: Props) {
  const voiceCloneSupported = isElevenLabsTtsModel(models.ttsModel);

  function handleApiChange(patch: Partial<ProjectApiModels>) {
    if (patch.ttsModel && !isElevenLabsTtsModel(patch.ttsModel) && useVoiceClone) {
      onChangeCloneVoice(false);
    }
    onApiChange(patch);
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-border bg-panel p-3">
        <Label className="mb-2 flex items-center gap-1 text-xs">
          <Sparkles className="h-3 w-3" /> Translation API
        </Label>
        <ProjectApiCategoryFields
          category="story"
          value={models}
          onChange={handleApiChange}
          variant="inline"
          showFavoriteChips={false}
        />
      </div>

      <div className="rounded border border-border bg-panel p-3">
        <Label className="mb-2 flex items-center gap-1 text-xs">
          <Mic className="h-3 w-3" /> Voice API
        </Label>
        <ProjectApiCategoryFields
          category="voice"
          value={models}
          onChange={handleApiChange}
          variant="inline"
          showFavoriteChips
        />

        <label className="mt-3 flex items-start gap-1.5 text-2xs">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5"
            checked={!!useVoiceClone}
            disabled={!voiceCloneSupported}
            onChange={(e) => onChangeCloneVoice(e.target.checked)}
          />
          <span>
            <b className="block">Clone source voice</b>
            <span className="block text-muted-foreground">
              {voiceCloneSupported
                ? "ElevenLabs IVC from your uploaded audio."
                : "Only available with an ElevenLabs voice model."}
            </span>
          </span>
        </label>
        {clonedVoiceId ? (
          <div className="mt-1 text-2xs text-muted-foreground">
            Cloned voice: <code>{clonedVoiceId.slice(0, 12)}…</code>
          </div>
        ) : null}
      </div>
    </div>
  );
}
