"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, TrendingUp, Crown, Award } from "lucide-react";
import type { Avatar, ProjectDna, Scenario } from "@/lib/db/schema";
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
import { VideoFormatPicker } from "@/components/VideoFormatPicker";
import type { VideoFormat } from "@/lib/video-format";
import { isVideoFormat, normalizeVideoFormat } from "@/lib/video-format";
import {
  loadProjectFormPreferences,
  saveProjectFormPreferences,
} from "@/lib/project-form-preferences";
import { AvatarCastPicker, type AvatarCastValue } from "@/components/AvatarCastPicker";
import { ProjectDnaPicker } from "@/components/ProjectDnaPicker";
import { ScenarioPicker } from "@/components/ScenarioPicker";
import { IconChipPicker } from "@/components/IconChipPicker";
import {
  PROJECT_GENRE_IDS,
  PROJECT_GENRES,
  PROJECT_VISUAL_STYLE_IDS,
  PROJECT_VISUAL_STYLES,
} from "@/lib/project-creative-options";
import {
  EPISODE_STORY_HINT,
  EPISODE_STORY_LABEL,
  EPISODE_TITLE_LABEL,
  PROJECT_IDENTITY_HINT,
  PROJECT_IDENTITY_LABEL,
} from "@/lib/project-identity";
import { CutPacePicker } from "@/components/CutPacePicker";
import { ProjectScriptLanguagePicker } from "@/components/ProjectScriptLanguagePicker";
import {
  normalizeCutPace,
  type CutPaceId,
} from "@/lib/cut-pace";
import {
  DEFAULT_PROJECT_DURATION_SECONDS,
  isValidProjectDuration,
  PROJECT_DURATIONS,
} from "@/lib/project-durations";
import {
  normalizeProjectScriptLanguage,
  type ProjectScriptLanguage,
} from "@/lib/project-language";
import type {
  StoryIdea,
  TopStoryPick,
  TrendStoryIdea,
  TrendSuggestionsMeta,
} from "@/lib/story-suggestions-server";
import { cn } from "@/lib/utils";
import { dnaStyleDefaultsForForms } from "@/lib/dna-style";
import { readDnaProjectDefaults } from "@/lib/dna-project-defaults";


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

const DURATIONS = PROJECT_DURATIONS;

function teaserText(text: string, max = 88): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function SuggestIdeaCard({
  idea,
  index,
  variant,
  topRank,
  onPick,
}: {
  idea: StoryIdea | TrendStoryIdea;
  index: number;
  variant: "ai" | "trend";
  topRank?: 1 | 2 | 3;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={`${idea.title}\n\n${idea.summary}`}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-left transition-colors",
          topRank
            ? "border-amber-400/40 bg-amber-500/[0.03] hover:border-amber-400/60 hover:bg-amber-500/[0.06]"
            : "border-border/80",
          !topRank &&
            (variant === "ai"
              ? "hover:border-accent/45 hover:bg-muted/50"
              : "hover:border-orange-400/35 hover:bg-orange-500/[0.04]"),
        )}
      >
        <span
          className={cn(
            "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums",
            topRank
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
              : variant === "ai"
                ? "bg-accent/12 text-accent"
                : "bg-orange-500/12 text-orange-700 dark:text-orange-300",
          )}
        >
          {topRank ?? index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold leading-tight text-foreground">
              {idea.title}
            </span>
            {topRank ? (
              <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[8px] font-semibold uppercase text-amber-800 dark:text-amber-200">
                T{topRank}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[10px] leading-snug text-muted-foreground">
            {teaserText(idea.summary, 72)}
          </span>
        </span>
      </button>
    </li>
  );
}

function TopPickHero({ pick, onPick }: { pick: TopStoryPick; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-500/10 via-background to-background p-2.5 text-left shadow-sm transition-colors hover:border-amber-400/70 hover:from-amber-500/15"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          <Crown className="h-3 w-3" />
          Top pick
        </span>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
            pick.source === "trend"
              ? "bg-orange-500/15 text-orange-800 dark:text-orange-200"
              : "bg-accent/12 text-accent",
          )}
        >
          {pick.source === "trend" ? "Trend" : "AI"}
        </span>
      </div>
      <div className="truncate text-xs font-semibold leading-snug text-foreground">{pick.title}</div>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{teaserText(pick.summary, 90)}</p>
      <p className="mt-1.5 truncate rounded-md bg-muted/60 px-2 py-1 text-[10px] text-foreground/80">
        <span className="font-medium text-foreground">Why: </span>
        {teaserText(pick.rationale, 100)}
      </p>
    </button>
  );
}

