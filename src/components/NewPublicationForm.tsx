"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Layers, Sparkles, Loader2, TrendingUp } from "lucide-react";
import type { Avatar, ProjectDna } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
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
import { ProjectApiSettings } from "@/components/ProjectApiSettings";
import { getDefaultApiModels, type ProjectApiModels } from "@/lib/project-api-models";
import { AvatarCastPicker, type AvatarCastValue } from "@/components/AvatarCastPicker";
import { ProjectDnaPicker } from "@/components/ProjectDnaPicker";
import { IconChipPicker } from "@/components/IconChipPicker";
import {
  PROJECT_GENRES,
  PROJECT_VISUAL_STYLES,
} from "@/lib/project-creative-options";
import {
  PROJECT_IDENTITY_HINT,
  PROJECT_IDENTITY_LABEL,
} from "@/lib/project-identity";
import { ProjectScriptLanguagePicker } from "@/components/ProjectScriptLanguagePicker";
import {
  normalizeProjectScriptLanguage,
  type ProjectScriptLanguage,
} from "@/lib/project-language";
import type { StoryIdea, TopStoryPick, TrendStoryIdea, TrendSuggestionsMeta } from "@/lib/story-suggestions-server";
import {
  POST_FORMATS,
  POST_KINDS,
  type PostFormat,
  type PostKind,
  clampSlideCount,
} from "@/lib/social-content";
import {
  SOCIAL_ASPECT_RATIOS,
  type SocialAspectRatio,
  normalizeSocialAspectRatio,
} from "@/lib/social-aspect-ratio";
import { dnaStyleDefaultsForForms } from "@/lib/dna-style";
import { SocialReferencesField } from "@/components/social-art/SocialReferencesField";
import { SocialTitleStylePicker } from "@/components/social-art/SocialTitleStylePicker";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { socialArtFormat, socialReferencePromptText, toSocialArtBrand } from "@/lib/social-art/model";
import type {
  SocialArtBrand,
  SocialArtColors,
  SocialArtSlide,
  SocialReference,
  SocialReferenceAnalysis,
  SocialReferenceMode,
  SocialTitleStyleId,
} from "@/lib/social-art/types";
import { cn } from "@/lib/utils";

const FALLBACK_BRAND = toSocialArtBrand(null, null);

const ASPECT_BY_RATIO: Array<[SocialAspectRatio, number]> = [
  ["4:5", 4 / 5],
  ["1:1", 1],
  ["9:16", 9 / 16],
];

function closestSocialAspect(width: number, height: number): SocialAspectRatio {
  const r = width / height;
  return ASPECT_BY_RATIO.reduce((best, cur) =>
    Math.abs(Math.log(r / cur[1])) < Math.abs(Math.log(r / best[1])) ? cur : best,
  )[0];
}

async function runPool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
    }),
  );
}

