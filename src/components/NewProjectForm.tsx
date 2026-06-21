"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
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
import { VideoFormatPicker } from "@/components/VideoFormatPicker";
import type { VideoFormat } from "@/lib/video-format";
import { isVideoFormat, normalizeVideoFormat } from "@/lib/video-format";
import {
  loadProjectFormPreferences,
  saveProjectFormPreferences,
} from "@/lib/project-form-preferences";
import { AvatarCastPicker, type AvatarCastValue } from "@/components/AvatarCastPicker";
import { ProjectDnaPicker } from "@/components/ProjectDnaPicker";
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
import { CutPacePicker, NarrationModePicker } from "@/components/CutPacePicker";
import {
  normalizeCutPace,
  normalizeNarrationMode,
  type CutPaceId,
  type NarrationModeId,
} from "@/lib/cut-pace";
import {
  DEFAULT_PROJECT_DURATION_SECONDS,
  isValidProjectDuration,
  PROJECT_DURATIONS,
} from "@/lib/project-durations";


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

export function NewProjectForm({
  avatars = [],
  projectDna = [],
}: {
  avatars?: Avatar[];
  projectDna?: ProjectDna[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [projectDnaId, setProjectDnaId] = React.useState<string | null>(null);
  const [storyDescription, setStoryDescription] = React.useState("");
  const [genre, setGenre] = React.useState("Children");
  const [visualStyle, setVisualStyle] = React.useState("3D Render");
  const [voiceTone, setVoiceTone] = React.useState("Energetic");
  const [targetDurationSeconds, setTargetDurationSeconds] = React.useState(
    DEFAULT_PROJECT_DURATION_SECONDS,
  );
  const [videoFormat, setVideoFormat] = React.useState<VideoFormat>("horizontal");
  const [cutPace, setCutPace] = React.useState<CutPaceId>("balanced");
  const [narrationMode, setNarrationMode] = React.useState<NarrationModeId>("per_scene");
  const [avatarCast, setAvatarCast] = React.useState<AvatarCastValue>({
    selectedIds: [],
    primaryId: null,
  });
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(getDefaultApiModels);
  const [submitting, setSubmitting] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [ideas, setIdeas] = React.useState<Array<{ title: string; summary: string }>>([]);
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);

  React.useLayoutEffect(() => {
    const prefs = loadProjectFormPreferences();
    if (prefs) {
      if (prefs.projectDnaId) setProjectDnaId(prefs.projectDnaId);
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
      if (prefs.narrationMode) setNarrationMode(normalizeNarrationMode(prefs.narrationMode));
      if (prefs.avatarIds?.length) {
        setAvatarCast({
          selectedIds: prefs.avatarIds,
          primaryId: prefs.primaryAvatarId ?? prefs.avatarIds[0] ?? null,
        });
      } else if (prefs.avatarId && prefs.avatarId !== "none") {
        setAvatarCast({ selectedIds: [prefs.avatarId], primaryId: prefs.avatarId });
      }
    }
    setPrefsLoaded(true);
  }, []);

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
      narrationMode,
      avatarIds: avatarCast.selectedIds,
      primaryAvatarId: avatarCast.primaryId,
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
    narrationMode,
    avatarCast,
  ]);

  function selectVideoFormat(format: VideoFormat) {
    setVideoFormat(normalizeVideoFormat(format));
    if (format === "vertical" && targetDurationSeconds > 90) {
      setTargetDurationSeconds(30);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setIdeas([]);
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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      setIdeas(data.ideas ?? []);
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

  function pickIdea(idea: { title: string; summary: string }) {
    setTitle(idea.title);
    setStoryDescription(idea.summary);
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
          storyDescription,
          genre,
          visualStyle,
          voiceTone,
          targetDurationSeconds,
          videoFormat,
          cutPace,
          narrationMode,
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>{PROJECT_IDENTITY_LABEL}</Label>
            <p className="mb-1.5 text-2xs text-muted-foreground">{PROJECT_IDENTITY_HINT}</p>
            <ProjectDnaPicker
              items={projectDna}
              value={projectDnaId}
              onChange={setProjectDnaId}
            />
          </div>
          <div>
            <Label htmlFor="title">{EPISODE_TITLE_LABEL}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 5 at-home glute exercises"
            />
          </div>
          <div>
            <Label htmlFor="desc">{EPISODE_STORY_LABEL}</Label>
            <p className="mb-1.5 text-2xs text-muted-foreground">{EPISODE_STORY_HINT}</p>
            <Textarea
              id="desc"
              value={storyDescription}
              onChange={(e) => setStoryDescription(e.target.value)}
              placeholder="Describe the script for this specific video…"
              className="min-h-[120px]"
            />
          </div>
          <div>
            <Label>Video format</Label>
            <p className="mb-2 text-2xs text-muted-foreground">
              Choose horizontal for YouTube or vertical for Reels, Shorts and TikTok.
            </p>
            <VideoFormatPicker value={videoFormat} onChange={selectVideoFormat} />
          </div>
          <div>
            <Label>Cut pace</Label>
            <p className="mb-2 text-2xs text-muted-foreground">
              How fast images change on the timeline — independent of narration length.
            </p>
            <CutPacePicker value={cutPace} onChange={setCutPace} />
          </div>
          <div>
            <Label>Narration mode</Label>
            <p className="mb-2 text-2xs text-muted-foreground">
              Continuous: one voice segment with multiple visual cuts. Per scene: narration on each cut.
            </p>
            <NarrationModePicker value={narrationMode} onChange={setNarrationMode} />
          </div>
          <div>
            <Label>Genre</Label>
            <p className="mb-2 text-2xs text-muted-foreground">
              Choose the narrative tone of the video.
            </p>
            <IconChipPicker
              options={PROJECT_GENRES}
              value={genre}
              onChange={setGenre}
              ariaLabel="Genre"
            />
          </div>
          <div>
            <Label>Visual style</Label>
            <p className="mb-2 text-2xs text-muted-foreground">
              Defines the look of AI-generated scenes.
            </p>
            <IconChipPicker
              options={PROJECT_VISUAL_STYLES}
              value={visualStyle}
              onChange={setVisualStyle}
              ariaLabel="Visual style"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label>Target duration</Label>
              <Select
                value={String(targetDurationSeconds)}
                onValueChange={(v) => setTargetDurationSeconds(Number(v))}
              >
                <SelectTrigger>
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
            <div className="mt-1.5">
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

      <div className="space-y-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Suggest for me</h2>
            <p className="text-2xs text-muted-foreground">
              3 ideas aligned with DNA, genre, style, tone and duration.
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
        <div className="space-y-2">
          {ideas.length === 0 && (
            <p className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-2xs text-muted-foreground">
              Click Generate to get story ideas.
            </p>
          )}
          {ideas.map((idea, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickIdea(idea)}
              className="w-full rounded-md border border-border bg-background p-2.5 text-left transition-colors hover:border-accent/60 hover:bg-muted"
            >
              <div className="text-xs font-medium">{idea.title}</div>
              <div className="mt-0.5 line-clamp-3 text-2xs text-muted-foreground">
                {idea.summary}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
