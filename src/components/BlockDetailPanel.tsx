"use client";

import * as React from "react";
import {
  Loader2,
  Image as ImageIcon,
  Film,
  AudioLines,
  Save,
  Trash2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import type { Block } from "@/components/timeline/types";
import { avatarSelectValue } from "@/components/timeline/types";
import type { Avatar } from "@/lib/db/schema";

interface Props {
  block: Block | null;
  avatars: Avatar[];
  projectAvatarId: string | null;
  projectAvatarName?: string | null;
  onPatched: (id: string, patch: Partial<Block>) => void;
  onRemoved: (id: string) => void;
}

export function BlockDetailPanel({
  block,
  avatars,
  projectAvatarId,
  projectAvatarName,
  onPatched,
  onRemoved,
}: Props) {
  const { toast } = useToast();
  const [narrativeText, setNarrativeText] = React.useState(block?.narrativeText ?? "");
  const [visualPrompt, setVisualPrompt] = React.useState(block?.visualPrompt ?? "");
  const [durationSeconds, setDurationSeconds] = React.useState(block?.durationSeconds ?? 8);
  const [segmentType, setSegmentType] = React.useState(block?.segmentType ?? "development");
  const [audioVolume, setAudioVolume] = React.useState(block?.audioVolume ?? 100);
  const [sceneAudioVolume, setSceneAudioVolume] = React.useState(
    block?.sceneAudioVolume ?? 60,
  );
  const [avatarChoice, setAvatarChoice] = React.useState(
    block ? avatarSelectValue(block) : "__inherit__",
  );
  const [saving, setSaving] = React.useState(false);
  const [savingVolume, setSavingVolume] = React.useState(false);
  const [savingSceneVolume, setSavingSceneVolume] = React.useState(false);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const lastBlockIdRef = React.useRef<string | null>(block?.id ?? null);
  const lastServerRef = React.useRef<{
    narrativeText: string;
    visualPrompt: string;
    durationSeconds: number;
    segmentType: string;
    audioVolume: number;
    sceneAudioVolume: number;
    avatarChoice: string;
  } | null>(
    block
      ? {
          narrativeText: block.narrativeText,
          visualPrompt: block.visualPrompt,
          durationSeconds: block.durationSeconds,
          segmentType: block.segmentType,
          audioVolume: block.audioVolume ?? 100,
          sceneAudioVolume: block.sceneAudioVolume ?? 60,
          avatarChoice: avatarSelectValue(block),
        }
      : null,
  );

  // Reset all fields when switching blocks. While staying on the same block,
  // accept fresh server values for any field the user hasn't edited locally.
  React.useEffect(() => {
    if (!block) return;
    const isNewBlock = lastBlockIdRef.current !== block.id;
    const prev = lastServerRef.current;
    const next = {
      narrativeText: block.narrativeText,
      visualPrompt: block.visualPrompt,
      durationSeconds: block.durationSeconds,
      segmentType: block.segmentType,
      audioVolume: block.audioVolume ?? 100,
      sceneAudioVolume: block.sceneAudioVolume ?? 60,
      avatarChoice: avatarSelectValue(block),
    };

    if (isNewBlock) {
      lastBlockIdRef.current = block.id;
      setNarrativeText(next.narrativeText);
      setVisualPrompt(next.visualPrompt);
      setDurationSeconds(next.durationSeconds);
      setSegmentType(next.segmentType);
      setAudioVolume(next.audioVolume);
      setSceneAudioVolume(next.sceneAudioVolume);
      setAvatarChoice(next.avatarChoice);
    } else if (prev) {
      if (narrativeText === prev.narrativeText && next.narrativeText !== prev.narrativeText) {
        setNarrativeText(next.narrativeText);
      }
      if (visualPrompt === prev.visualPrompt && next.visualPrompt !== prev.visualPrompt) {
        setVisualPrompt(next.visualPrompt);
      }
      if (durationSeconds === prev.durationSeconds && next.durationSeconds !== prev.durationSeconds) {
        setDurationSeconds(next.durationSeconds);
      }
      if (segmentType === prev.segmentType && next.segmentType !== prev.segmentType) {
        setSegmentType(next.segmentType);
      }
      if (audioVolume === prev.audioVolume && next.audioVolume !== prev.audioVolume) {
        setAudioVolume(next.audioVolume);
      }
      if (
        sceneAudioVolume === prev.sceneAudioVolume &&
        next.sceneAudioVolume !== prev.sceneAudioVolume
      ) {
        setSceneAudioVolume(next.sceneAudioVolume);
      }
      if (avatarChoice === prev.avatarChoice && next.avatarChoice !== prev.avatarChoice) {
        setAvatarChoice(next.avatarChoice);
      }
    }

    lastServerRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    block?.id,
    block?.narrativeText,
    block?.visualPrompt,
    block?.durationSeconds,
    block?.segmentType,
    block?.audioVolume,
    block?.sceneAudioVolume,
    block?.avatarId,
    block?.characterName,
  ]);

  if (!block) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col items-center justify-center border-l border-border bg-panel p-4 text-center">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-2xs text-muted-foreground">
          Select a block on the timeline to edit it.
        </p>
      </aside>
    );
  }

  async function saveAvatarChoice(next: string) {
    if (!block) return;
    setAvatarChoice(next);
    setSavingAvatar(true);
    const avatarId = next === "__inherit__" ? null : next === "__none__" ? "__none__" : next;
    const matched = avatars.find((a) => a.id === avatarId);
    const characterName =
      avatarId && avatarId !== "__none__" ? (matched?.name ?? block.characterName) : null;
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, characterName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { avatarId, characterName });
      toast({
        variant: "success",
        title:
          avatarId === "__none__"
            ? "No character on this block"
            : matched
              ? `Character: ${matched.name}`
              : "Using project default character",
      });
    } catch (err) {
      setAvatarChoice(avatarSelectValue(block));
      toast({
        variant: "destructive",
        title: "Could not save character",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveAudioVolume(next: number) {
    if (!block) return;
    setAudioVolume(next);
    setSavingVolume(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioVolume: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { audioVolume: next });
    } catch (err) {
      setAudioVolume(block.audioVolume ?? 100);
      toast({
        variant: "destructive",
        title: "Could not save volume",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingVolume(false);
    }
  }

  async function saveSceneAudioVolume(next: number) {
    if (!block) return;
    setSceneAudioVolume(next);
    setSavingSceneVolume(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneAudioVolume: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { sceneAudioVolume: next });
    } catch (err) {
      setSceneAudioVolume(block.sceneAudioVolume ?? 60);
      toast({
        variant: "destructive",
        title: "Could not save scene volume",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingSceneVolume(false);
    }
  }

  async function save() {
    if (!block) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          narrativeText,
          visualPrompt,
          durationSeconds,
          segmentType,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, {
        narrativeText,
        visualPrompt,
        durationSeconds,
        segmentType,
      });
      toast({ variant: "success", title: "Saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(kind: "keyframe" | "video" | "audio" | "media") {
    if (!block) return;
    const statusPatch: Partial<Block> = {
      status:
        kind === "keyframe"
          ? "image_generating"
          : kind === "video"
            ? "video_generating"
            : kind === "audio"
              ? "audio_generating"
              : "generating",
      errorMessage: null,
    };
    onPatched(block.id, statusPatch);
    try {
      const res = await fetch(`/api/blocks/${block.id}/${kind}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `Regenerating ${kind}…` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: `Regenerate ${kind} failed`,
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function remove() {
    if (!block) return;
    if (!confirm("Delete this block?")) return;
    try {
      const res = await fetch(`/api/blocks/${block.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onRemoved(block.id);
      toast({ variant: "success", title: "Block deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const dirty =
    narrativeText !== block.narrativeText ||
    visualPrompt !== block.visualPrompt ||
    durationSeconds !== block.durationSeconds ||
    segmentType !== block.segmentType;

  const generating =
    block.status === "generating" || block.status.endsWith("_generating");

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-panel">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Block #{block.position + 1}</h3>
            <p className="text-2xs text-muted-foreground">{block.segmentType}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={remove} title="Delete block">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {block.status === "error" && block.errorMessage && (
          <div className="mt-1.5 flex items-start gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-3">{block.errorMessage}</span>
          </div>
        )}
        {generating && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-2xs text-warning">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Generating… stay on the page.</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-3 scrollbar-thin">
        <div>
          <Label>Segment</Label>
          <Select value={segmentType} onValueChange={setSegmentType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["intro", "development", "climax", "resolution"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Character in scene</Label>
            {savingAvatar && (
              <span className="text-2xs text-muted-foreground">Saving…</span>
            )}
          </div>
          <Select value={avatarChoice} onValueChange={saveAvatarChoice} disabled={savingAvatar}>
            <SelectTrigger>
              <SelectValue placeholder="Choose character" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">
                Project default{projectAvatarName ? ` (${projectAvatarName})` : ""}
              </SelectItem>
              <SelectItem value="__none__">No character / scenery only</SelectItem>
              {avatars.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {block.characterName && avatarChoice !== "__none__" && (
            <p className="mt-1 text-2xs text-muted-foreground">
              Story assigned: {block.characterName}
            </p>
          )}
          <p className="mt-1 text-2xs text-muted-foreground">
            Used for keyframe and video generation on this block.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Duration (seconds)</Label>
            <span className="text-2xs text-muted-foreground">{durationSeconds}s</span>
          </div>
          <Input
            type="number"
            min={2}
            max={60}
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(Number(e.target.value))}
          />
        </div>

        <CollapsibleTextField
          label="Narration / script"
          storageKey="block-detail:narration-collapsed"
          value={narrativeText}
          onChange={setNarrativeText}
          minHeight="min-h-[110px]"
        />

        <div>
          <div className="flex items-center justify-between">
            <Label>Block narration volume</Label>
            <span className="text-2xs text-muted-foreground">
              {audioVolume}%{savingVolume ? " · saving…" : ""}
            </span>
          </div>
          <Slider
            value={[audioVolume]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => saveAudioVolume(v[0])}
            className="mt-1"
          />
          <p className="mt-1 text-2xs text-muted-foreground">
            Individual level for this clip. Combined with track + master on the timeline.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1">
              <Waves className="h-3 w-3 text-cyan-400" />
              Scene audio volume
            </Label>
            <span className="text-2xs text-muted-foreground">
              {sceneAudioVolume}%{savingSceneVolume ? " · saving…" : ""}
            </span>
          </div>
          <Slider
            value={[sceneAudioVolume]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => saveSceneAudioVolume(v[0])}
            className="mt-1"
            disabled={!block.sceneAudioUrl}
          />
          <p className="mt-1 text-2xs text-muted-foreground">
            {block.sceneAudioUrl
              ? "Ambient/character audio extracted from the AI-generated video clip."
              : "No scene audio (model returned silent video). Regenerate the video to retry."}
          </p>
        </div>

        <CollapsibleTextField
          label="Visual prompt"
          storageKey="block-detail:visual-collapsed"
          value={visualPrompt}
          onChange={setVisualPrompt}
          minHeight="min-h-[80px]"
        />

        <div className="space-y-2 rounded-md border border-border bg-background p-2">
          <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Generated media
          </h4>
          <MediaRow
            label="Keyframe"
            icon={<ImageIcon className="h-3 w-3" />}
            url={block.keyframeUrl ?? null}
            kind="image"
            onRegen={() => regenerate("keyframe")}
          />
          <MediaRow
            label="Video"
            icon={<Film className="h-3 w-3" />}
            url={block.videoUrl ?? null}
            kind="video"
            onRegen={() => regenerate("video")}
          />
          <MediaRow
            label="Narration"
            icon={<AudioLines className="h-3 w-3" />}
            url={block.audioUrl ?? null}
            kind="audio"
            onRegen={() => regenerate("audio")}
          />
          <MediaRow
            label="Scene audio"
            icon={<Waves className="h-3 w-3" />}
            url={block.sceneAudioUrl ?? null}
            kind="audio"
            onRegen={() => regenerate("video")}
            regenLabel="Regenerate video"
          />
          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => regenerate("media")}
              disabled={generating}
            >
              <RefreshCw className="h-3 w-3" />
              Regen all media
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <Badge variant={dirty ? "warning" : "outline"}>
          {dirty ? "Unsaved" : "Saved"}
        </Badge>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save changes
        </Button>
      </div>
    </aside>
  );
}

function readCollapsed(storageKey: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function CollapsibleTextField({
  label,
  storageKey,
  value,
  onChange,
  minHeight,
}: {
  label: string;
  storageKey: string;
  value: string;
  onChange: (value: string) => void;
  minHeight: string;
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readCollapsed(storageKey));
  }, [storageKey]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(storageKey, "1");
        else localStorage.removeItem(storageKey);
      } catch {
        // ignore quota / private mode
      }
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-sm text-left hover:bg-muted/50"
        aria-expanded={!collapsed}
      >
        <Label className="cursor-pointer">{label}</Label>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("mt-1", minHeight)}
        />
      ) : (
        <p className="mt-1 line-clamp-2 rounded-md border border-border bg-background px-2 py-1.5 text-2xs text-muted-foreground">
          {value || "Empty"}
        </p>
      )}
    </div>
  );
}

function MediaRow({
  label,
  icon,
  url,
  kind,
  onRegen,
  regenLabel,
}: {
  label: string;
  icon: React.ReactNode;
  url: string | null;
  kind: "image" | "video" | "audio";
  onRegen: () => void;
  regenLabel?: string;
}) {
  return (
    <div className="rounded border border-border bg-panel p-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 text-2xs">
          {icon}
          <span>{label}</span>
          <Badge variant={url ? "success" : "default"} className="ml-1">
            {url ? "ready" : "missing"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRegen}
          title={regenLabel ?? `Regenerate ${label}`}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      {url && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mt-1 h-16 w-full rounded object-cover" />
      )}
      {url && kind === "video" && (
        <video src={url} controls className="mt-1 h-24 w-full rounded bg-black" />
      )}
      {url && kind === "audio" && (
        <audio src={url} controls className="mt-1 w-full" />
      )}
    </div>
  );
}
