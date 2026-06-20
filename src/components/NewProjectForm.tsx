"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, UserSquare } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
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

const GENRES = [
  "Drama",
  "Thriller",
  "Horror",
  "Sci-Fi",
  "Fantasy",
  "Motivational",
  "Documentary",
  "Children",
  "Comedy",
  "Mystery",
  "Romance",
];

const STYLES = [
  "Cinematic",
  "Anime",
  "Cartoon",
  "Realistic",
  "Watercolor",
  "3D Render",
  "Noir",
  "Pixel Art",
  "Storybook",
];

const TONES = [
  "Dramatic",
  "Calm",
  "Energetic",
  "Suspenseful",
  "Warm",
  "Mysterious",
  "Documentary",
  "Playful",
];

const DURATIONS = [
  { label: "1 min", value: 60 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
];

export function NewProjectForm({ avatars = [] }: { avatars?: Avatar[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [storyDescription, setStoryDescription] = React.useState("");
  const [genre, setGenre] = React.useState("Children");
  const [visualStyle, setVisualStyle] = React.useState("3D Render");
  const [voiceTone, setVoiceTone] = React.useState("Energetic");
  const [targetDurationSeconds, setTargetDurationSeconds] = React.useState(60);
  const [avatarId, setAvatarId] = React.useState<string>("none");
  const [apiModels, setApiModels] = React.useState<ProjectApiModels>(getDefaultApiModels);
  const [submitting, setSubmitting] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [ideas, setIdeas] = React.useState<Array<{ title: string; summary: string }>>([]);

  React.useEffect(() => {
    if (avatarId !== "none" || avatars.length === 0) return;
    const mia = avatars.find((a) => a.name.toLowerCase() === "mia");
    if (mia) setAvatarId(mia.id);
  }, [avatars, avatarId]);

  async function handleSuggest() {
    setSuggesting(true);
    setIdeas([]);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre, visualStyle, voiceTone, targetDurationSeconds }),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          storyDescription,
          genre,
          visualStyle,
          voiceTone,
          targetDurationSeconds,
          avatarId: avatarId === "none" ? null : avatarId,
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor="title">Project title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A cosmic tale of two robots"
            />
          </div>
          <div>
            <Label htmlFor="desc">Story description</Label>
            <Textarea
              id="desc"
              value={storyDescription}
              onChange={(e) => setStoryDescription(e.target.value)}
              placeholder="Describe the story you want to create…"
              className="min-h-[120px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Genre</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visual style</Label>
              <Select value={visualStyle} onValueChange={setVisualStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Avatar (optional)</Label>
              <Link
                href="/avatars"
                className="text-2xs text-muted-foreground hover:text-foreground"
              >
                Manage avatars
              </Link>
            </div>
            {avatars.length === 0 ? (
              <Link
                href="/avatars"
                className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-2xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
              >
                <UserSquare className="h-3.5 w-3.5" />
                No avatars yet — upload reference images to keep a character consistent across
                videos.
              </Link>
            ) : (
              <Select value={avatarId} onValueChange={setAvatarId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No avatar</SelectItem>
                  {avatars.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
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
              3 ideas based on your genre, style, tone & duration.
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
    </form>
  );
}
