"use client";

import * as React from "react";
import { ChevronDown, Captions, Clapperboard, FileText, MonitorSmartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CaptionSettings } from "@/components/CaptionSettings";
import { CutPacePicker, NarrationModePicker } from "@/components/CutPacePicker";
import { ProjectBriefFields } from "@/components/ProjectBriefFields";
import { VideoFormatPicker } from "@/components/VideoFormatPicker";
import {
  CUT_PACE_OPTIONS,
  NARRATION_MODE_OPTIONS,
  normalizeCutPace,
  normalizeNarrationMode,
  type CutPaceId,
  type NarrationModeId,
} from "@/lib/cut-pace";
import { CAPTION_MODE_OPTIONS, normalizeCaptionMode, type CaptionMode } from "@/lib/captions";
import {
  getVideoFormatSpec,
  normalizeVideoFormat,
  type VideoFormat,
} from "@/lib/video-format";
import type { Project, ProjectDna } from "@/lib/db/schema";
import { projectDnaSummary } from "@/lib/project-dna";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "imagine-project-settings:section";

function readCollapsed(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {}
  return fallback;
}

function writeCollapsed(key: string, collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${key}`, collapsed ? "1" : "0");
  } catch {}
}

interface SectionProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary?: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function Section({ id, icon, title, summary, defaultCollapsed = true, children }: SectionProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    setCollapsed(readCollapsed(id, defaultCollapsed));
  }, [id, defaultCollapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(id, next);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-xs font-medium">{title}</span>
        {summary && (
          <span className="max-w-[55%] truncate text-2xs text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
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
  onVideoFormatChange: (format: VideoFormat) => void | Promise<void>;
  onCaptionModeChange: (mode: CaptionMode) => void | Promise<void>;
  onCutSettingsChange: (patch: {
    cutPace?: CutPaceId;
    narrationMode?: NarrationModeId;
  }) => void | Promise<void>;
  onBriefChange: (patch: { projectDnaId?: string | null; storyDescription?: string }) => void;
  onBriefSave: (patch: {
    projectDnaId?: string | null;
    storyDescription?: string;
  }) => Promise<void>;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  projectDnaItems,
  onVideoFormatChange,
  onCaptionModeChange,
  onCutSettingsChange,
  onBriefChange,
  onBriefSave,
}: Props) {
  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const cutPace = normalizeCutPace(project.cutPace);
  const narrationMode = normalizeNarrationMode(project.narrationMode);
  const captionMode = normalizeCaptionMode(project.captionMode);

  const cutPaceLabel = CUT_PACE_OPTIONS.find((o) => o.id === cutPace)?.label ?? cutPace;
  const narrationLabel =
    NARRATION_MODE_OPTIONS.find((o) => o.id === narrationMode)?.label ?? narrationMode;
  const captionLabel =
    CAPTION_MODE_OPTIONS.find((o) => o.id === captionMode)?.label ?? captionMode;

  const selectedDna = projectDnaItems.find((d) => d.id === project.projectDnaId) ?? null;
  const briefSummary =
    (selectedDna ? projectDnaSummary(selectedDna) : null) ||
    project.storyDescription.trim().slice(0, 80) ||
    "No brief yet";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            Format, captions, cut pace and brief — all in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          <Section
            id="format"
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
            id="captions"
            icon={<Captions className="h-3.5 w-3.5" />}
            title="On-screen captions"
            summary={captionLabel}
          >
            <CaptionSettings value={captionMode} onChange={onCaptionModeChange} />
          </Section>

          <Section
            id="pace"
            icon={<Clapperboard className="h-3.5 w-3.5" />}
            title="Cut pace & narration"
            summary={`${cutPaceLabel} · ${narrationLabel}`}
          >
            <div>
              <p className="mb-1.5 text-2xs font-medium text-muted-foreground">Cut pace</p>
              <CutPacePicker
                value={cutPace}
                onChange={(value) => void onCutSettingsChange({ cutPace: value })}
              />
            </div>
            <div>
              <p className="mb-1.5 text-2xs font-medium text-muted-foreground">Narration mode</p>
              <NarrationModePicker
                value={narrationMode}
                onChange={(value) => void onCutSettingsChange({ narrationMode: value })}
              />
            </div>
            <p className="text-2xs text-muted-foreground">
              Regenerate the story to apply a new pace on the timeline.
            </p>
          </Section>

          <Section
            id="brief"
            icon={<FileText className="h-3.5 w-3.5" />}
            title="DNA & synopsis"
            summary={briefSummary}
          >
            <ProjectBriefFields
              projectDnaId={project.projectDnaId ?? null}
              projectDnaItems={projectDnaItems}
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
