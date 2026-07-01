"use client";

import * as React from "react";
import {
  AudioLines,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ProjectApiCategoryFields,
  type ApiSettingsCategory,
} from "@/components/ProjectApiSettings";
import { OpenRouterUsageBadge } from "@/components/OpenRouterUsageBadge";
import {
  IMAGE_MODEL_OPTIONS,
  LLM_MODEL_OPTIONS,
  TTS_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  voiceLabelForModel,
  type ProjectApiModels,
} from "@/lib/project-api-models";

const CATEGORIES: Array<{
  id: ApiSettingsCategory;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: (models: ProjectApiModels) => string;
}> = [
  {
    id: "story",
    title: "Story & text",
    description: "LLM for script, outlines and story generation.",
    icon: FileText,
    summary: (m) => LLM_MODEL_OPTIONS.find((o) => o.value === m.llmModel)?.label ?? m.llmModel,
  },
  {
    id: "image",
    title: "Images",
    description: "Model for keyframes and reference stills.",
    icon: ImageIcon,
    summary: (m) =>
      IMAGE_MODEL_OPTIONS.find((o) => o.value === m.imageModel)?.label ?? m.imageModel,
  },
  {
    id: "video",
    title: "Video",
    description: "Model for block video clips on the timeline.",
    icon: Clapperboard,
    summary: (m) =>
      VIDEO_MODEL_OPTIONS.find((o) => o.value === m.videoModel)?.label ?? m.videoModel,
  },
  {
    id: "voice",
    title: "Voice",
    description: "TTS API and narrator voice for this project.",
    icon: AudioLines,
    summary: (m) => {
      const tts = TTS_MODEL_OPTIONS.find((o) => o.value === m.ttsModel)?.label ?? m.ttsModel;
      const voice = voiceLabelForModel(m.ttsModel, m.ttsVoice);
      return `${tts} · ${voice}`;
    },
  },
];

interface Props {
  value: ProjectApiModels;
  onSave: (models: ProjectApiModels) => void | Promise<void>;
}

export function ProjectApiToolbar({ value, onSave }: Props) {
  const [openCategory, setOpenCategory] = React.useState<ApiSettingsCategory | null>(null);
  const [draft, setDraft] = React.useState<ProjectApiModels>(value);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!openCategory) setDraft(value);
  }, [value, openCategory]);

  function open(category: ApiSettingsCategory) {
    setDraft(value);
    setOpenCategory(category);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setOpenCategory(null);
    } finally {
      setSaving(false);
    }
  }

  const active = CATEGORIES.find((c) => c.id === openCategory);
  const ActiveIcon = active?.icon;

  return (
    <>
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <Button
              key={category.id}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 shrink-0"
              title={`${category.title}: ${category.summary(value)}`}
              onClick={() => open(category.id)}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          );
        })}
      </div>

      <Dialog open={openCategory != null} onOpenChange={(next) => !next && setOpenCategory(null)}>
        <DialogContent className="max-w-sm">
          {active && ActiveIcon ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ActiveIcon className="h-4 w-4 text-muted-foreground" />
                  {active.title}
                </DialogTitle>
                <DialogDescription>{active.description}</DialogDescription>
              </DialogHeader>
              <ProjectApiCategoryFields
                category={active.id}
                value={draft}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
              />
              <OpenRouterUsageBadge variant="inline" className="pt-0.5" />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setOpenCategory(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
