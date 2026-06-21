"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Loader2, ArrowLeft, UserSquare, Settings2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectApiSettings, apiModelsSummary } from "@/components/ProjectApiSettings";
import { StyleBibleDialog } from "@/components/StyleBibleDialog";
import {
  AvatarCastPicker,
  AvatarCastPreview,
  type AvatarCastValue,
} from "@/components/AvatarCastPicker";
import { projectApiModelsFromProject, type ProjectApiModels } from "@/lib/project-api-models";
import { getVideoFormatSpec } from "@/lib/video-format";
import type { Avatar, Project } from "@/lib/db/schema";
import type { StyleBible } from "@/lib/style-bible";
import { ExportHistoryDialog } from "@/components/ExportHistoryDialog";
import type { ProjectExportItem } from "@/lib/export-history";

const EXPORT_RESOLUTION_OPTIONS = [
  { id: "720p", label: "HD 720p" },
  { id: "1080p", label: "Full HD 1080p" },
  { id: "1440p", label: "QHD 1440p" },
  { id: "2160p", label: "4K 2160p" },
] as const;

export type ExportResolutionId = (typeof EXPORT_RESOLUTION_OPTIONS)[number]["id"];

interface Props {
  project: Project;
  onExport: (resolution: ExportResolutionId) => Promise<void>;
  canExport: boolean;
  exportBlockerReason?: string | null;
  exporting: boolean;
  projectExports: ProjectExportItem[];
  onRefreshExports: () => Promise<void>;
  exportsRefreshing?: boolean;
  avatars: Avatar[];
  avatarCast: AvatarCastValue;
  onAvatarCastChange: (value: AvatarCastValue) => void | Promise<void>;
  onApiModelsChange?: (models: ProjectApiModels) => void | Promise<void>;
  onStyleBibleUpdated?: (next: {
    styleBible: StyleBible | null;
    anchorImageUrl: string | null;
  }) => void;
}

export function ProjectHeader({
  project,
  onExport,
  canExport,
  exportBlockerReason,
  exporting,
  projectExports,
  onRefreshExports,
  exportsRefreshing,
  avatars,
  avatarCast,
  onAvatarCastChange,
  onApiModelsChange,
  onStyleBibleUpdated,
}: Props) {
  const [apiOpen, setApiOpen] = React.useState(false);
  const [castOpen, setCastOpen] = React.useState(false);
  const [draftCast, setDraftCast] = React.useState<AvatarCastValue>(avatarCast);
  const [savingCast, setSavingCast] = React.useState(false);
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(() =>
    projectApiModelsFromProject(project),
  );
  const [savingApi, setSavingApi] = React.useState(false);
  const [exportResolution, setExportResolution] = React.useState<ExportResolutionId>("1080p");

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

  async function saveApiModels() {
    if (!onApiModelsChange) {
      setApiOpen(false);
      return;
    }
    setSavingApi(true);
    try {
      await onApiModelsChange(apiModels);
      setApiOpen(false);
    } finally {
      setSavingApi(false);
    }
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

      <Dialog open={apiOpen} onOpenChange={setApiOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" title="Project API models">
            <Settings2 className="h-3.5 w-3.5" />
            APIs
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>API models</DialogTitle>
            <DialogDescription>
              Models used for story, images, video and voice in this project.
            </DialogDescription>
          </DialogHeader>
          <ProjectApiSettings
            variant="dialog"
            value={apiModels}
            onChange={(patch) => setApiModels((prev) => ({ ...prev, ...patch }))}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setApiOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveApiModels} disabled={savingApi}>
              {savingApi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
          <AvatarCastPicker
            avatars={avatars}
            value={draftCast}
            onChange={setDraftCast}
            variant="compact"
          />
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
      />

      <Link href={`/projects/${project.id}/youtube`}>
        <Button variant="outline" size="sm" title={`Cover & metadata — ${formatSpec.platformHint}`}>
          <ImageIcon className="h-3.5 w-3.5" />
          {formatSpec.id === "vertical" ? "Reels cover" : "Thumbnail"}
        </Button>
      </Link>

      <div className="flex items-center gap-1">
        <Select
          value={exportResolution}
          onValueChange={(v) => setExportResolution(v as ExportResolutionId)}
        >
          <SelectTrigger className="h-8 w-32 text-xs" title="Export resolution">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPORT_RESOLUTION_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onExport(exportResolution)}
          disabled={!canExport || exporting}
          title={
            canExport
              ? "Export project as MP4"
              : exportBlockerReason ?? "Generate video for every block first"
          }
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </div>
    </header>
  );
}
