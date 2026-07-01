"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, TrendingUp } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
}: {
  avatars?: Avatar[];
  projectDna?: ProjectDna[];
  defaultDnaId?: string | null;
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

  React.useEffect(() => {
    if (postFormat === "single") {
      setSlideCount(1);
    } else if (slideCount < 3) {
      setSlideCount(7);
    }
  }, [postFormat, slideCount]);

  async function handleSuggest() {
    setSuggesting(true);
    setAiIdeas([]);
    setTrendIdeas([]);
    setTopPicks([]);
    setTrendsMeta(null);
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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setAiIdeas(data.aiIdeas ?? []);
      setTrendIdeas(data.trendIdeas ?? []);
      setTopPicks(data.topPicks ?? []);
      setTrendsMeta(data.trendsMeta ?? null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not suggest ideas",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSuggesting(false);
    }
  }

  function pickIdea(idea: StoryIdea) {
    setTitle(idea.title);
    setStoryDescription(idea.summary);
  }

  async function handleSubmit() {
    if (!title.trim() || !storyDescription.trim()) {
      toast({
        variant: "destructive",
        title: "Missing info",
        description: "Title and brief are required.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          projectDnaId,
          storyDescription,
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
          ...apiModels,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      router.push(`/publications/${data.id}`);
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
            <Label htmlFor="pub-title">Post title</Label>
            <Input
              id="pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 5 signs you're overtraining"
            />
          </div>
          <div>
            <Label htmlFor="pub-desc">Post brief</Label>
            <p className="mb-1.5 text-2xs text-muted-foreground">
              Hook, angle and what each slide should convey.
            </p>
            <Textarea
              id="pub-desc"
              value={storyDescription}
              onChange={(e) => setStoryDescription(e.target.value)}
              placeholder="Describe the carousel or single post…"
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
            Create publication
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4 xl:sticky xl:top-4">
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
            onClick={handleSuggest}
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
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {topPicks.length > 0 ? (
              <ul className="space-y-1">
                {topPicks.map((pick) => (
                  <li key={pick.candidateId}>
                    <button
                      type="button"
                      onClick={() => pickIdea(pick)}
                      className="w-full rounded-md border border-amber-400/40 bg-amber-500/[0.04] px-2 py-1.5 text-left text-xs hover:bg-amber-500/[0.08]"
                    >
                      <span className="font-medium">#{pick.rank} {pick.title}</span>
                      <p className="line-clamp-2 text-2xs text-muted-foreground">{pick.summary}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {aiIdeas.map((idea, i) => (
              <button
                key={`ai-${i}`}
                type="button"
                onClick={() => pickIdea(idea)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-accent/40"
              >
                <span className="font-medium">{idea.title}</span>
                <p className="line-clamp-2 text-2xs text-muted-foreground">{idea.summary}</p>
              </button>
            ))}
            {trendIdeas.length > 0 ? (
              <div className="border-t border-border pt-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> Trends
                </p>
                {trendIdeas.map((idea, i) => (
                  <button
                    key={`trend-${i}`}
                    type="button"
                    onClick={() => pickIdea(idea)}
                    className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-orange-400/40"
                  >
                    <span className="font-medium">{idea.title}</span>
                    <p className="line-clamp-2 text-2xs text-muted-foreground">{idea.summary}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}