function TopPickSecondary({ pick, onPick }: { pick: TopStoryPick; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex h-full w-full flex-col rounded-lg border border-border/80 bg-background px-2 py-1.5 text-left transition-colors hover:border-amber-400/40 hover:bg-muted/40"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Award className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          #{pick.rank}
        </span>
        <span
          className={cn(
            "ml-auto rounded px-1 py-0.5 text-[8px] font-medium uppercase",
            pick.source === "trend" ? "text-orange-700 dark:text-orange-300" : "text-accent",
          )}
        >
          {pick.source === "trend" ? "Trend" : "AI"}
        </span>
      </div>
      <div className="truncate text-[11px] font-semibold leading-snug">{pick.title}</div>
      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{teaserText(pick.rationale, 64)}</p>
    </button>
  );
}

function TopPicksPanel({
  picks,
  onPick,
}: {
  picks: TopStoryPick[];
  onPick: (pick: TopStoryPick) => void;
}) {
  const primary = picks.find((p) => p.rank === 1);
  const secondary = picks.filter((p) => p.rank === 2 || p.rank === 3).sort((a, b) => a.rank - b.rank);
  if (!primary) return null;

  return (
    <section className="space-y-2.5 rounded-xl border border-amber-400/25 bg-amber-500/[0.03] p-2.5">
      <div className="px-0.5">
        <h3 className="text-2xs font-semibold text-foreground">AI top 3 — re-analyzed</h3>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Best videos to make now, ranked from all AI + trend pitches.
        </p>
      </div>
      <TopPickHero pick={primary} onPick={() => onPick(primary)} />
      {secondary.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {secondary.map((pick) => (
            <TopPickSecondary key={pick.candidateId} pick={pick} onPick={() => onPick(pick)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SuggestSectionHeader({
  icon: Icon,
  title,
  hint,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
        <h3 className="text-2xs font-semibold text-foreground">{title}</h3>
      </div>
      {hint ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function NewProjectForm({
  avatars = [],
  projectDna = [],
  scenarios = [],
  defaultDnaId = null,
}: {
  avatars?: Avatar[];
  projectDna?: ProjectDna[];
  scenarios?: Scenario[];
  defaultDnaId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [projectDnaId, setProjectDnaId] = React.useState<string | null>(defaultDnaId);
  const [scenarioId, setScenarioId] = React.useState<string | null>(null);
  const [storyDescription, setStoryDescription] = React.useState("");
  const [genre, setGenre] = React.useState("Children");
  const [visualStyle, setVisualStyle] = React.useState("3D Render");
  const [voiceTone, setVoiceTone] = React.useState("Energetic");
  const [targetDurationSeconds, setTargetDurationSeconds] = React.useState(
    DEFAULT_PROJECT_DURATION_SECONDS,
  );
  const [videoFormat, setVideoFormat] = React.useState<VideoFormat>("horizontal");
  const [cutPace, setCutPace] = React.useState<CutPaceId>("balanced");
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
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);

  const applyDnaDefaults = React.useCallback((dna: ProjectDna) => {
    const style = dnaStyleDefaultsForForms(dna);
    if (style.genre && PROJECT_GENRE_IDS.includes(style.genre)) setGenre(style.genre);
    if (style.visualStyle && PROJECT_VISUAL_STYLE_IDS.includes(style.visualStyle)) {
      setVisualStyle(style.visualStyle);
    }
    if (style.voiceTone && TONES.includes(style.voiceTone)) setVoiceTone(style.voiceTone);

    const settings = readDnaProjectDefaults(dna);
    if (settings.videoFormat && isVideoFormat(settings.videoFormat)) {
      setVideoFormat(normalizeVideoFormat(settings.videoFormat));
    }
    if (settings.cutPace) setCutPace(normalizeCutPace(settings.cutPace));
    if (settings.scriptLanguage) {
      setScriptLanguage(normalizeProjectScriptLanguage(settings.scriptLanguage));
    }
    if (
      typeof settings.targetDurationSeconds === "number" &&
      isValidProjectDuration(settings.targetDurationSeconds)
    ) {
      setTargetDurationSeconds(settings.targetDurationSeconds);
    }

    setApiModels((prev) => ({
      ...prev,
      ...(settings.llmModel ? { llmModel: settings.llmModel } : {}),
      ...(settings.imageModel ? { imageModel: settings.imageModel } : {}),
      ...(settings.videoModel ? { videoModel: settings.videoModel } : {}),
      ...(settings.videoClipAudio
        ? { videoClipAudio: settings.videoClipAudio as ProjectApiModels["videoClipAudio"] }
        : {}),
      ...(settings.ttsModel ? { ttsModel: settings.ttsModel } : {}),
      ...(settings.ttsVoice ? { ttsVoice: settings.ttsVoice } : {}),
    }));
  }, []);

  React.useLayoutEffect(() => {
    const prefs = loadProjectFormPreferences();
    let selectedDnaId = defaultDnaId;
    if (prefs) {
      if (!defaultDnaId && prefs.projectDnaId) {
        setProjectDnaId(prefs.projectDnaId);
        selectedDnaId = prefs.projectDnaId;
      }
      if (prefs.genre && PROJECT_GENRE_IDS.includes(prefs.genre)) setGenre(prefs.genre);
      if (prefs.visualStyle && PROJECT_VISUAL_STYLE_IDS.includes(prefs.visualStyle))
        setVisualStyle(prefs.visualStyle);
      if (prefs.voiceTone && TONES.includes(prefs.voiceTone)) setVoiceTone(prefs.voiceTone);
      if (
        typeof prefs.targetDurationSeconds === "number" &&
        isValidProjectDuration(prefs.targetDurationSeconds)
      ) {
        setTargetDurationSeconds(prefs.targetDurationSeconds);
      }
      if (prefs.videoFormat && isVideoFormat(prefs.videoFormat)) {
        setVideoFormat(prefs.videoFormat);
      }
      if (prefs.cutPace) setCutPace(normalizeCutPace(prefs.cutPace));
      if (prefs.scriptLanguage) setScriptLanguage(normalizeProjectScriptLanguage(prefs.scriptLanguage));
      // Last-used API models act as the fallback when no DNA is selected.
      if (prefs.apiModels) {
        setApiModels((prev) => ({ ...prev, ...prefs.apiModels }));
      }
      if (prefs.avatarIds?.length) {
        setAvatarCast({
          selectedIds: prefs.avatarIds,
          primaryId: prefs.primaryAvatarId ?? prefs.avatarIds[0] ?? null,
        });
      } else if (prefs.avatarId && prefs.avatarId !== "none") {
        setAvatarCast({ selectedIds: [prefs.avatarId], primaryId: prefs.avatarId });
      }
    }
    // A selected DNA wins over the last-used fallback.
    if (selectedDnaId) {
      const dna = projectDna.find((d) => d.id === selectedDnaId);
      if (dna) applyDnaDefaults(dna);
    }
    setPrefsLoaded(true);
  }, [defaultDnaId, projectDna, applyDnaDefaults]);

  React.useEffect(() => {
    if (!prefsLoaded) return;
    saveProjectFormPreferences({
      projectDnaId,
      genre,
      visualStyle,
      voiceTone,
      targetDurationSeconds,
      videoFormat,
      cutPace,
      scriptLanguage,
      avatarIds: avatarCast.selectedIds,
      primaryAvatarId: avatarCast.primaryId,
      apiModels,
    });
  }, [
    prefsLoaded,
    projectDnaId,
    genre,
    visualStyle,
    voiceTone,
    targetDurationSeconds,
    videoFormat,
    cutPace,
    scriptLanguage,
    avatarCast,
    apiModels,
  ]);

  function selectVideoFormat(format: VideoFormat) {
    setVideoFormat(normalizeVideoFormat(format));
    if (format === "vertical" && targetDurationSeconds > 90) {
      setTargetDurationSeconds(30);
    }
  }

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
          targetDurationSeconds,
          videoFormat,
          projectDnaId: projectDnaId ?? undefined,
          scriptLanguage,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setAiIdeas(data.aiIdeas ?? data.ideas ?? []);
      setTrendIdeas(data.trendIdeas ?? []);
      setTopPicks(data.topPicks ?? []);
      setTrendsMeta(data.trendsMeta ?? null);
      if ((data.trendIdeas ?? []).length === 0 && data.trendsMeta?.error) {
        toast({
          title: "Trends unavailable",
          description: data.trendsMeta.error,
        });
      }
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

  function pickTopStory(pick: TopStoryPick) {
    setTitle(pick.title);
    setStoryDescription(pick.summary);
  }

  const topRankByCandidateId = React.useMemo(() => {
    const map = new Map<string, 1 | 2 | 3>();
    for (const pick of topPicks) {
      map.set(pick.candidateId, pick.rank);
    }
    return map;
  }, [topPicks]);

  const hasSuggestions = aiIdeas.length > 0 || trendIdeas.length > 0;

  function handleVisualStyleChange(next: string) {
    setVisualStyle(next);
    if (next === "Ultra Realistic" && apiModels.imageModel !== "black-forest-labs/flux.2-pro") {
      setApiModels((prev) => ({ ...prev, imageModel: "black-forest-labs/flux.2-pro" }));
      toast({
        title: "Image model set to Flux 2 Pro",
        description: "Best for photorealistic results — change it in API settings if needed.",
      });
    }
  }

  function selectDna(id: string | null) {
    setProjectDnaId(id);
    if (!id) return;
    const dna = projectDna.find((d) => d.id === id);
    if (!dna) return;
    applyDnaDefaults(dna);
  }

  async function handleSubmit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    if (!title.trim() || !storyDescription.trim()) {
      toast({
        variant: "destructive",
        title: "Missing info",
        description: "Title and description are required.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          projectDnaId,
          scenarioId,
          storyDescription,
          genre,
          visualStyle,
          voiceTone,
          targetDurationSeconds,
          videoFormat,
          cutPace,
          scriptLanguage,
          avatarId: avatarCast.primaryId,
          avatarIds: avatarCast.selectedIds,
          ...apiModels,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      router.push(`/projects/${data.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not create project",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_min(26rem,34vw)]">
      <div className="space-y-2.5 rounded-lg border border-border bg-background p-3">
        <div className="grid grid-cols-1 gap-2.5">
          <div>
            <Label>{PROJECT_IDENTITY_LABEL}</Label>
            <p className="mb-1 text-2xs text-muted-foreground">{PROJECT_IDENTITY_HINT}</p>
            <ProjectDnaPicker
              items={projectDna}
              value={projectDnaId}
              onChange={selectDna}
            />
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">{EPISODE_TITLE_LABEL}</Label>
              <Input
                id="title"
                className="mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 5 at-home glute exercises"
              />
            </div>
            <div>
              <Label htmlFor="desc">{EPISODE_STORY_LABEL}</Label>
              <Textarea
                id="desc"
                value={storyDescription}
                onChange={(e) => setStoryDescription(e.target.value)}
                placeholder={EPISODE_STORY_HINT}
                className="mt-1 min-h-[64px]"
                rows={2}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <Label>Video format</Label>
              <div className="mt-1">
                <VideoFormatPicker value={videoFormat} onChange={selectVideoFormat} compact />
              </div>
            </div>
            <div>
              <Label>Script language</Label>
              <div className="mt-1">
                <ProjectScriptLanguagePicker
                  value={scriptLanguage}
                  onChange={setScriptLanguage}
                  compact
                />
              </div>
            </div>
          </div>
          <div>
            <Label>Cut pace</Label>
            <div className="mt-1">
              <CutPacePicker value={cutPace} onChange={setCutPace} compact />
            </div>
          </div>
          <div>
            <Label>Genre</Label>
            <div className="mt-1">
              <IconChipPicker
                options={PROJECT_GENRES}
                value={genre}
                onChange={setGenre}
                ariaLabel="Genre"
                compact
              />
            </div>
          </div>
          <div>
            <Label>Visual style</Label>
            <div className="mt-1">
              <IconChipPicker
                options={PROJECT_VISUAL_STYLES}
                value={visualStyle}
                onChange={handleVisualStyleChange}
                ariaLabel="Visual style"
                compact
              />
            </div>
          </div>
          <div>
            <Label>Scenario / environment</Label>
            <p className="mb-1 text-2xs text-muted-foreground">
              Optional — reuse a real or AI location as the setting for every scene. Override per
              scene later.
            </p>
            <ScenarioPicker items={scenarios} value={scenarioId} onChange={setScenarioId} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label>Voice tone</Label>
              <Select value={voiceTone} onValueChange={setVoiceTone}>
                <SelectTrigger className="mt-1">
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
            <div>
              <Label>Target duration</Label>
              <Select
                value={String(targetDurationSeconds)}
                onValueChange={(v) => setTargetDurationSeconds(Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Cast (optional)</Label>
              <Link
                href="/avatars"
                className="text-2xs text-muted-foreground hover:text-foreground"
              >
                Manage avatars
              </Link>
            </div>
            <div className="mt-1">
              <AvatarCastPicker avatars={avatars} value={avatarCast} onChange={setAvatarCast} />
            </div>
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
            Create project
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Suggest for me</h2>
            <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
              5 AI + 5 trends, then AI re-ranks the top 3 for you.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
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
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-2xs text-muted-foreground">Ideas, trends & top 3 ranking…</p>
          </div>
        ) : !hasSuggestions ? (
          <p className="rounded-lg border border-dashed border-border bg-background px-3 py-8 text-center text-2xs leading-relaxed text-muted-foreground">
            Click Generate for story ideas and what&apos;s trending now.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {topPicks.length > 0 ? <TopPicksPanel picks={topPicks} onPick={pickTopStory} /> : null}

            <div className="space-y-3 border-t border-border/70 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                All suggestions
              </p>

              <section className="space-y-2">
                <SuggestSectionHeader icon={Sparkles} title="AI ideas" iconClassName="text-accent" />
                {aiIdeas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/80 px-2.5 py-3 text-2xs text-muted-foreground">
                    No AI ideas returned.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {aiIdeas.map((idea, i) => (
                      <SuggestIdeaCard
                        key={`ai-${i}`}
                        idea={idea}
                        index={i}
                        variant="ai"
                        topRank={topRankByCandidateId.get(`ai-${i}`)}
                        onPick={() => pickIdea(idea)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SuggestSectionHeader
                  icon={TrendingUp}
                  title="Trends"
                  hint={
                    trendsMeta?.provider
                      ? `last ${trendsMeta.freshnessWindow ?? "24h"} · ${trendsMeta.provider}`
                      : undefined
                  }
                  iconClassName="text-orange-500"
                />
                {trendIdeas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/80 px-2.5 py-3 text-2xs leading-relaxed text-muted-foreground">
                    {trendsMeta?.error ??
                      "No trends yet — add SERPER_API_KEY in .env.local for live web trends."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {trendIdeas.map((idea, i) => (
                      <SuggestIdeaCard
                        key={`trend-${i}`}
                        idea={idea}
                        index={i}
                        variant="trend"
                        topRank={topRankByCandidateId.get(`trend-${i}`)}
                        onPick={() => pickIdea(idea)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
