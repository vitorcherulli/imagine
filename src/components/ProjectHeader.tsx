"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, UserSquare, ImageIcon, Cog, Dna } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectApiToolbar } from "@/components/ProjectApiToolbar";
import { OpenRouterUsageBadge } from "@/components/OpenRouterUsageBadge";
import { apiModelsSummary } from "@/components/ProjectApiSettings";
import { StyleBibleDialog } from "@/components/StyleBibleDialog";
import {
  AvatarCastPicker,
  AvatarCastPreview,
  type AvatarCastValue,
} from "@/components/AvatarCastPicker";
import { projectApiModelsFromProject, type ProjectApiModels } from "@/lib/project-api-models";
import { getVideoFormatSpec } from "@/lib/video-format";
import type { Avatar, Project } from "@/lib/db/schema";
import type { StyleBible, StyleBibleBlockImages } from "@/lib/style-bible";
import { ExportHistoryDialog } from "@/components/ExportHistoryDialog";
import { formatOpenRouterUsd } from "@/lib/openrouter/usage";
import type { ProjectExportItem } from "@/lib/export-history";
import type { ExportResolutionId } from "@/lib/export-resolutions";
import type { ExportQualityId } from "@/lib/export-quality";
import type { ExportProgressUiState } from "@/components/ExportProgressPanel";

interface Props {
  project: Project;
  onExport: (resolution: ExportResolutionId, quality: ExportQualityId) => Promise<void>;
  onExportPremiere?: () => Promise<void>;
  canExport: boolean;
  canExportPremiere?: boolean;
  exportPremiereBlockerReason?: string | null;
  exportingPremiere?: boolean;
  exportBlockerReason?: string | null;
  exportVisualNote?: string | null;
  exporting: boolean;
  exportProgress?: ExportProgressUiState | null;
  projectExports: ProjectExportItem[];
  onRefreshExports: () => Promise<void>;
  exportsRefreshing?: boolean;
  avatars: Avatar[];
  avatarCast: AvatarCastValue;
  onAvatarCastChange: (value: AvatarCastValue) => void | Promise<void>;
  onApiModelsChange?: (models: ProjectApiModels) => void | Promise<void>;
  onStyleBibleUpdated?: (next: {
    styleBible: StyleBible | null;
    blockImages?: StyleBibleBlockImages;
    anchorImageUrl?: string | null;
  }) => void;
  onOpenSettings?: () => void;
  onEnrichDna?: () => void;
  canEnrichDna?: boolean;
  /** Sum of recorded OpenRouter video costs on timeline blocks. */
  projectOpenRouterCostUsd?: number;
}

