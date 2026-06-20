"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Youtube, Loader2, ArrowLeft, UserSquare, Settings2 } from "lucide-react";
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
import { projectApiModelsFromProject, type ProjectApiModels } from "@/lib/project-api-models";
import type { Avatar, Project } from "@/lib/db/schema";

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
  finalVideoUrl?: string | null;
  avatars: Avatar[];
  avatar: Avatar | null;
  onAvatarChange: (id: string | null) => void | Promise<void>;
  onApiModelsChange?: (models: ProjectApiModels) => void | Promise<void>;
}

export function ProjectHeader({
  project,
  onExport,
  canExport,
  exportBlockerReason,
  exporting,
  finalVideoUrl,
  avatars,
  avatar,
  onAvatarChange,
  onApiModelsChange,
}: Props) {
  const [apiOpen, setApiOpen] = React.useState(false);
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(() =>
    projectApiModelsFromProject(project),
  );
  const [savingApi, setSavingApi] = React.useState(false);
  const [exportResolution, setExportResolution] = React.useState<ExportResolutionId>("1080p");

  React.useEffect(() => {
    setApiModels(projectApiModelsFromProject(project));
  }, [project]);

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
          {project.genre} · {project.visualStyle} · {project.voiceTone} ·{" "}
          {project.targetDurationSeconds}s · {apiModelsSummary(projectApiModelsFromProject(project))}
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
        initialBible={project.styleBible ?? null}
        initialAnchorUrl={project.anchorImageUrl ?? null}
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

      <div className="flex items-center gap-1.5">
        {avatar?.primaryImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={avatar.primaryImageUrl}
            alt={avatar.name}
            className="h-7 w-7 rounded-full border border-border object-cover"
            title={avatar.name}
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
            <UserSquare className="h-3.5 w-3.5" />
          </span>
        )}
        {avatars.length === 0 ? (
          <Link href="/avatars">
            <Button variant="outline" size="sm">
              <UserSquare className="h-3.5 w-3.5" />
              Add avatar
            </Button>
          </Link>
        ) : (
          <Select
            value={avatar?.id ?? "none"}
            onValueChange={(v) => onAvatarChange(v === "none" ? null : v)}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Default character" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default character</SelectItem>
              {avatars.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {finalVideoUrl && (
        <Button variant="outline" size="sm" asChild>
          <a
            href={finalVideoUrl}
            download={`${project.title.replace(/[^\w\s-]/g, "").trim() || "export"}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </Button>
      )}

      <Link href={`/projects/${project.id}/youtube`}>
        <Button variant="outline" size="sm">
          <Youtube className="h-3.5 w-3.5" />
          YouTube
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
              : exportBlockerReason ?? "Generate audio + video for every block first"
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
