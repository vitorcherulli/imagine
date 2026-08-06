"use client";

import * as React from "react";
import { ChevronDown, Captions, Clapperboard, FileText, Languages, Monitor, MonitorSmartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CaptionSettings } from "@/components/CaptionSettings";
import { CutPacePicker } from "@/components/CutPacePicker";
import { PreviewModePicker } from "@/components/PreviewModePicker";
import { ProjectBriefFields } from "@/components/ProjectBriefFields";
import { ProjectScriptLanguagePicker } from "@/components/ProjectScriptLanguagePicker";
import { VideoFormatPicker } from "@/components/VideoFormatPicker";
import {
  CUT_PACE_OPTIONS,
  normalizeCutPace,
  type CutPaceId,
} from "@/lib/cut-pace";
import { CAPTION_MODE_OPTIONS, normalizeCaptionMode, type CaptionMode } from "@/lib/captions";
import {
  getVideoFormatSpec,
  normalizeVideoFormat,
  type VideoFormat,
} from "@/lib/video-format";
import type { Project, ProjectDna, Scenario } from "@/lib/db/schema";
import { projectDnaSummary } from "@/lib/project-dna";
import {
  normalizeProjectScriptLanguage,
  projectScriptLanguageLabel,
  type ProjectScriptLanguage,
} from "@/lib/project-language";
import {
  normalizeProjectPreviewMode,
  previewModeLabel,
  resolvePreviewSettings,
  type ProjectPreviewMode,
} from "@/lib/preview-settings";
import { usePlatformPreviewDefaults } from "@/hooks/use-platform-preview-defaults";
import { cn } from "@/lib/utils";

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  summary?: string;
  resetEpoch: number;
  className?: string;
  children: React.ReactNode;
}

