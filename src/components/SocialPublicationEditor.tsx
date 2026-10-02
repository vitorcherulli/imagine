"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Dna,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Palette,
  Share2,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { Project, SocialMetadata, SocialSlide } from "@/lib/db/schema";
import { ClientPhotosDialog, type ClientPhotoMode } from "@/components/ClientPhotosDialog";
import { SocialArtCanvas } from "@/components/social-art/SocialArtCanvas";
import {
  RangeRow,
  SegmentedControl,
  SocialArtPanel,
  ToggleRow,
} from "@/components/social-art/SocialArtControls";
import { SocialTitleStylePicker } from "@/components/social-art/SocialTitleStylePicker";
import { autosaveLabel, useSocialArtAutosave } from "@/components/social-art/use-social-art-autosave";
import { Button } from "@/components/ui/button";
import { AddToCreativesButton } from "@/components/creatives/AddToCreatives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { canShareFiles, downloadBlob, socialArtSlideFile, socialArtZip } from "@/lib/social-art/export";
import {
  buildSocialArtPost,
  parseSocialArtSettings,
  parseSocialReferenceAnalysis,
  parseSocialReferences,
  parseSocialSlideArt,
  resolveSocialArtBrand,
  socialArtFormat,
  socialArtSlug,
} from "@/lib/social-art/model";
import type { PublicationArtPatch } from "@/lib/social-art/schemas";
import {
  SOCIAL_ART_FORMATS,
  SOCIAL_ART_LAYOUT_LABELS,
  SOCIAL_ART_TEXT_LIMITS,
  type SocialArtBrand,
  type SocialArtLayout,
  type SocialArtOverlay,
  type SocialArtSettings,
  type SocialArtSupportSize,
  type SocialArtTextAlign,
  type SocialArtTextPosition,
  type SocialSlideArt,
} from "@/lib/social-art/types";
import type { SocialTitleOption } from "@/lib/social-titles-server";
import {
  getSocialAspectRatioSpec,
  SOCIAL_ASPECT_RATIO_IDS,
  type SocialAspectRatio,
} from "@/lib/social-aspect-ratio";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  initialSlides: SocialSlide[];
  initialMetadata: SocialMetadata | null;
  dnaName?: string | null;
  dnaOptions?: Array<{ id: string; name: string }>;
  brand: SocialArtBrand;
}

const NO_DNA = "__none__";

type ArtById = Record<string, SocialSlideArt>;

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

function artFromSlides(slides: SocialSlide[]): ArtById {
  return Object.fromEntries(slides.map((s) => [s.id, parseSocialSlideArt(s.art)]));
}

const FORMAT_OPTIONS = SOCIAL_ASPECT_RATIO_IDS.map((id) => ({
  value: id,
  label: SOCIAL_ART_FORMATS[socialArtFormat(id)].label,
}));

const INSTAGRAM_CAPTION_LIMIT = 2200;

const sameIds = (a: SocialSlide[], b: SocialSlide[]) =>
  a.length === b.length && a.every((s, i) => s.id === b[i].id);

