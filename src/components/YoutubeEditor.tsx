"use client";

import * as React from "react";
import { Loader2, RefreshCw, Save, Image as ImageIcon, Trash2, UserSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { Avatar, Project, YoutubeMetadata } from "@/lib/db/schema";
import { cn, jsonSafeParse } from "@/lib/utils";
import { getVideoFormatSpec } from "@/lib/video-format";
import {
  normalizeThumbnailMode,
  THUMBNAIL_MODE_OPTIONS,
  type ThumbnailMode,
} from "@/lib/thumbnail-mode";

import { resolveProjectCast } from "@/lib/project-avatars";

interface Props {
  project: Project;
  initial: YoutubeMetadata | null;
  avatars?: Avatar[];
}

function resolveInitialCoverAvatarId(
  project: Project,
  initial: YoutubeMetadata | null,
  cast: Avatar[],
): string | null {
  if (initial?.coverAvatarId && cast.some((a) => a.id === initial.coverAvatarId)) {
    return initial.coverAvatarId;
  }
  return null;
}

export function YoutubeEditor({ project, initial, avatars = [] }: Props) {
  const { toast } = useToast();
  const formatSpec = getVideoFormatSpec(project.videoFormat);
  const isVertical = formatSpec.id === "vertical";
  const [data, setData] = React.useState<YoutubeMetadata | null>(initial);
  const [generating, setGenerating] = React.useState(false);
  const [generatingThumb, setGeneratingThumb] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedTitle, setSelectedTitle] = React.useState(initial?.selectedTitle ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [tags, setTags] = React.useState<string>(
    jsonSafeParse<string[]>(initial?.tags ?? "[]", []).join(", "),
  );
  const [thumbnailMode, setThumbnailMode] = React.useState<ThumbnailMode>(
    normalizeThumbnailMode(initial?.thumbnailMode),
  );
  const cast = React.useMemo(
    () => resolveProjectCast(project, avatars),
    [project, avatars],
  );
  const [coverAvatarId, setCoverAvatarId] = React.useState<string | null>(() =>
    resolveInitialCoverAvatarId(project, initial, cast),
  );
  const [deletingCover, setDeletingCover] = React.useState(false);

  const selectedAvatar = React.useMemo(
    () => cast.find((a) => a.id === coverAvatarId) ?? null,
    [cast, coverAvatarId],
  );
  const selectedAvatarPhotoCount = React.useMemo(() => {
    if (!selectedAvatar) return 0;
    try {
      const urls = JSON.parse(selectedAvatar.imageUrls || "[]") as string[];
      const ordered = [
        ...(selectedAvatar.primaryImageUrl ? [selectedAvatar.primaryImageUrl] : []),
        ...urls,
      ].filter((url, index, arr) => url && arr.indexOf(url) === index);
      return ordered.length;
    } catch {
      return selectedAvatar.primaryImageUrl ? 1 : 0;
    }
  }, [selectedAvatar]);

  const coverAvatarChanged =
    !!data?.thumbnailUrl &&
    !!coverAvatarId &&
    data.coverAvatarId !== coverAvatarId;

  const titleOptions = React.useMemo(
    () => jsonSafeParse<string[]>(data?.titleOptions ?? "[]", []),
    [data?.titleOptions],
  );

  async function callApi(body: {
    thumbnailMode?: ThumbnailMode;
    scope?: "all" | "thumbnail" | "metadata";
    avatarId?: string | null;
  }) {
    const res = await fetch(`/api/projects/${project.id}/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    return res.json();
  }

  function applyYoutubeRow(yt: YoutubeMetadata) {
    setData(yt);
    setSelectedTitle(yt.selectedTitle ?? "");
    setDescription(yt.description ?? "");
    setTags(jsonSafeParse<string[]>(yt.tags ?? "[]", []).join(", "));
    setThumbnailMode(normalizeThumbnailMode(yt.thumbnailMode));
    if (yt.coverAvatarId && cast.some((a) => a.id === yt.coverAvatarId)) {
      setCoverAvatarId(yt.coverAvatarId);
    }
  }

  function apiAvatarId() {
    return coverAvatarId;
  }

  async function generateAll() {
    setGenerating(true);
    try {
      const json = await callApi({ thumbnailMode, scope: "all", avatarId: apiAvatarId() });
      applyYoutubeRow(json.youtube);
      if (!json.youtube?.thumbnailUrl) {
        toast({
          variant: "destructive",
          title: "Metadata saved — cover missing",
          description: "Titles and description were generated but the cover image failed.",
        });
        return;
      }
      toast({ variant: "success", title: "Cover & metadata generated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function generateThumbnailOnly() {
    setGeneratingThumb(true);
    try {
      const json = await callApi({ thumbnailMode, scope: "thumbnail", avatarId: apiAvatarId() });
      applyYoutubeRow(json.youtube);
      toast({ variant: "success", title: "Cover regenerated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Cover generation failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setGeneratingThumb(false);
    }
  }

  async function deleteCover() {
    if (!data?.thumbnailUrl) return;
    if (!confirm("Remove the current cover? You can generate a new one afterward.")) return;
    setDeletingCover(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/youtube`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const json = await res.json();
      applyYoutubeRow(json.youtube);
      toast({ variant: "success", title: "Cover removed" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove cover",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setDeletingCover(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/youtube`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedTitle,
          description,
          thumbnailMode,
          coverAvatarId,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ variant: "success", title: "Saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setSaving(false);
    }
  }

  const thumbBusy = generating || generatingThumb || deletingCover;

  const coverAvatarPicker = (
    <div className="space-y-1.5">
      <Label className="text-2xs text-muted-foreground">Cover character (optional)</Label>
      <p className="text-[10px] text-muted-foreground">
        Pick an avatar to lock their face on the cover, or leave unselected to generate from the
        story visuals only.
      </p>
      {cast.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCoverAvatarId(null)}
            className={cn(
              "flex w-[4.25rem] flex-col items-center gap-1 rounded-md border p-1 transition-colors",
              coverAvatarId === null
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border hover:border-accent/30",
            )}
          >
            <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] text-muted-foreground">
              None
            </span>
            <span className="w-full truncate text-center text-[10px] font-medium">Story</span>
          </button>
          {cast.map((avatar) => {
            const selected = coverAvatarId === avatar.id;
            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => setCoverAvatarId(avatar.id)}
                className={cn(
                  "flex w-[4.25rem] flex-col items-center gap-1 rounded-md border p-1 transition-colors",
                  selected
                    ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                    : "border-border hover:border-accent/30",
                )}
              >
                <span className="relative h-10 w-10 overflow-hidden rounded-full bg-muted">
                  {avatar.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar.primaryImageUrl}
                      alt={avatar.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <UserSquare className="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium">
                  {avatar.name}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          No avatars yet — the cover will be generated from your story. Add avatars in{" "}
          <a href="/avatars" className="text-accent underline-offset-2 hover:underline">
            Avatars
          </a>{" "}
          if you want a specific person on the cover.
        </p>
      )}
      {selectedAvatar && selectedAvatarPhotoCount === 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-500">
          &quot;{selectedAvatar.name}&quot; has no photos — cover will use story visuals without
          identity lock.
        </p>
      )}
      {coverAvatarChanged && (
        <p className="text-[10px] text-amber-500">
          Avatar changed — click &quot;Regenerate Reels cover&quot; to apply.
        </p>
      )}
    </div>
  );

  const thumbnailModePicker = (
    <div className="space-y-1.5">
      <Label className="text-2xs text-muted-foreground">Cover style</Label>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {THUMBNAIL_MODE_OPTIONS.map((opt) => {
          const selected = thumbnailMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setThumbnailMode(opt.value)}
              className={cn(
                "rounded-md border px-2.5 py-2 text-left transition-colors",
                selected
                  ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                  : "border-border bg-panel hover:border-accent/40",
              )}
            >
              <div className="text-xs font-medium">{opt.label}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {opt.description}
              </div>
            </button>
          );
        })}
      </div>
      {thumbnailMode === "with_title" && (
        <p className="text-[10px] text-muted-foreground">
          Uses the selected title below in the cover typography.
        </p>
      )}
    </div>
  );

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel p-8 text-center">
        <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">
          {isVertical ? "Reels / Shorts cover" : "YouTube thumbnail"}
        </p>
        <p className="text-2xs text-muted-foreground">
          Generate cover ({formatSpec.thumbnailSizeLabel}), titles, description and tags for{" "}
          {formatSpec.platformHint}.
        </p>
        <div className="mx-auto mt-4 max-w-md space-y-3 text-left">
          {coverAvatarPicker}
          {thumbnailModePicker}
        </div>
        <Button
          onClick={generateAll}
          variant="primary"
          size="md"
          className="mt-4"
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Generate cover & metadata
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div>
          <Label>Title options</Label>
          <div className="mt-1 space-y-1.5">
            {titleOptions.map((t, i) => {
              const active = t === selectedTitle;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => setSelectedTitle(t)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-left text-xs ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-panel hover:border-accent/40"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Selected title (editable)</Label>
          <Input
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
            placeholder="Final title"
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
          />
        </div>
        <div>
          <Label>Tags (comma separated)</Label>
          <Textarea
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="min-h-[64px]"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={generateAll} disabled={thumbBusy}>
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Regenerate all
          </Button>
          <Button variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div
            className={cn(
              "mx-auto w-full bg-black",
              formatSpec.previewAspectClass,
              formatSpec.previewContainerClass,
            )}
          >
            {data.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xs text-white/60">
                No cover yet
              </div>
            )}
          </div>
          <div className="space-y-3 border-t border-border px-3 py-2">
            <div className="text-2xs text-muted-foreground">
              {formatSpec.thumbnailSizeLabel} · {formatSpec.platformHint}
            </div>
            {coverAvatarPicker}
            {thumbnailModePicker}
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={generateThumbnailOnly}
                disabled={thumbBusy || !data.thumbnailPrompt}
              >
                {generatingThumb ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImageIcon className="h-3 w-3" />
                )}
                {isVertical ? "Regenerate Reels cover" : "Regenerate thumbnail"}
              </Button>
              {data.thumbnailUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={deleteCover}
                  disabled={thumbBusy}
                >
                  {deletingCover ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Remove cover
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