function Section({ icon, title, summary, resetEpoch, className, children }: SectionProps) {
  const [collapsed, setCollapsed] = React.useState(true);

  React.useEffect(() => {
    setCollapsed(true);
  }, [resetEpoch]);

  function toggle() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-background", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium leading-snug">{title}</span>
          {summary && collapsed && (
            <span className="mt-0.5 block truncate text-2xs leading-snug text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs">{children}</div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  projectDnaItems: ProjectDna[];
  scenarioItems?: Scenario[];
  onVideoFormatChange: (format: VideoFormat) => void | Promise<void>;
  onCaptionModeChange: (mode: CaptionMode) => void | Promise<void>;
  onCutSettingsChange: (patch: { cutPace?: CutPaceId }) => void | Promise<void>;
  onScriptLanguageChange: (language: ProjectScriptLanguage) => void | Promise<void>;
  onPreviewModeChange: (mode: ProjectPreviewMode) => void | Promise<void>;
  onCleanupProjectPreviews: () => Promise<number>;
  onBriefChange: (patch: {
    projectDnaId?: string | null;
    scenarioId?: string | null;
    storyDescription?: string;
  }) => void;
  onBriefSave: (patch: {
    projectDnaId?: string | null;
    scenarioId?: string | null;
    storyDescription?: string;
  }) => Promise<void>;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  projectDnaItems,
  scenarioItems = [],
  onVideoFormatChange,
  onCaptionModeChange,
  onCutSettingsChange,
  onScriptLanguageChange,
  onPreviewModeChange,
  onCleanupProjectPreviews,
  onBriefChange,
  onBriefSave,
}: Props) {
  const [resetEpoch, setResetEpoch] = React.useState(0);
  const [cleaningPreviews, setCleaningPreviews] = React.useState(false);
  const platformPreview = usePlatformPreviewDefaults();

  React.useEffect(() => {
    if (open) setResetEpoch((n) => n + 1);
  }, [open]);

  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const cutPace = normalizeCutPace(project.cutPace);
  const captionMode = normalizeCaptionMode(project.captionMode);

  const cutPaceLabel = CUT_PACE_OPTIONS.find((o) => o.id === cutPace)?.label ?? cutPace;
  const captionLabel =
    CAPTION_MODE_OPTIONS.find((o) => o.id === captionMode)?.label ?? captionMode;
  const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
  const scriptLanguageSummary = projectScriptLanguageLabel(scriptLanguage);
  const projectPreviewMode = normalizeProjectPreviewMode(project.previewMode);
  const effectivePreview = resolvePreviewSettings(project.previewMode, platformPreview);
  const previewSummary =
    projectPreviewMode === "auto"
      ? `Default · ${previewModeLabel(effectivePreview.mode)}`
      : previewModeLabel(projectPreviewMode);

  const selectedDna = projectDnaItems.find((d) => d.id === project.projectDnaId) ?? null;
  const briefSummary =
    (selectedDna ? projectDnaSummary(selectedDna) : null) ||
    project.storyDescription.trim().slice(0, 80) ||
    "No brief yet";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            Format, preview, language, captions, cut pace and brief — all in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(88vh-6rem)] grid-cols-1 items-start gap-2 overflow-y-auto pt-1 pr-1 scrollbar-thin sm:grid-cols-2">
          <Section
            resetEpoch={resetEpoch}
            icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
            title="Video format"
            summary={formatSpec.shortLabel}
          >
            <VideoFormatPicker
              value={normalizeVideoFormat(project.videoFormat)}
              onChange={onVideoFormatChange}
            />
            <p className="text-2xs text-muted-foreground">
              Preview and timeline use {formatSpec.shortLabel}. Regenerate media after changing format.
            </p>
          </Section>

          <Section
            resetEpoch={resetEpoch}
            icon={<Monitor className="h-3.5 w-3.5" />}
            title="Timeline preview"
            summary={previewSummary}
          >
            <PreviewModePicker
              includeAuto
              value={projectPreviewMode}
              onChange={(value) => void onPreviewModeChange(value)}
            />
            <p className="text-2xs text-muted-foreground">
              Controls in-app preview only. Export always uses full-quality clips.
              {projectPreviewMode === "auto"
                ? ` Platform default: ${previewModeLabel(effectivePreview.mode)}.`
                : null}
            </p>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-2xs text-muted-foreground">
                Preview proxies (video_preview.mp4) are safe to delete — export uses the
                original video.mp4 files only.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={cleaningPreviews}
                onClick={() => {
                  setCleaningPreviews(true);
                  void onCleanupProjectPreviews()
                    .catch(() => 0)
                    .finally(() => setCleaningPreviews(false));
                }}
              >
                {cleaningPreviews ? "Deleting preview files…" : "Delete preview files"}
              </Button>
            </div>
          </Section>

          <Section
            resetEpoch={resetEpoch}
            icon={<Languages className="h-3.5 w-3.5" />}
            title="Script language"
            summary={scriptLanguageSummary}
          >
            <ProjectScriptLanguagePicker
              value={scriptLanguage}
              onChange={(value) => void onScriptLanguageChange(value)}
            />
            <p className="text-2xs text-muted-foreground">
              Base language for AI script generation and narration. Translations to other languages
              will come later.
            </p>
          </Section>

          <Section
            resetEpoch={resetEpoch}
            icon={<Captions className="h-3.5 w-3.5" />}
            title="On-screen captions"
            summary={captionLabel}
          >
            <CaptionSettings value={captionMode} onChange={onCaptionModeChange} />
          </Section>

          <Section
            resetEpoch={resetEpoch}
            icon={<Clapperboard className="h-3.5 w-3.5" />}
            title="Cut pace"
            summary={cutPaceLabel}
          >
            <CutPacePicker
              value={cutPace}
              onChange={(value) => void onCutSettingsChange({ cutPace: value })}
            />
            <p className="text-2xs text-muted-foreground">
              Narration is always continuous — one voice segment with multiple visual cuts.
              Regenerate the story to apply a new pace on the timeline.
            </p>
          </Section>

          <Section
            resetEpoch={resetEpoch}
            icon={<FileText className="h-3.5 w-3.5" />}
            title="DNA & synopsis"
            summary={briefSummary}
            className="sm:col-span-2"
          >
            <ProjectBriefFields
              projectDnaId={project.projectDnaId ?? null}
              projectDnaItems={projectDnaItems}
              scenarioId={project.scenarioId ?? null}
              scenarioItems={scenarioItems}
              storyDescription={project.storyDescription}
              onChange={onBriefChange}
              onSave={onBriefSave}
            />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
