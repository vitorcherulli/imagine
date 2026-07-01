"use client";

import * as React from "react";
import Link from "next/link";
import {
  Copy,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { Project, SocialMetadata, SocialSlide } from "@/lib/db/schema";
import { DnaClientGalleryPickerDialog } from "@/components/DnaClientGalleryPickerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { getSocialAspectRatioSpec } from "@/lib/social-aspect-ratio";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  initialSlides: SocialSlide[];
  initialMetadata: SocialMetadata | null;
  dnaName?: string | null;
}

function parseJsonStrings(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function formatCaption(metadata: SocialMetadata | null): string {
  if (!metadata?.caption?.trim()) return "";
  const tags = parseJsonStrings(metadata.hashtags);
  const tagLine =
    tags.length > 0 ? `\n\n${tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}` : "";
  return `${metadata.caption.trim()}${tagLine}`;
}

export function SocialPublicationEditor({
  project: initialProject,
  initialSlides,
  initialMetadata,
  dnaName,
}: Props) {
  const { toast } = useToast();
  const [project, setProject] = React.useState(initialProject);
  const [slides, setSlides] = React.useState(initialSlides);
  const [metadata, setMetadata] = React.useState(initialMetadata);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSlides[0]?.id ?? null,
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({
    headline: "",
    bodyText: "",
    visualPrompt: "",
  });

  const aspect = getSocialAspectRatioSpec(project.socialAspectRatio);
  const selected = slides.find((s) => s.id === selectedId) ?? slides[0] ?? null;

  React.useEffect(() => {
    if (!selected) return;
    setDraft({
      headline: selected.headline,
      bodyText: selected.bodyText,
      visualPrompt: selected.visualPrompt,
    });
  }, [selected?.id, selected?.headline, selected?.bodyText, selected?.visualPrompt]);

  const isGenerating = slides.some((s) => s.status === "generating");
  const readyCount = slides.filter((s) => s.imageUrl).length;

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/publications/${project.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setProject(data.project);
    setSlides(data.slides ?? []);
    setMetadata(data.metadata ?? null);
  }, [project.id]);

  React.useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [isGenerating, refresh]);

  async function generateSlides() {
    setBusy("slides");
    try {
      const res = await fetch(`/api/publications/${project.id}/slides/generate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setSlides(data.slides ?? []);
      if (data.slides?.[0]?.id) setSelectedId(data.slides[0].id);
      toast({ title: "Slide structure ready" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate slides",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function generateAllImages() {
    setBusy("images");
    try {
      const res = await fetch(`/api/publications/${project.id}/slides/images`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSlides((prev) => prev.map((s) => ({ ...s, status: "generating" })));
      toast({ title: "Generating images…" });
      void refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Image generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function generateCaption() {
    setBusy("caption");
    try {
      const res = await fetch(`/api/publications/${project.id}/caption`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setMetadata(data.metadata ?? null);
      toast({ title: "Caption ready" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Caption failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveSlide() {
    if (!selected) return;
    setBusy(`save-${selected.id}`);
    try {
      const res = await fetch(`/api/social-slides/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSlides((prev) =>
        prev.map((s) =>
          s.id === selected.id
            ? { ...s, ...draft, updatedAt: new Date() }
            : s,
        ),
      );
      toast({ title: "Slide saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function regenerateSlideImage() {
    if (!selected) return;
    setBusy(`img-${selected.id}`);
    try {
      const res = await fetch(`/api/social-slides/${selected.id}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSlides((prev) =>
        prev.map((s) =>
          s.id === selected.id ? { ...s, status: "generating", errorMessage: null } : s,
        ),
      );
      toast({ title: "Regenerating image…" });
      void refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Regenerate failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    const text = formatCaption(metadata);
    if (!text) {
      toast({ variant: "destructive", title: "No caption yet" });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast({ title: "Caption copied" });
  }

  async function applyGalleryAsset(assetId: string, mode: "use" | "reference") {
    if (!selected) return;
    setBusy(`gallery-${selected.id}`);
    try {
      const res = await fetch(`/api/social-slides/${selected.id}/from-gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (mode === "use" && data.imageUrl) {
        setSlides((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? {
                  ...s,
                  imageUrl: data.imageUrl,
                  referenceAssetId: assetId,
                  status: "ready",
                  errorMessage: null,
                }
              : s,
          ),
        );
        toast({ title: "Client photo applied to slide" });
      } else {
        setSlides((prev) =>
          prev.map((s) =>
            s.id === selected.id ? { ...s, referenceAssetId: assetId } : s,
          ),
        );
        toast({ title: "Reference saved — regenerate image to blend with AI" });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Gallery pick failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  function downloadZip() {
    window.location.href = `/api/publications/${project.id}/export`;
  }

  const captionText = formatCaption(metadata);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground">
            {project.postFormat === "single" ? "Single post" : "Carousel"} · {aspect.shortLabel} ·{" "}
            {project.postKind}
          </p>
          <h1 className="text-base font-semibold">{project.title}</h1>
          <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
            {project.storyDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void generateSlides()}
          >
            {busy === "slides" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {slides.length ? "Regenerate structure" : "Generate slides"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || slides.length === 0}
            onClick={() => void generateAllImages()}
          >
            {busy === "images" || isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            Generate images ({readyCount}/{slides.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || slides.length === 0}
            onClick={() => void generateCaption()}
          >
            {busy === "caption" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Caption
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={readyCount === 0}
            onClick={downloadZip}
          >
            <Download className="h-3.5 w-3.5" />
            Download ZIP
          </Button>
        </div>
      </header>

      {slides.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
          <Sparkles className="h-6 w-6 text-accent" />
          <p className="text-sm font-medium">No slides yet</p>
          <p className="max-w-sm text-2xs text-muted-foreground">
            Generate the slide structure from your brief — then create images and a caption.
          </p>
          <Button variant="primary" size="md" onClick={() => void generateSlides()}>
            Generate slides
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {slides.map((slide) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setSelectedId(slide.id)}
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-md border bg-muted transition-colors",
                  aspect.previewAspectClass,
                  "w-[72px]",
                  selectedId === slide.id
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent/40",
                )}
              >
                {slide.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-[9px] text-muted-foreground">
                    {slide.status === "generating" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="font-mono">{slide.position + 1}</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
            <div
              className={cn(
                "relative mx-auto w-full max-w-[280px] overflow-hidden rounded-lg border border-border bg-black",
                aspect.previewAspectClass,
              )}
            >
              {selected?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-2xs text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-40" />
                  {selected?.status === "generating" ? "Generating…" : "No image yet"}
                </div>
              )}
              {(draft.headline || draft.bodyText) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-4 pt-12 text-left text-white">
                  {draft.headline ? (
                    <p className="text-sm font-semibold leading-tight">{draft.headline}</p>
                  ) : null}
                  {draft.bodyText ? (
                    <p className="mt-1 text-2xs leading-snug opacity-90">{draft.bodyText}</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-panel p-4">
              {selected ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-medium uppercase text-muted-foreground">
                      Slide {selected.position + 1} · {selected.slideRole}
                    </span>
                    <span className="text-2xs text-muted-foreground">{selected.status}</span>
                  </div>
                  <div>
                    <Label htmlFor="slide-headline">Headline</Label>
                    <Input
                      id="slide-headline"
                      value={draft.headline}
                      onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="slide-body">Body text</Label>
                    <Textarea
                      id="slide-body"
                      value={draft.bodyText}
                      onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="slide-prompt">Visual prompt</Label>
                    <Textarea
                      id="slide-prompt"
                      value={draft.visualPrompt}
                      onChange={(e) => setDraft((d) => ({ ...d, visualPrompt: e.target.value }))}
                      rows={4}
                    />
                  </div>
                  {selected.errorMessage ? (
                    <p className="text-2xs text-destructive">{selected.errorMessage}</p>
                  ) : null}
                  {selected.referenceAssetId ? (
                    <p className="text-2xs text-accent/90">
                      Client photo linked as {selected.imageUrl ? "base" : "AI reference"}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null || !project.projectDnaId}
                      onClick={() => setGalleryOpen(true)}
                      title={
                        project.projectDnaId
                          ? "Pick a real client photo"
                          : "This publication has no DNA linked"
                      }
                    >
                      <Images className="h-3.5 w-3.5" />
                      Client gallery
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void saveSlide()}
                    >
                      Save slide
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void regenerateSlideImage()}
                    >
                      Regenerate image
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      <section className="rounded-lg border border-border bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Caption for Instagram</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={!captionText}
            onClick={() => void copyCaption()}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
        {metadata?.hookLine ? (
          <p className="mb-2 text-xs font-medium">{metadata.hookLine}</p>
        ) : null}
        {captionText ? (
          <pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-2xs leading-relaxed text-foreground">
            {captionText}
          </pre>
        ) : (
          <p className="text-2xs text-muted-foreground">
            Generate a caption after your slides are ready — then copy or download with the ZIP.
          </p>
        )}
      </section>

      <DnaClientGalleryPickerDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        projectDnaId={project.projectDnaId}
        dnaName={dnaName ?? undefined}
        busy={busy !== null}
        onSelect={applyGalleryAsset}
      />

      <p className="text-2xs text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          Back to projects
        </Link>
        {" · "}
        Reels and Shorts still use{" "}
        <Link href="/projects/new" className="underline hover:text-foreground">
          video projects
        </Link>
        .
      </p>
    </div>
  );
}