export function ProjectHeader({
  project,
  onExport,
  onExportPremiere,
  canExport,
  canExportPremiere = false,
  exportPremiereBlockerReason,
  exportingPremiere = false,
  exportBlockerReason,
  exportVisualNote,
  exporting,
  exportProgress = null,
  projectExports,
  onRefreshExports,
  exportsRefreshing,
  avatars,
  avatarCast,
  onAvatarCastChange,
  onApiModelsChange,
  onStyleBibleUpdated,
  onOpenSettings,
  onEnrichDna,
  canEnrichDna = false,
  projectOpenRouterCostUsd = 0,
}: Props) {
  const [castOpen, setCastOpen] = React.useState(false);
  const [draftCast, setDraftCast] = React.useState<AvatarCastValue>(avatarCast);
  const [savingCast, setSavingCast] = React.useState(false);
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(() =>
    projectApiModelsFromProject(project),
  );

  React.useEffect(() => {
    setApiModels(projectApiModelsFromProject(project));
  }, [project]);

  React.useEffect(() => {
    if (!castOpen) setDraftCast(avatarCast);
  }, [avatarCast, castOpen]);

  async function saveCast() {
    setSavingCast(true);
    try {
      await onAvatarCastChange(draftCast);
      setCastOpen(false);
    } finally {
      setSavingCast(false);
    }
  }

  async function saveApiModels(next: ProjectApiModels) {
    if (!onApiModelsChange) return;
    setApiModels(next);
    await onApiModelsChange(next);
  }

  const formatSpec = getVideoFormatSpec(project.videoFormat);

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-background px-4">
      <Link
        href="/"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{project.title}</h1>
        <p className="truncate text-2xs text-muted-foreground">
          {getVideoFormatSpec(project.videoFormat).shortLabel} · {project.genre} · {project.visualStyle} ·{" "}
          {project.voiceTone} · {project.targetDurationSeconds}s ·{" "}
          {apiModelsSummary(projectApiModelsFromProject(project))}
        </p>
      </div>

      <Badge
        variant={
          project.status === "exported"
            ? "success"
            : project.status === "draft"
              ? "outline"
              : "accent"
        }
      >
        {project.status}
      </Badge>

      <StyleBibleDialog
        projectId={project.id}
        videoFormat={project.videoFormat}
        initialBible={project.styleBible ?? null}
        initialAnchorUrl={project.anchorImageUrl ?? null}
        onUpdated={onStyleBibleUpdated}
      />

      {canEnrichDna && onEnrichDna ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onEnrichDna}
          title="Update series DNA from this episode"
        >
          <Dna className="h-3.5 w-3.5" />
          Enrich DNA
        </Button>
      ) : null}

      <OpenRouterUsageBadge />

      {projectOpenRouterCostUsd > 0 ? (
        <span
          className="hidden shrink-0 text-[10px] tabular-nums text-muted-foreground sm:inline"
          title="Soma dos clips de vídeo gerados via OpenRouter neste projeto"
        >
          projeto {formatOpenRouterUsd(projectOpenRouterCostUsd)}
        </span>
      ) : null}

      <ProjectApiToolbar value={apiModels} onSave={saveApiModels} />

      {onOpenSettings && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          title="Format, captions, cut pace and brief"
        >
          <Cog className="h-3.5 w-3.5" />
          Settings
        </Button>
      )}

      <Dialog open={castOpen} onOpenChange={setCastOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 pl-1.5">
            <AvatarCastPreview
              avatars={avatars}
              selectedIds={avatarCast.selectedIds}
              primaryId={avatarCast.primaryId}
            />
            <span className="max-w-[72px] truncate text-xs">
              {avatarCast.selectedIds.length === 0
                ? "Cast"
                : avatarCast.selectedIds.length === 1
                  ? avatars.find((a) => a.id === avatarCast.primaryId)?.name ?? "Cast"
                  : `${avatarCast.selectedIds.length} characters`}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Project cast</DialogTitle>
            <DialogDescription>
              Select who appears in this video. The star marks the main character.
            </DialogDescription>
          </DialogHeader>
          <AvatarCastPicker avatars={avatars} value={draftCast} onChange={setDraftCast} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setCastOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveCast} disabled={savingCast}>
              {savingCast && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {avatars.length === 0 && (
        <Link href="/avatars">
          <Button variant="outline" size="sm">
            <UserSquare className="h-3.5 w-3.5" />
            Add avatar
          </Button>
        </Link>
      )}

      <ExportHistoryDialog
        exports={projectExports}
        onRefresh={onRefreshExports}
        refreshing={exportsRefreshing}
        canExport={canExport}
        canExportPremiere={canExportPremiere}
        exportBlockerReason={exportBlockerReason}
        exportPremiereBlockerReason={exportPremiereBlockerReason}
        exportVisualNote={exportVisualNote}
        exporting={exporting}
        exportingPremiere={exportingPremiere}
        exportProgress={exportProgress}
        onExport={onExport}
        onExportPremiere={onExportPremiere}
      />

      <Link href={`/projects/${project.id}/youtube`}>
        <Button variant="outline" size="sm" title={`Cover & metadata — ${formatSpec.platformHint}`}>
          <ImageIcon className="h-3.5 w-3.5" />
          {formatSpec.id === "vertical" ? "Reels cover" : "Thumbnail"}
        </Button>
      </Link>
    </header>
  );
}