async function generateSlidesAndImages(publicationId: string) {
  const res = await fetch(`/api/publications/${publicationId}/slides/generate`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Slides failed");
  await fetch(`/api/publications/${publicationId}/slides/images`, { method: "POST" });
}

const TONES = [
  "Dramatic",
  "Calm",
  "Energetic",
  "Suspenseful",
  "Warm",
  "Mysterious",
  "Documentary",
  "Playful",
  "Seductive",
];

export function NewPublicationForm({
  avatars = [],
  projectDna = [],
  defaultDnaId = null,
  artBrands = {},
}: {
  avatars?: Avatar[];
  projectDna?: ProjectDna[];
  defaultDnaId?: string | null;
  artBrands?: Record<string, SocialArtBrand>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [projectDnaId, setProjectDnaId] = React.useState<string | null>(defaultDnaId);
  const [storyDescription, setStoryDescription] = React.useState("");
  const [genre, setGenre] = React.useState("Children");
  const [visualStyle, setVisualStyle] = React.useState("3D Render");
  const [voiceTone, setVoiceTone] = React.useState("Energetic");
  const [postFormat, setPostFormat] = React.useState<PostFormat>("carousel");
  const [socialAspectRatio, setSocialAspectRatio] = React.useState<SocialAspectRatio>("4:5");
  const [postKind, setPostKind] = React.useState<PostKind>("educational");
  const [slideCount, setSlideCount] = React.useState(7);
  const [socialUseAvatar, setSocialUseAvatar] = React.useState(false);
  const [scriptLanguage, setScriptLanguage] = React.useState<ProjectScriptLanguage>("en");
  const [avatarCast, setAvatarCast] = React.useState<AvatarCastValue>({
    selectedIds: [],
    primaryId: null,
  });
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(getDefaultApiModels);
  const [submitting, setSubmitting] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [aiIdeas, setAiIdeas] = React.useState<StoryIdea[]>([]);
  const [trendIdeas, setTrendIdeas] = React.useState<TrendStoryIdea[]>([]);
  const [topPicks, setTopPicks] = React.useState<TopStoryPick[]>([]);
  const [trendsMeta, setTrendsMeta] = React.useState<TrendSuggestionsMeta | null>(null);
  const [references, setReferences] = React.useState<SocialReference[]>([]);
  const [refAnalysis, setRefAnalysis] = React.useState<SocialReferenceAnalysis | null>(null);
  const [titleStyle, setTitleStyle] = React.useState<SocialTitleStyleId | null>(null);
  const [artColors, setArtColors] = React.useState<SocialArtColors | null>(null);
  const [checkedIdeas, setCheckedIdeas] = React.useState<string[]>([]);
  const [creatingMany, setCreatingMany] = React.useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [referenceMode, setReferenceMode] = React.useState<SocialReferenceMode>("inspire");
  const [autoGenerate, setAutoGenerate] = React.useState(true);
  const styleTouched = React.useRef(false);
  const hasRefs = references.length > 0;
  const [variationCount, setVariationCount] = React.useState(3);

  const artBrand = (projectDnaId && artBrands[projectDnaId]) || FALLBACK_BRAND;
  const firstItem = references.length > 0 ? refAnalysis?.items[0] : undefined;
  const styleSample = React.useMemo<SocialArtSlide>(
    () => ({
      id: "sample",
      layout: references[0] ? (firstItem?.layout ?? "photo") : "text",
      position: firstItem?.position ?? "bottom",
      align: firstItem?.align,
      overlay: firstItem?.overlay,
      supportSize: firstItem?.supportSize,
      lead: firstItem && !title.trim() ? firstItem.lead : "",
      title: title.trim() || firstItem?.headline || "Your headline here",
      body: "",
      tag: "",
      photo: references[0]?.url ?? "",
      focusX: 50,
      focusY: 50,
      zoom: 100,
    }),
    [title, references, firstItem],
  );

  const handleAnalysis = React.useCallback((analysis: SocialReferenceAnalysis | null) => {
    setRefAnalysis(analysis);
    if (analysis?.language) setScriptLanguage(analysis.language);
    if (styleTouched.current) return;
    setTitleStyle(analysis?.titleStyle ?? null);
    setArtColors(analysis?.palette ?? null);
  }, []);

  const referenceKey = references.map((r) => r.assetId).join(",");
  React.useEffect(() => {
    if (referenceMode !== "copy" || references.length === 0) return;
    if (references.length === 1) {
      setPostFormat("single");
    } else if (references.length >= 3) {
      setPostFormat("carousel");
      setSlideCount(references.length);
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive && img.naturalWidth && img.naturalHeight) {
        setSocialAspectRatio(closestSocialAspect(img.naturalWidth, img.naturalHeight));
      }
    };
    img.src = references[0].url;
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceMode, referenceKey]);

  React.useEffect(() => {
    if (postFormat === "single") {
      setSlideCount(1);
    } else if (slideCount < 3) {
      setSlideCount(7);
    }
  }, [postFormat, slideCount]);

  async function handleSuggest(opts: { ideasOnly?: boolean } = {}): Promise<StoryIdea[]> {
    setSuggesting(true);
    setAiIdeas([]);
    setTrendIdeas([]);
    setTopPicks([]);
    setTrendsMeta(null);
    setCheckedIdeas([]);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre,
          visualStyle,
          voiceTone,
          projectDnaId: projectDnaId ?? undefined,
          scriptLanguage,
          contentType: "social",
          postFormat,
          postKind,
          slideCount: clampSlideCount(slideCount, postFormat),
          socialAspectRatio,
          referenceNotes:
            references.length > 0 && refAnalysis
              ? socialReferencePromptText({ ...refAnalysis, mode: referenceMode }) || undefined
              : undefined,
          referenceMode,
          ideasOnly: opts.ideasOnly,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setAiIdeas(data.aiIdeas ?? []);
      setTrendIdeas(data.trendIdeas ?? []);
      setTopPicks(data.topPicks ?? []);
      setTrendsMeta(data.trendsMeta ?? null);
      return data.aiIdeas ?? [];
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not suggest ideas",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return [];
    } finally {
      setSuggesting(false);
    }
  }

  async function generateVariations() {
    const ideas = await handleSuggest({ ideasOnly: true });
    if (ideas.length === 0) return;
    setCheckedIdeas(ideas.map((_, i) => `ai-${i}`));
    pickIdea(ideas[0]);
  }

  async function createVariations(count: number) {
    const ideas = (await handleSuggest({ ideasOnly: true })).slice(0, count);
    if (ideas.length === 0) return;
    setCheckedIdeas(ideas.map((_, i) => `ai-${i}`));
    await createMany(ideas);
  }

  function pickIdea(idea: StoryIdea) {
    setTitle(idea.title);
    setStoryDescription(idea.summary);
  }

  async function createPublication(postTitle: string, brief: string): Promise<string> {
    const res = await fetch("/api/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: postTitle.slice(0, 120),
        projectDnaId,
        storyDescription: brief.slice(0, 4000),
        genre,
        visualStyle,
        voiceTone,
        postFormat,
        socialAspectRatio,
        postKind,
        slideCount: clampSlideCount(slideCount, postFormat),
        socialUseAvatar,
        scriptLanguage,
        avatarId: socialUseAvatar ? avatarCast.primaryId : null,
        avatarIds: socialUseAvatar ? avatarCast.selectedIds : [],
        referenceAssetIds: references.map((r) => r.assetId),
        referenceAnalysis: references.length > 0 ? refAnalysis : null,
        referenceMode,
        titleStyle,
        artColors,
        ...apiModels,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    const data = await res.json();
    return data.id as string;
  }

  async function handleSubmit() {
    let postTitle = title.trim();
    let brief = storyDescription.trim();
    if ((!postTitle || !brief) && !hasRefs) {
      toast({
        variant: "destructive",
        title: "Missing info",
        description: "Write a title and brief, or add a reference image and let the AI write them.",
      });
      return;
    }
    if ((!postTitle || !brief) && !refAnalysis) {
      toast({ title: "Still reading your reference images", description: "Try again in a few seconds." });
      return;
    }
    setSubmitting(true);
    try {
      if (!postTitle || !brief) {
        const [idea] = await handleSuggest({ ideasOnly: true });
        if (!idea) return;
        postTitle ||= idea.title;
        brief ||= idea.summary || idea.title;
        setTitle(postTitle);
        setStoryDescription(brief);
      }
      const id = await createPublication(postTitle, brief);
      if (hasRefs && autoGenerate) {
        await generateSlidesAndImages(id).catch(() => undefined);
      }
      router.push(`/publications/${id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not create publication",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const hasSuggestions = aiIdeas.length > 0 || trendIdeas.length > 0;

  const ideaByKey = React.useMemo(() => {
    const map = new Map<string, StoryIdea>();
    topPicks.forEach((p) => map.set(`pick-${p.candidateId}`, p));
    aiIdeas.forEach((idea, i) => map.set(`ai-${i}`, idea));
    trendIdeas.forEach((idea, i) => map.set(`trend-${i}`, idea));
    return map;
  }, [topPicks, aiIdeas, trendIdeas]);

  function toggleIdea(key: string) {
    setCheckedIdeas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function createChecked() {
    await createMany(checkedIdeas.map((k) => ideaByKey.get(k)).filter((i): i is StoryIdea => !!i));
  }

  async function createMany(ideas: StoryIdea[]) {
    if (ideas.length === 0) return;
    setCreatingMany({ done: 0, total: ideas.length, label: "Creating" });
    let failed = 0;
    const ids: string[] = [];
    for (const idea of ideas) {
      try {
        ids.push(await createPublication(idea.title, idea.summary || idea.title));
      } catch {
        failed += 1;
      }
      setCreatingMany((s) => (s ? { ...s, done: s.done + 1 } : s));
    }
    let slideFailures = 0;
    if (hasRefs && autoGenerate && ids.length > 0) {
      setCreatingMany({ done: 0, total: ids.length, label: "Writing slides" });
      await runPool(ids, 3, async (id) => {
        await generateSlidesAndImages(id).catch(() => {
          slideFailures += 1;
        });
        setCreatingMany((s) => (s ? { ...s, done: s.done + 1 } : s));
      });
    }
    setCreatingMany(null);
    const created = ids.length;
    toast({
      variant: failed || slideFailures ? "destructive" : undefined,
      title: `${created} publication${created === 1 ? "" : "s"} created`,
      description: failed
        ? `${failed} failed — try those again.`
        : slideFailures
          ? `${slideFailures} could not write slides — open them and click Generate slides.`
          : hasRefs && autoGenerate
            ? "Images are being generated in the background."
            : "Same references and title style in all of them.",
    });
    if (created === 1) router.push(`/publications/${ids[0]}`);
    else if (created > 1) router.push("/");
  }

  function ideaRow(key: string, idea: StoryIdea, className: string, prefix?: string) {
    const checked = checkedIdeas.includes(key);
    return (
      <div key={key} className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs", className)}>
        <input
          type="checkbox"
          aria-label={`Select "${idea.title}" to create in batch`}
          checked={checked}
          onChange={() => toggleIdea(key)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <button type="button" onClick={() => pickIdea(idea)} className="min-w-0 flex-1 text-left">
          <span className="font-medium">
            {prefix}
            {idea.title}
          </span>
          <p className="line-clamp-2 text-2xs text-muted-foreground">{idea.summary}</p>
        </button>
      </div>
    );
  }

  function selectDna(id: string | null) {
    setProjectDnaId(id);
    if (!id) return;
    const dna = projectDna.find((d) => d.id === id);
    if (!dna) return;
    const defaults = dnaStyleDefaultsForForms(dna);
    if (defaults.genre) setGenre(defaults.genre);
    if (defaults.visualStyle) setVisualStyle(defaults.visualStyle);
    if (defaults.voiceTone) setVoiceTone(defaults.voiceTone);
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_min(26rem,34vw)]">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>{PROJECT_IDENTITY_LABEL}</Label>
            <p className="mb-1.5 text-2xs text-muted-foreground">{PROJECT_IDENTITY_HINT}</p>
            <ProjectDnaPicker items={projectDna} value={projectDnaId} onChange={selectDna} />
          </div>
          <div>
            <Label htmlFor="pub-title">
              Post title{hasRefs ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
            </Label>
            <Input
              id="pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={hasRefs ? "Leave empty — the AI writes it from your references" : "e.g. 5 signs you're overtraining"}
            />
          </div>
          <div>
            <Label htmlFor="pub-desc">
              Post brief{hasRefs ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
            </Label>
            <p className="mb-1.5 text-2xs text-muted-foreground">
              Hook, angle and what each slide should convey.
            </p>
            <Textarea
              id="pub-desc"
              value={storyDescription}
              onChange={(e) => setStoryDescription(e.target.value)}
              placeholder={
                hasRefs ? "Leave empty for a new idea based on the references…" : "Describe the carousel or single post…"
              }
              className="min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Format</Label>
              <Select
                value={postFormat}
                onValueChange={(v) => setPostFormat(v as PostFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Aspect ratio</Label>
              <Select
                value={socialAspectRatio}
                onValueChange={(v) =>
                  setSocialAspectRatio(normalizeSocialAspectRatio(v))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SOCIAL_ASPECT_RATIOS).map((spec) => (
                    <SelectItem key={spec.id} value={spec.id}>
                      {spec.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Post type</Label>
              <Select value={postKind} onValueChange={(v) => setPostKind(v as PostKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_KINDS.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {postFormat === "carousel" ? (
              <div>
                <Label>Slides</Label>
                <Select
                  value={String(slideCount)}
                  onValueChange={(v) => setSlideCount(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} slides
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div>
            <Label>Script language</Label>
            <div className="mt-1.5">
              <ProjectScriptLanguagePicker value={scriptLanguage} onChange={setScriptLanguage} />
            </div>
          </div>

          <div>
            <Label>Genre</Label>
            <IconChipPicker
              options={PROJECT_GENRES}
              value={genre}
              onChange={setGenre}
              ariaLabel="Genre"
            />
          </div>
          <div>
            <Label>Visual style</Label>
            <IconChipPicker
              options={PROJECT_VISUAL_STYLES}
              value={visualStyle}
              onChange={setVisualStyle}
              ariaLabel="Visual style"
            />
          </div>
          <div>
            <Label>Voice tone</Label>
            <Select value={voiceTone} onValueChange={setVoiceTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-panel/50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={socialUseAvatar}
                onChange={(e) => setSocialUseAvatar(e.target.checked)}
                className="rounded border-border"
              />
              Include character / avatar in images
            </label>
            {socialUseAvatar ? (
              <div className="mt-2">
                <AvatarCastPicker avatars={avatars} value={avatarCast} onChange={setAvatarCast} />
              </div>
            ) : (
              <p className="mt-1.5 text-2xs text-muted-foreground">
                Off by default — great for educational posts, quotes and infographics.
              </p>
            )}
          </div>

          <ProjectApiSettings
            value={apiModels}
            onChange={(patch) => setApiModels((prev) => ({ ...prev, ...patch }))}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => history.back()}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitting ? (hasRefs && autoGenerate ? "Writing slides…" : "Creating…") : "Create publication"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Suggest for me</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Feed post ideas based on your DNA and niche.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSuggest()}
            disabled={suggesting}
          >
            {suggesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate
          </Button>
        </div>

        {suggesting ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-2xs text-muted-foreground">Generating post ideas…</p>
          </div>
        ) : !hasSuggestions ? (
          <p className="rounded-lg border border-dashed border-border bg-background px-3 py-8 text-center text-2xs text-muted-foreground">
            Click Generate for carousel angles and trending topics.
          </p>
        ) : (
          <>
            <p className="text-2xs text-muted-foreground">
              Click an idea to fill the form, or tick several to create them all at once.
            </p>
            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {topPicks.map((pick) =>
                ideaRow(
                  `pick-${pick.candidateId}`,
                  pick,
                  "border-amber-400/40 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]",
                  `#${pick.rank} `,
                ),
              )}
              {aiIdeas.map((idea, i) => ideaRow(`ai-${i}`, idea, "border-border bg-background hover:border-accent/40"))}
              {trendIdeas.length > 0 ? (
                <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> Trends
                  </p>
                  {trendIdeas.map((idea, i) =>
                    ideaRow(`trend-${i}`, idea, "border-border bg-background hover:border-orange-400/40"),
                  )}
                </div>
              ) : null}
            </div>
            {checkedIdeas.length > 0 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={creatingMany !== null || submitting}
                onClick={() => void createChecked()}
              >
                {creatingMany ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                {creatingMany
                  ? `${creatingMany.label} ${Math.min(creatingMany.done + 1, creatingMany.total)} of ${creatingMany.total}…`
                  : `Create ${checkedIdeas.length} publication${checkedIdeas.length === 1 ? "" : "s"}`}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <div>
          <h2 className="text-sm font-semibold">Reference images</h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Everything starts from them: ideas, texts, title style, colors and AI images.
          </p>
        </div>
        <SegmentedControl<SocialReferenceMode>
          label="How to use them"
          value={referenceMode}
          options={[
            { value: "inspire", label: "Inspire new posts" },
            { value: "copy", label: "Copy and vary" },
          ]}
          onChange={setReferenceMode}
        />
        <p className="-mt-1 text-2xs text-muted-foreground">
          {referenceMode === "copy"
            ? "Each slide recreates its reference: same scene, layout, title position and text pattern, with new wording and small changes. Format and size follow the images."
            : "New scenes and topics in the same style, colors and title look."}
        </p>
        <SocialReferencesField
          value={references}
          onChange={setReferences}
          analysis={refAnalysis}
          onAnalysisChange={handleAnalysis}
          mode={referenceMode}
          onError={(message) => toast({ variant: "destructive", title: "Reference upload failed", description: message })}
        />
        {hasRefs ? (
          <div className="space-y-2.5 border-t border-border pt-3">
            <div className="flex items-end gap-2">
              <div className="w-28 shrink-0">
                <SegmentedControl<string>
                  label="Variations"
                  value={String(variationCount)}
                  options={[1, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(v) => setVariationCount(Number(v))}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="flex-1"
                disabled={suggesting || submitting || !refAnalysis || creatingMany !== null}
                onClick={() => void createVariations(variationCount)}
              >
                {suggesting || creatingMany ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {!refAnalysis
                  ? "Reading the images…"
                  : creatingMany
                    ? `${creatingMany.label} ${Math.min(creatingMany.done + 1, creatingMany.total)} of ${creatingMany.total}…`
                    : suggesting
                      ? "Writing new ideas…"
                      : `Create ${variationCount} variation${variationCount === 1 ? "" : "s"}`}
              </Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoGenerate}
                onChange={(e) => setAutoGenerate(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              Write slides and generate images right after creating
            </label>
            <p className="text-2xs text-muted-foreground">
              No title or brief needed — the AI writes a new idea for each variation.{" "}
              <button
                type="button"
                className="underline hover:text-foreground disabled:opacity-50"
                disabled={suggesting || !refAnalysis || creatingMany !== null}
                onClick={() => void generateVariations()}
              >
                Review ideas first
              </button>
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <div>
          <h2 className="text-sm font-semibold">Title style and colors</h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Try styles on your headline. You can change it later in the editor.
          </p>
        </div>
        <SocialTitleStylePicker
          brand={artBrand}
          titleStyle={titleStyle}
          colors={artColors}
          onChange={(patch) => {
            styleTouched.current = true;
            if (patch.titleStyle !== undefined) setTitleStyle(patch.titleStyle);
            if (patch.colors !== undefined) setArtColors(patch.colors);
          }}
          sample={styleSample}
          format={socialArtFormat(socialAspectRatio)}
          suggestedStyle={references.length > 0 ? refAnalysis?.titleStyle : null}
          suggestedPalette={references.length > 0 ? refAnalysis?.palette : null}
        />
      </div>
      </div>
    </div>
  );
}