export function SocialPublicationEditor({
  project: initialProject,
  initialSlides,
  initialMetadata,
  dnaName,
  dnaOptions = [],
  brand,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [project, setProject] = React.useState(initialProject);
  const [slides, setSlides] = React.useState(initialSlides);
  const [artById, setArtById] = React.useState<ArtById>(() => artFromSlides(initialSlides));
  const [settings, setSettings] = React.useState<SocialArtSettings>(() =>
    parseSocialArtSettings(initialProject.socialArt),
  );
  const [metadata, setMetadata] = React.useState(initialMetadata);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSlides[0]?.id ?? null,
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [shareable, setShareable] = React.useState(false);
  const [titleMode, setTitleMode] = React.useState<"manual" | "ai">("manual");
  const [titleInstruction, setTitleInstruction] = React.useState("");
  const [titleOptions, setTitleOptions] = React.useState<{ slideId: string; options: SocialTitleOption[] } | null>(
    null,
  );
  const autosave = useSocialArtAutosave<PublicationArtPatch>(`/api/publications/${project.id}/art`);

  React.useEffect(() => setShareable(canShareFiles()), []);

  const aspect = getSocialAspectRatioSpec(project.socialAspectRatio);
  const selectedIndex = Math.max(0, slides.findIndex((s) => s.id === selectedId));
  const selected = slides[selectedIndex] ?? null;
  const selectedArt = selected ? (artById[selected.id] ?? parseSocialSlideArt(null)) : null;

  const artPost = React.useMemo(
    () =>
      buildSocialArtPost({
        aspectRatio: project.socialAspectRatio,
        slides: slides.map((s) => ({ ...s, art: artById[s.id] ?? parseSocialSlideArt(null) })),
        settings,
        brand,
      }),
    [project.socialAspectRatio, slides, artById, settings, brand],
  );
  const selectedArtSlide = artPost.slides[selectedIndex];
  const artBrand = React.useMemo(() => resolveSocialArtBrand(brand, settings), [brand, settings]);
  const references = React.useMemo(() => parseSocialReferences(project.socialReferences), [project.socialReferences]);
  const referenceAnalysis = React.useMemo(
    () => parseSocialReferenceAnalysis(project.socialReferenceNotes),
    [project.socialReferenceNotes],
  );

  const isGenerating = slides.some((s) => s.status === "generating");
  const readyCount = slides.filter((s) => s.imageUrl).length;
  const exportName = socialArtSlug(project.title);

  /** Replaces server-owned fields only, so unsaved text edits survive polling. */
  const slidesRef = React.useRef(slides);
  slidesRef.current = slides;
  const applyServerSlides = React.useCallback((next: SocialSlide[]) => {
    if (!sameIds(slidesRef.current, next)) {
      setArtById(artFromSlides(next));
      setSlides(next);
      return;
    }
    setSlides((prev) =>
      prev.map((s, i) => ({
        ...s,
        imageUrl: next[i].imageUrl,
        status: next[i].status,
        errorMessage: next[i].errorMessage,
        referenceAssetId: next[i].referenceAssetId,
      })),
    );
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/publications/${project.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setProject(data.project);
    applyServerSlides(data.slides ?? []);
    setMetadata(data.metadata ?? null);
  }, [project.id, applyServerSlides]);

  React.useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [isGenerating, refresh]);

  function persistSlides(nextSlides: SocialSlide[], nextArt: ArtById) {
    autosave.schedule({
      slides: nextSlides.map((s) => ({
        id: s.id,
        headline: s.headline,
        bodyText: s.bodyText,
        visualPrompt: s.visualPrompt,
        art: nextArt[s.id] ?? parseSocialSlideArt(null),
      })),
    });
  }

  function updateSelected(patch: Partial<Pick<SocialSlide, "headline" | "bodyText" | "visualPrompt">>) {
    if (!selected) return;
    const nextSlides = slides.map((s) => (s.id === selected.id ? { ...s, ...patch } : s));
    setSlides(nextSlides);
    persistSlides(nextSlides, artById);
  }

  function updateSelectedArt(patch: Partial<SocialSlideArt>) {
    if (!selected || !selectedArt) return;
    const nextArt = { ...artById, [selected.id]: { ...selectedArt, ...patch } };
    setArtById(nextArt);
    persistSlides(slides, nextArt);
  }

  function applyTitleOption(option: SocialTitleOption) {
    if (!selected || !selectedArt) return;
    const nextSlides = slides.map((s) =>
      s.id === selected.id ? { ...s, headline: option.headline, bodyText: option.body } : s,
    );
    const nextArt = { ...artById, [selected.id]: { ...selectedArt, lead: option.lead } };
    setSlides(nextSlides);
    setArtById(nextArt);
    persistSlides(nextSlides, nextArt);
  }

  const generateTitles = () => {
    if (!selected) return;
    const id = selected.id;
    void run(
      `titles-${id}`,
      async () => {
        await autosave.flush();
        const res = await fetch(`/api/social-slides/${id}/titles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: titleInstruction.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setTitleOptions({ slideId: id, options: data.options ?? [] });
      },
      "Could not write titles",
    );
  };

  function updateSettings(patch: Partial<SocialArtSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    autosave.schedule({ settings: next });
  }

  async function run(key: string, task: () => Promise<void>, failTitle: string) {
    setBusy(key);
    try {
      await task();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast({
        variant: "destructive",
        title: failTitle,
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  function changeFormat(next: SocialAspectRatio) {
    const prev = aspect.id;
    if (next === prev) return;
    setProject((p) => ({ ...p, socialAspectRatio: next }));
    void run(
      "format",
      async () => {
        const res = await fetch(`/api/publications/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ socialAspectRatio: next }),
        });
        if (!res.ok) {
          setProject((p) => ({ ...p, socialAspectRatio: prev }));
          throw new Error((await res.json()).error ?? "Failed");
        }
        if (readyCount > 0) {
          toast({
            title: `Format: ${SOCIAL_ART_FORMATS[socialArtFormat(next)].label}`,
            description: "Current images are cropped to fit. Regenerate them for framing made for this format.",
          });
        }
      },
      "Could not change format",
    );
  }

  function changeDna(value: string) {
    const nextDnaId = value === NO_DNA ? null : value;
    if (nextDnaId === (project.projectDnaId ?? null)) return;
    const nextName = dnaOptions.find((d) => d.id === nextDnaId)?.name ?? null;
    void run(
      "dna",
      async () => {
        const res = await fetch(`/api/publications/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectDnaId: nextDnaId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setProject(data.project);
        router.refresh();
        const moved = Number(data.movedPhotos ?? 0);
        toast({
          variant: "success",
          title: nextName ? `Linked to ${nextName}` : "DNA removed",
          description: nextName
            ? moved > 0
              ? `${moved} photo${moved === 1 ? "" : "s"} moved to ${nextName}'s client photos. Brand colors, logo and handle now apply.`
              : `Client photos now come from ${nextName}. Brand colors, logo and handle now apply.`
            : "This publication now keeps its own photos.",
        });
      },
      "Could not change DNA",
    );
  }

  const generateSlides = () =>
    run(
      "slides",
      async () => {
        await autosave.flush();
        const res = await fetch(`/api/publications/${project.id}/slides/generate`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const data = await res.json();
        applyServerSlides(data.slides ?? []);
        if (data.slides?.[0]?.id) setSelectedId(data.slides[0].id);
        toast({ title: "Slide structure ready" });
      },
      "Could not generate slides",
    );

  const generateAllImages = () =>
    run(
      "images",
      async () => {
        await autosave.flush();
        const res = await fetch(`/api/publications/${project.id}/slides/images`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        setSlides((prev) => prev.map((s) => ({ ...s, status: "generating" })));
        toast({ title: "Generating images…" });
        void refresh();
      },
      "Image generation failed",
    );

  const generateCaption = () =>
    run(
      "caption",
      async () => {
        await autosave.flush();
        const res = await fetch(`/api/publications/${project.id}/caption`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const data = await res.json();
        setMetadata(data.metadata ?? null);
        toast({ title: "Caption ready" });
      },
      "Caption failed",
    );

  const regenerateSlideImage = () => {
    if (!selected) return;
    const id = selected.id;
    void run(
      `img-${id}`,
      async () => {
        await autosave.flush();
        const res = await fetch(`/api/social-slides/${id}`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        setSlides((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "generating", errorMessage: null } : s)),
        );
        toast({ title: "Regenerating image…" });
        void refresh();
      },
      "Regenerate failed",
    );
  };

  async function applyGalleryAsset(assetId: string, mode: ClientPhotoMode) {
    if (!selected) return;
    const id = selected.id;
    await run(
      `gallery-${id}`,
      async () => {
        const res = await fetch(`/api/social-slides/${id}/from-gallery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (mode === "enhance") {
          setSlides((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status: "generating", errorMessage: null } : s)),
          );
          toast({ title: "Enhancing photo with AI…", description: "About a minute. You can keep editing." });
          void refresh();
        } else if (mode === "use" && data.imageUrl) {
          setSlides((prev) =>
            prev.map((s) =>
              s.id === id
                ? { ...s, imageUrl: data.imageUrl, referenceAssetId: assetId, status: "ready", errorMessage: null }
                : s,
            ),
          );
          toast({ title: "Client photo applied to slide" });
        } else {
          setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, referenceAssetId: assetId } : s)));
          toast({ title: "Reference saved — regenerate image to blend with AI" });
        }
      },
      "Gallery pick failed",
    );
  }

  const downloadArtZip = () =>
    run(
      "art-zip",
      async () => {
        const { blob, name } = await socialArtZip(artBrand, artPost, formatCaption(metadata), exportName);
        downloadBlob(blob, name);
        toast({ title: "Art downloaded", description: "Finished slides plus legenda.txt with the caption." });
      },
      "Could not export art",
    );

  const downloadCurrentArt = () =>
    run(
      "art-png",
      async () => {
        const file = await socialArtSlideFile(artBrand, artPost, selectedIndex, exportName);
        downloadBlob(file, file.name);
      },
      "Could not export slide",
    );

  const share = () =>
    run(
      "share",
      async () => {
        const files = await Promise.all(
          artPost.slides.map((_, i) => socialArtSlideFile(artBrand, artPost, i, exportName)),
        );
        await navigator.clipboard.writeText(formatCaption(metadata)).catch(() => undefined);
        await navigator.share({ files });
        toast({ title: "Caption copied — paste it on Instagram" });
      },
      "Could not share",
    );

  async function copyCaption() {
    const text = formatCaption(metadata);
    if (!text) {
      toast({ variant: "destructive", title: "No caption yet" });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast({ title: "Caption copied" });
  }

  function downloadRawZip() {
    window.location.href = `/api/publications/${project.id}/export`;
  }

  const captionText = formatCaption(metadata);
  const status = autosaveLabel(autosave.state);
  const isCarousel = slides.length > 1;
  const layout = selectedArtSlide?.layout ?? "photo";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground">
            {project.postFormat === "single" ? "Single post" : "Carousel"} ·{" "}
            {SOCIAL_ART_FORMATS[socialArtFormat(aspect.id)].label} ·{" "}
            {project.postKind}
            {status ? (
              <span className={cn("ml-1", autosave.state === "error" && "text-destructive")}>· {status}</span>
            ) : null}
          </p>
          <h1 className="text-base font-semibold">{project.title}</h1>
          <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
            {project.storyDescription}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Dna className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Select
              value={project.projectDnaId ?? NO_DNA}
              onValueChange={changeDna}
              disabled={busy !== null}
            >
              <SelectTrigger className="h-7 w-[200px] text-xs" title="Project DNA — brand kit and client photos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DNA}>No DNA</SelectItem>
                {dnaOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {busy === "dna" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void generateSlides()}>
            {busy === "slides" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
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
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
          <section className="flex min-w-0 flex-col items-center gap-3 lg:sticky lg:top-0" aria-label="Art preview">
            <div className="flex w-full justify-center rounded-lg border border-border bg-muted/40 p-4">
              <div className="relative max-w-full">
                <SocialArtCanvas
                  brand={artBrand}
                  post={artPost}
                  index={selectedIndex}
                  className="block h-auto max-h-[calc(100vh-17rem)] min-h-[280px] w-auto max-w-full rounded-sm shadow-lg"
                  onPhotoError={() =>
                    toast({ variant: "destructive", title: "Could not load this slide's image" })
                  }
                />
                {selected?.status === "generating" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-sm bg-black/50 text-2xs text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Generating image…
                  </div>
                ) : null}
              </div>
            </div>

            {isCarousel ? (
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {slides.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setSelectedId(slide.id)}
                    aria-label={`Slide ${i + 1}`}
                    aria-current={i === selectedIndex ? "true" : undefined}
                    className={cn(
                      "relative shrink-0 overflow-hidden rounded-md border bg-muted transition-colors",
                      i === selectedIndex ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent/40",
                    )}
                  >
                    <SocialArtCanvas brand={artBrand} post={artPost} index={i} className="block h-[72px] w-auto" />
                    {slide.status === "generating" ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={busy !== null || isGenerating}
                onClick={() => void downloadArtZip()}
                title="Finished art with your brand overlay, plus the caption"
              >
                {busy === "art-zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isCarousel ? "Download art (ZIP)" : "Download art + caption"}
              </Button>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void downloadCurrentArt()}>
                {busy === "art-png" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                This slide (PNG)
              </Button>
              <AddToCreativesButton
                size="sm"
                label={isCarousel ? "Slide → Creative" : "Add to Creatives"}
                name={project.title}
                format={isCarousel ? "CARR" : "IMG"}
                source={{
                  type: "file",
                  isVideo: false,
                  sourceRef: `${project.id}:${selectedIndex}`,
                  getFile: () => socialArtSlideFile(artBrand, artPost, selectedIndex, exportName),
                }}
              />
              {shareable ? (
                <Button variant="outline" size="sm" disabled={busy !== null || isGenerating} onClick={() => void share()}>
                  <Share2 className="h-3.5 w-3.5" /> Share
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={readyCount === 0}
                onClick={downloadRawZip}
                title="Background images without text, as generated"
              >
                Raw images
              </Button>
            </div>
          </section>

          {selected && selectedArt ? (
            <div className="flex flex-col gap-4">
              <SocialArtPanel
                title="Format and layout"
                action={
                  brand.dnaId ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dna/${brand.dnaId}/art-kit`} title={`Colors, fonts, logo and handle from ${brand.name}`}>
                        <Palette className="h-3.5 w-3.5" /> Brand kit
                      </Link>
                    </Button>
                  ) : null
                }
              >
                <SegmentedControl<SocialAspectRatio>
                  label="Format"
                  value={aspect.id}
                  onChange={changeFormat}
                  options={FORMAT_OPTIONS}
                />
                <SegmentedControl<SocialArtLayout>
                  label={isCarousel ? `Layout of slide ${selectedIndex + 1}` : "Layout"}
                  value={layout}
                  onChange={(l) => updateSelectedArt({ layout: l })}
                  options={(Object.keys(SOCIAL_ART_LAYOUT_LABELS) as SocialArtLayout[]).map((l) => ({
                    value: l,
                    label: SOCIAL_ART_LAYOUT_LABELS[l],
                  }))}
                />
                {layout === "photo" ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <SegmentedControl<SocialArtTextPosition>
                        label="Text"
                        value={selectedArt.position}
                        onChange={(position) => updateSelectedArt({ position })}
                        options={[
                          { value: "top", label: "Top" },
                          { value: "bottom", label: "Bottom" },
                        ]}
                      />
                      <SegmentedControl<SocialArtTextAlign>
                        label="Align"
                        value={selectedArt.align ?? "center"}
                        onChange={(align) => updateSelectedArt({ align })}
                        options={[
                          { value: "left", label: "Left" },
                          { value: "center", label: "Center" },
                        ]}
                      />
                      <SegmentedControl<SocialArtOverlay>
                        label="Backdrop"
                        value={selectedArt.overlay ?? (selectedArt.position === "bottom" ? "dark" : "light")}
                        onChange={(overlay) => updateSelectedArt({ overlay })}
                        options={[
                          { value: "dark", label: "Dark" },
                          { value: "light", label: "Light" },
                        ]}
                      />
                    </div>
                    <SegmentedControl<SocialArtSupportSize>
                      label="Small line and supporting text"
                      value={selectedArt.supportSize ?? "small"}
                      onChange={(supportSize) => updateSelectedArt({ supportSize })}
                      options={[
                        { value: "small", label: "Small" },
                        { value: "large", label: "Large, title color" },
                      ]}
                    />
                  </>
                ) : null}
                {!brand.dnaId ? (
                  <p className="text-2xs text-muted-foreground">
                    Link a Project DNA to use brand colors, logo and handle.
                  </p>
                ) : null}
              </SocialArtPanel>

              <SocialArtPanel title="Title style and colors" hint="Applies to every slide of this post.">
                {selectedArtSlide ? (
                  <SocialTitleStylePicker
                    brand={brand}
                    titleStyle={settings.titleStyle}
                    colors={settings.colors}
                    onChange={updateSettings}
                    sample={selectedArtSlide}
                    format={artPost.format}
                    suggestedStyle={referenceAnalysis?.titleStyle}
                    suggestedPalette={referenceAnalysis?.palette}
                  />
                ) : null}
              </SocialArtPanel>

              <SocialArtPanel
                title={isCarousel ? `Art text · slide ${selectedIndex + 1}` : "Art text"}
                action={<span className="text-2xs text-muted-foreground">{selected.slideRole}</span>}
              >
                <SegmentedControl<"manual" | "ai">
                  label="Titles"
                  value={titleMode}
                  onChange={setTitleMode}
                  options={[
                    { value: "manual", label: "Write my own" },
                    { value: "ai", label: "Generate with AI" },
                  ]}
                />
                {titleMode === "ai" ? (
                  <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                    <div className="flex gap-2">
                      <Input
                        value={titleInstruction}
                        maxLength={300}
                        onChange={(e) => setTitleInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") generateTitles();
                        }}
                        placeholder="Optional: more aggressive, mention the price, a question…"
                        className="h-8 text-xs"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={generateTitles}
                        className="shrink-0"
                      >
                        {busy === `titles-${selected.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {titleOptions?.slideId === selected.id ? "More titles" : "Generate titles"}
                      </Button>
                    </div>
                    {titleOptions?.slideId === selected.id ? (
                      <div className="grid gap-1.5">
                        {titleOptions.options.map((option, i) => {
                          const active =
                            option.headline === selected.headline &&
                            option.lead === selectedArt.lead &&
                            option.body === selected.bodyText;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyTitleOption(option)}
                              className={cn(
                                "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                active
                                  ? "border-accent bg-accent/10"
                                  : "border-border hover:border-accent/50 hover:bg-muted/50",
                              )}
                            >
                              {option.lead ? <span className="block text-2xs text-muted-foreground">{option.lead}</span> : null}
                              <span className="block font-semibold leading-snug">{option.headline}</span>
                              {option.body ? (
                                <span className="mt-0.5 block text-2xs text-muted-foreground">{option.body}</span>
                              ) : null}
                            </button>
                          );
                        })}
                        <p className="text-2xs text-muted-foreground">Click one to use it — you can still edit below.</p>
                      </div>
                    ) : (
                      <p className="text-2xs text-muted-foreground">
                        Six options in the language and text pattern of this post
                        {references.length > 0 ? ", with the same proportions as your reference" : ""}.
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="slide-lead">Small line</Label>
                  <Input
                    id="slide-lead"
                    maxLength={SOCIAL_ART_TEXT_LIMITS.lead}
                    value={selectedArt.lead}
                    placeholder={layout === "number" ? "e.g. Since" : "e.g. Tip 1, Did you know?"}
                    onChange={(e) => updateSelectedArt({ lead: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slide-headline">{layout === "number" ? "Highlighted number" : "Headline"}</Label>
                  {layout === "number" ? (
                    <Input
                      id="slide-headline"
                      maxLength={200}
                      value={selected.headline}
                      onChange={(e) => updateSelected({ headline: e.target.value })}
                    />
                  ) : (
                    <>
                      <Textarea
                        id="slide-headline"
                        rows={2}
                        maxLength={200}
                        value={selected.headline}
                        onChange={(e) => updateSelected({ headline: e.target.value })}
                      />
                      <p className="text-2xs text-muted-foreground">Enter breaks the line.</p>
                    </>
                  )}
                </div>
                {layout === "number" ? (
                  <div className="space-y-1">
                    <Label htmlFor="slide-tag">Label</Label>
                    <Input
                      id="slide-tag"
                      maxLength={SOCIAL_ART_TEXT_LIMITS.tag}
                      value={selectedArt.tag}
                      placeholder="e.g. In 2025"
                      onChange={(e) => updateSelectedArt({ tag: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label htmlFor="slide-body">Supporting text</Label>
                    <Textarea
                      id="slide-body"
                      rows={3}
                      maxLength={1000}
                      value={selected.bodyText}
                      onChange={(e) => updateSelected({ bodyText: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid gap-1.5 border-t border-border pt-3 sm:grid-cols-2">
                  <ToggleRow checked={settings.showHandle} onChange={(showHandle) => updateSettings({ showHandle })}>
                    Show {brand.handle || "handle"} at the top
                  </ToggleRow>
                  <ToggleRow checked={settings.showLogo} onChange={(showLogo) => updateSettings({ showLogo })}>
                    Show logo{brand.logoUrl ? "" : " (none in DNA)"}
                  </ToggleRow>
                  <ToggleRow checked={artPost.decor} onChange={(decor) => updateSettings({ decor })}>
                    Blurred decorative shapes
                  </ToggleRow>
                  {isCarousel ? (
                    <ToggleRow checked={settings.showCounter} onChange={(showCounter) => updateSettings({ showCounter })}>
                      Slide counter (1/{slides.length})
                    </ToggleRow>
                  ) : null}
                </div>
              </SocialArtPanel>

              <SocialArtPanel
                title="Photo"
                action={<span className="text-2xs text-muted-foreground">{selected.status}</span>}
              >
                {layout === "text" ? (
                  <p className="text-2xs text-muted-foreground">
                    The &quot;{SOCIAL_ART_LAYOUT_LABELS.text}&quot; layout doesn&apos;t use the photo.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => setGalleryOpen(true)}
                    title="Upload and pick real client photos"
                  >
                    <Images className="h-3.5 w-3.5" />
                    Client photos
                  </Button>
                  {selected.referenceAssetId && selected.imageUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null || selected.status === "generating"}
                      onClick={() => void applyGalleryAsset(selected.referenceAssetId!, "enhance")}
                      title="Fix light, color and sharpness and fit this client photo to the post"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Enhance photo with AI
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void regenerateSlideImage()}>
                    {busy === `img-${selected.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="h-3.5 w-3.5" />
                    )}
                    {selected.imageUrl ? "Regenerate with AI" : "Generate with AI"}
                  </Button>
                </div>
                {selected.errorMessage ? (
                  <p className="text-2xs text-destructive">{selected.errorMessage}</p>
                ) : null}
                {selected.referenceAssetId ? (
                  <p className="text-2xs text-accent/90">
                    Client photo linked as {selected.imageUrl ? "base" : "AI reference"}
                  </p>
                ) : null}
                {layout !== "text" && selected.imageUrl ? (
                  <div className="space-y-3">
                    <RangeRow
                      label="Vertical position"
                      min={0}
                      max={100}
                      value={selectedArt.focusY}
                      onChange={(focusY) => updateSelectedArt({ focusY })}
                    />
                    <RangeRow
                      label="Horizontal position"
                      min={0}
                      max={100}
                      value={selectedArt.focusX}
                      onChange={(focusX) => updateSelectedArt({ focusX })}
                    />
                    <RangeRow
                      label="Zoom"
                      min={100}
                      max={220}
                      value={selectedArt.zoom}
                      onChange={(zoom) => updateSelectedArt({ zoom })}
                    />
                  </div>
                ) : null}
                {references.length > 0 ? (
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <p className="text-xs font-medium">Reference images</p>
                    <div className="flex gap-1.5">
                      {references.map((ref) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={ref.assetId}
                          src={ref.url}
                          alt=""
                          className="h-12 w-12 rounded border border-border object-cover"
                        />
                      ))}
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {selected.referenceAssetId
                        ? "This slide uses a client photo, so only the written style notes apply here."
                        : "AI images for this post follow these references."}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1 border-t border-border pt-3">
                  <Label htmlFor="slide-prompt">AI visual prompt</Label>
                  <Textarea
                    id="slide-prompt"
                    value={selected.visualPrompt}
                    onChange={(e) => updateSelected({ visualPrompt: e.target.value })}
                    rows={3}
                  />
                </div>
              </SocialArtPanel>

              <SocialArtPanel
                title="Instagram caption"
                action={
                  <Button variant="ghost" size="sm" disabled={!captionText} onClick={() => void copyCaption()}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                }
              >
                {metadata?.hookLine ? <p className="text-xs font-medium">{metadata.hookLine}</p> : null}
                {captionText ? (
                  <>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-2xs leading-relaxed text-foreground">
                      {captionText}
                    </pre>
                    <p
                      className={cn(
                        "text-2xs text-muted-foreground",
                        captionText.length > INSTAGRAM_CAPTION_LIMIT && "text-destructive",
                      )}
                    >
                      {captionText.length.toLocaleString()} of {INSTAGRAM_CAPTION_LIMIT.toLocaleString()} characters
                    </p>
                  </>
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    Generate a caption after your slides are ready — then copy it or download it with the art.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void generateCaption()}
                >
                  {busy === "caption" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {captionText ? "Rewrite caption" : "Generate caption"}
                </Button>
              </SocialArtPanel>
            </div>
          ) : null}
        </div>
      )}

      <ClientPhotosDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        publicationId={project.id}
        dnaName={project.projectDnaId ? dnaName : null}
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
