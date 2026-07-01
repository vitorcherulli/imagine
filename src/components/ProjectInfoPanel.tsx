"use client";

import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  CUT_PACE_OPTIONS,
  NARRATION_MODE_LABEL,
  normalizeCutPace,
} from "@/lib/cut-pace";
import { getVideoFormatSpec } from "@/lib/video-format";
import {
  normalizeProjectScriptLanguage,
  projectScriptLanguageLabel,
} from "@/lib/project-language";

interface Props {
  project: Project;
  blocks: StoryBlock[];
  totalDuration: number;
}

export function ProjectInfoPanel({ project, blocks, totalDuration }: Props) {
  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const cutPaceLabel =
    CUT_PACE_OPTIONS.find((o) => o.id === normalizeCutPace(project.cutPace))?.label ?? "—";
  const narrationLabel = NARRATION_MODE_LABEL;
  const languageLabel = projectScriptLanguageLabel(
    normalizeProjectScriptLanguage(project.scriptLanguage),
  );

  return (
    <div className="flex min-h-0 flex-col text-xs">
      <h3 className="text-sm font-semibold">Info</h3>

      <dl className="mt-3 space-y-1.5 text-2xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Format</dt>
          <dd className="truncate font-medium">{formatSpec.shortLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Cut pace</dt>
          <dd className="truncate font-medium">{cutPaceLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Language</dt>
          <dd className="truncate font-medium">{languageLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Narration</dt>
          <dd className="truncate font-medium">{narrationLabel}</dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-0.5 border-t border-border pt-3 text-2xs text-muted-foreground">
        <li>
          {blocks.length} blocks · {totalDuration}s total
        </li>
        <li>
          {blocks.filter((b) => b.keyframeUrl).length} keyframes,{" "}
          {blocks.filter((b) => b.videoUrl).length} videos,{" "}
          {blocks.filter((b) => b.audioUrl).length} audios
        </li>
      </ul>

      <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
        Change format, language, cut pace and more in <strong className="font-medium">Settings</strong> in the
        top toolbar.
      </p>
    </div>
  );
}
