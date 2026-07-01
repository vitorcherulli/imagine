"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Dna,
  Film,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { Project, ProjectDna } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  DnaStyleFieldsForm,
  dnaStyleFormFromRecord,
  type DnaStyleFormValue,
} from "@/components/DnaStyleFieldsForm";
import { DnaClientGalleryStrip } from "@/components/DnaClientGalleryStrip";
import { formatDnaStyleSummary } from "@/lib/dna-style";
import { getVideoFormatSpec } from "@/lib/video-format";
import { getSocialAspectRatioSpec } from "@/lib/social-aspect-ratio";
import { isSocialProject, projectEditorHref } from "@/lib/social-content";
import { cn } from "@/lib/utils";

function LinkedProjectCard({
  project,
  coverUrl,
}: {
  project: Project;
  coverUrl: string | null;
}) {
  const social = isSocialProject(project);
  const fmt = social
    ? getSocialAspectRatioSpec(project.socialAspectRatio)
    : getVideoFormatSpec(project.videoFormat);
  const href = projectEditorHref(project);
  const updated = new Date(project.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-lg border border-border bg-background transition-all hover:border-accent/40"
    >
      <div className={cn("relative w-full overflow-hidden bg-muted", fmt.cardAspectClass)}>
        {social ? (
          <span className="absolute left-2 top-2 z-10 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground shadow-sm">
            Post
          </span>
        ) : (
          <span className="absolute left-2 top-2 z-10 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground shadow-sm">
            Video
          </span>
        )}
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-2xs text-muted-foreground">
            <ImageIcon className="h-5 w-5 opacity-40" />
            <span className="font-mono">{fmt.shortLabel}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <h3 className="truncate text-sm font-medium group-hover:text-accent">
          {project.title || "Untitled"}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{project.storyDescription}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/80">
          {project.status} · {updated}
        </p>
      </div>
    </Link>
  );
}

export function ProjectDnaDetail({
  initialDna,
  linkedProjects,
  coverByProjectId,
}: {
  initialDna: ProjectDna;
  linkedProjects: Project[];
  coverByProjectId: Record<string, string | null>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dna, setDna] = React.useState(initialDna);
  const [name, setName] = React.useState(initialDna.name);
  const [description, setDescription] = React.useState(initialDna.description ?? "");
  const [style, setStyle] = React.useState<DnaStyleFormValue>(() => dnaStyleFormFromRecord(initialDna));
  const [learnedNotes, setLearnedNotes] = React.useState(initialDna.learnedNotes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const styleSummary = formatDnaStyleSummary(dna);
  const videoCount = linkedProjects.filter((p) => !isSocialProject(p)).length;
  const publicationCount = linkedProjects.filter((p) => isSocialProject(p)).length;

  async function uploadLogo(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("logo", file);
      const res = await fetch(`/api/project-dna/${dna.id}`, { method: "PATCH", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { projectDna } = (await res.json()) as { projectDna: ProjectDna };
      setDna(projectDna);
      toast({ title: "Logo updated" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    try {
      const res = await fetch(`/api/project-dna/${dna.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLogo: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { projectDna } = (await res.json()) as { projectDna: ProjectDna };
      setDna(projectDna);
      toast({ title: "Logo removed" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveIdentity() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/project-dna/${dna.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          genre: style.genre || null,
          visualStyle: style.visualStyle || null,
          voiceTone: style.voiceTone || null,
          colorPalette: style.colorPalette.trim() || null,
          visualMood: style.visualMood.trim() || null,
          learnedNotes: learnedNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { projectDna } = (await res.json()) as { projectDna: ProjectDna };
      setDna(projectDna);
      toast({ title: "DNA saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeDna() {
    if (!confirm(`Delete "${dna.name}"? Projects using this DNA will have no selection.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/project-dna/${dna.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.push("/dna");
      router.refresh();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/dna"
            className="mt-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Back to DNA library"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Dna className="h-4 w-4 shrink-0 text-accent" />
              <h1 className="truncate text-base font-semibold">{dna.name}</h1>
              {styleSummary ? (
                <Badge variant="outline" className="max-w-[240px] truncate text-[10px]">
                  {styleSummary}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Series identity — reused on every video and publication linked below.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/projects/new?dnaId=${dna.id}`}>
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" />
              New video
            </Button>
          </Link>
          <Link href={`/publications/new?dnaId=${dna.id}`}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              New publication
            </Button>
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={() => void removeDna()} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-panel p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Identity
            </h2>
            <div className="space-y-3">
              <div>
                <Label htmlFor="dna-name">Line / brand name</Label>
                <Input
                  id="dna-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="dna-desc">How it works</Label>
                <Textarea
                  id="dna-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Audience, voice tone, aesthetic, what ties every video in this line together…"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Visual identity
            </h2>
            <DnaStyleFieldsForm value={style} onChange={setStyle} />
          </div>

          <div className="rounded-lg border border-border bg-panel p-4">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Episode memory
            </h2>
            <p className="mb-3 text-[10px] text-muted-foreground">
              Grows after each episode via Enrich DNA — edit or trim here anytime.
            </p>
            <Textarea
              value={learnedNotes}
              onChange={(e) => setLearnedNotes(e.target.value)}
              rows={6}
              placeholder="Notes from past episodes will appear here…"
              className="font-mono text-xs"
            />
          </div>

          <div className="flex justify-end">
            <Button variant="primary" size="md" disabled={saving} onClick={() => void saveIdentity()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-panel p-3">
            <p className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">Logo</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center rounded-md border border-dashed border-border bg-background p-4 hover:border-accent/40 hover:bg-muted/40"
              title="Change logo"
            >
              {dna.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dna.logoUrl}
                  alt={dna.name}
                  className="max-h-24 max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Upload className="h-5 w-5" />
                  <span className="text-2xs">Upload logo</span>
                </div>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadLogo(f);
                e.currentTarget.value = "";
              }}
            />
            {dna.logoUrl ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full text-2xs"
                disabled={busy}
                onClick={() => void removeLogo()}
              >
                Remove logo
              </Button>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-panel">
            <DnaClientGalleryStrip dnaId={dna.id} />
          </div>
        </aside>
      </div>

      <section className="mt-8 border-t border-border pt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <LayoutGrid className="h-4 w-4 text-accent" />
              Linked content
            </h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {linkedProjects.length === 0
                ? "No videos or publications use this DNA yet."
                : `${linkedProjects.length} item${linkedProjects.length === 1 ? "" : "s"} · ${videoCount} video${videoCount === 1 ? "" : "s"} · ${publicationCount} publication${publicationCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {linkedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-12 text-center">
            <Film className="h-6 w-6 text-muted-foreground" />
            <p className="max-w-sm text-2xs text-muted-foreground">
              Create a video or publication and select <strong>{dna.name}</strong> as the Project DNA
              — it will show up here.
            </p>
            <div className="flex gap-2">
              <Link href={`/projects/new?dnaId=${dna.id}`}>
                <Button variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  New video
                </Button>
              </Link>
              <Link href={`/publications/new?dnaId=${dna.id}`}>
                <Button variant="outline" size="sm">
                  New publication
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {linkedProjects.map((project) => (
              <LinkedProjectCard
                key={project.id}
                project={project}
                coverUrl={coverByProjectId[project.id] ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
