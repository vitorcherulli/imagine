"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Project, ProjectFolder } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { getVideoFormatSpec } from "@/lib/video-format";
import { getSocialAspectRatioSpec } from "@/lib/social-aspect-ratio";
import { isSocialProject, projectEditorHref } from "@/lib/social-content";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";

type LibraryView = "recent" | "all" | "unfiled" | `folder:${string}`;

interface Props {
  initialProjects: Project[];
  initialFolders: ProjectFolder[];
  coverByProjectId?: Record<string, string | null>;
}

const RECENT_LIMIT = 8;

export function ProjectsLibrary({
  initialProjects,
  initialFolders,
  coverByProjectId = {},
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = React.useState(initialProjects);
  const [folders, setFolders] = React.useState(initialFolders);
  const [view, setView] = React.useState<LibraryView>("recent");
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [busyProjectId, setBusyProjectId] = React.useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = React.useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = React.useState<string | null>(null);

  const sortedProjects = React.useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [projects],
  );

  const recentProjects = sortedProjects.slice(0, RECENT_LIMIT);

  const visibleProjects = React.useMemo(() => {
    if (view === "recent") return recentProjects;
    if (view === "all") return sortedProjects;
    if (view === "unfiled") return sortedProjects.filter((p) => !p.folderId);
    if (view.startsWith("folder:")) {
      const folderId = view.slice("folder:".length);
      return sortedProjects.filter((p) => p.folderId === folderId);
    }
    return sortedProjects;
  }, [view, sortedProjects, recentProjects]);

  const viewTitle = React.useMemo(() => {
    if (view === "recent") return "Recent";
    if (view === "all") return "All projects";
    if (view === "unfiled") return "Unfiled";
    const folder = folders.find((f) => f.id === view.slice("folder:".length));
    return folder?.name ?? "Folder";
  }, [view, folders]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/project-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setFolders((prev) => [...prev, data.folder]);
      setNewFolderName("");
      setNewFolderOpen(false);
      setView(`folder:${data.folder.id}` as LibraryView);
      toast({ variant: "success", title: `Folder "${name}" created` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not create folder",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCreatingFolder(false);
    }
  }

  async function deleteFolder(folderId: string, folderName: string) {
    if (!confirm(`Delete folder "${folderName}"? Projects inside will move to Unfiled.`)) return;
    try {
      const res = await fetch(`/api/project-folders/${folderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setProjects((prev) =>
        prev.map((p) => (p.folderId === folderId ? { ...p, folderId: null } : p)),
      );
      if (view === `folder:${folderId}`) setView("all");
      toast({ variant: "success", title: "Folder deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not delete folder",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function duplicateProject(projectId: string) {
    setBusyProjectId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      router.push(projectEditorHref({ id: data.id, contentType: projects.find((p) => p.id === projectId)?.contentType ?? "video" }));
      router.refresh();
      toast({ variant: "success", title: "Project duplicated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Duplicate failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusyProjectId(null);
    }
  }

  async function moveProject(projectId: string, folderId: string | null) {
    setBusyProjectId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, folderId, updatedAt: new Date() } : p)),
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not move project",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusyProjectId(null);
    }
  }

  function countInFolder(folderId: string) {
    return projects.filter((p) => p.folderId === folderId).length;
  }

  function handleDragStart(projectId: string) {
    setDraggingProjectId(projectId);
  }

  function handleDragEnd() {
    setDraggingProjectId(null);
    setDragOverTarget(null);
  }

  function handleDragOver(target: string) {
    return (e: React.DragEvent) => {
      if (!draggingProjectId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverTarget !== target) setDragOverTarget(target);
    };
  }

  function handleDragLeave(target: string) {
    return () => {
      if (dragOverTarget === target) setDragOverTarget(null);
    };
  }

  function handleDrop(folderId: string | null) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      const projectId =
        draggingProjectId ?? e.dataTransfer.getData("text/x-imagine-project-id");
      setDraggingProjectId(null);
      setDragOverTarget(null);
      if (!projectId) return;
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      if ((project.folderId ?? null) === folderId) return;
      await moveProject(projectId, folderId);
      const folderName = folderId
        ? folders.find((f) => f.id === folderId)?.name ?? "folder"
        : "Unfiled";
      toast({ variant: "success", title: `Moved to ${folderName}` });
    };
  }

  const navItems: Array<{ id: LibraryView; label: string; icon: React.ReactNode; count?: number }> =
    [
      { id: "recent", label: "Recent", icon: <Clock className="h-3.5 w-3.5" />, count: recentProjects.length },
      { id: "all", label: "All projects", icon: <LayoutGrid className="h-3.5 w-3.5" />, count: projects.length },
      {
        id: "unfiled",
        label: "Unfiled",
        icon: <Folder className="h-3.5 w-3.5" />,
        count: projects.filter((p) => !p.folderId).length,
      },
    ];

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
        <Sparkles className="h-6 w-6 text-accent" />
        <div>
          <h2 className="text-sm font-medium">Start your first story</h2>
          <p className="text-2xs text-muted-foreground">
            Describe an idea, pick a genre and tone — Imagine writes, illustrates and narrates it.
          </p>
        </div>
        <Link href="/projects/new">
          <Button variant="primary" size="md">
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:w-52">
          <nav className="space-y-0.5 rounded-lg border border-border bg-panel p-1.5">
            {navItems.map((item) => {
              const isUnfiled = item.id === "unfiled";
              const dropTarget = isUnfiled ? "unfiled" : null;
              const dragHover = dropTarget && dragOverTarget === dropTarget;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  onDragOver={dropTarget ? handleDragOver(dropTarget) : undefined}
                  onDragLeave={dropTarget ? handleDragLeave(dropTarget) : undefined}
                  onDrop={dropTarget ? handleDrop(null) : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    view === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/80 hover:bg-muted",
                    dragHover && "ring-2 ring-accent ring-offset-1 ring-offset-panel",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                  <span className="font-mono text-[10px] opacity-70">{item.count}</span>
                </button>
              );
            })}

            <div className="my-1.5 border-t border-border" />

            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Folders
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title="New folder"
                onClick={() => setNewFolderOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {folders.length === 0 && (
              <p className="px-2.5 py-1 text-[10px] text-muted-foreground">No folders yet.</p>
            )}

            {folders.map((folder) => {
              const folderView = `folder:${folder.id}` as LibraryView;
              const active = view === folderView;
              const dropTarget = `folder:${folder.id}`;
              const dragHover = dragOverTarget === dropTarget;
              return (
                <div
                  key={folder.id}
                  className={cn(
                    "group flex items-center gap-0.5 rounded-md transition-colors",
                    dragHover && "ring-2 ring-accent ring-offset-1 ring-offset-panel",
                  )}
                  onDragOver={handleDragOver(dropTarget)}
                  onDragLeave={handleDragLeave(dropTarget)}
                  onDrop={handleDrop(folder.id)}
                >
                  <button
                    type="button"
                    onClick={() => setView(folderView)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/80 hover:bg-muted",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] opacity-70">
                      {countInFolder(folder.id)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                    title="Delete folder"
                    onClick={() => void deleteFolder(folder.id, folder.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{viewTitle}</h2>
            <span className="text-2xs text-muted-foreground">
              {visibleProjects.length} project{visibleProjects.length === 1 ? "" : "s"}
            </span>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-panel px-4 py-10 text-center text-2xs text-muted-foreground">
              No projects in this view.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  folders={folders}
                  coverUrl={coverByProjectId[p.id] ?? null}
                  busy={busyProjectId === p.id}
                  dragging={draggingProjectId === p.id}
                  onDuplicate={() => void duplicateProject(p.id)}
                  onMove={(folderId) => void moveProject(p.id, folderId)}
                  onDragStart={() => handleDragStart(p.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Organize projects by series, client or campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Fitness series"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={creatingFolder || !newFolderName.trim()}
              onClick={() => void createFolder()}
            >
              {creatingFolder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProjectCard({
  project,
  folders,
  coverUrl,
  busy,
  dragging,
  onDuplicate,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  folders: ProjectFolder[];
  coverUrl: string | null;
  busy: boolean;
  dragging: boolean;
  onDuplicate: () => void;
  onMove: (folderId: string | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const social = isSocialProject(project);
  const fmt = social
    ? getSocialAspectRatioSpec(project.socialAspectRatio)
    : getVideoFormatSpec(project.videoFormat);
  const folderName = folders.find((f) => f.id === project.folderId)?.name;
  const href = projectEditorHref(project);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-imagine-project-id", project.id);
        e.dataTransfer.setData("text/plain", project.title || "Project");
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title="Arraste para uma pasta na lateral"
      className={cn(
        "group overflow-hidden rounded-lg border border-border bg-background transition-all hover:border-accent/40",
        dragging && "scale-[0.98] opacity-50 ring-2 ring-accent",
      )}
    >
      <Link href={href} className="block">
        <div className={cn("relative w-full overflow-hidden bg-muted", fmt.cardAspectClass)}>
          {social ? (
            <span className="absolute left-2 top-2 z-10 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground shadow-sm">
              Post
            </span>
          ) : null}
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-2xs text-muted-foreground">
              <ImageIcon className="h-5 w-5 opacity-40" />
              <span className="font-mono">{fmt.shortLabel}</span>
              <span className="px-3 text-center">
                {project.genre} · {project.visualStyle}
              </span>
            </div>
          )}
        </div>
        <div className="px-3 py-2">
          <h3 className="truncate text-sm font-medium">{project.title || "Untitled"}</h3>
          <p className="line-clamp-2 text-2xs text-muted-foreground">{project.storyDescription}</p>
          <p className="mt-1 text-2xs text-muted-foreground/80">
            {project.status}
            {social
              ? ` · ${project.postFormat}`
              : ` · ${project.targetDurationSeconds}s`}
            {folderName ? ` · ${folderName}` : ""}
          </p>
        </div>
      </Link>
      <div
        className="flex items-center gap-1 border-t border-border px-2 py-1.5"
        onClick={(e) => e.preventDefault()}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 text-2xs"
          disabled={busy}
          onClick={onDuplicate}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          Duplicate
        </Button>
        <Select
          value={project.folderId ?? "__none__"}
          onValueChange={(v) => onMove(v === "__none__" ? null : v)}
          disabled={busy}
        >
          <SelectTrigger className="h-7 w-[110px] text-2xs">
            <SelectValue placeholder="Folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unfiled</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
