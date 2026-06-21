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
  ChevronLeft,
  ChevronRight,
  Waves,
  Settings2,
  FileText,
  Volume2,
  Layers,
  Clock,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readBlockPanelCollapsed,
  writeBlockPanelCollapsed,
} from "@/lib/layout-preferences";
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
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";

interface Props {
  block: Block | null;
  avatars: Avatar[];
  projectAvatarId: string | null;
  projectAvatarName?: string | null;
  videoFormat?: VideoFormat | string | null;
  onPatched: (id: string, patch: Partial<Block>) => void;
  onRemoved: (id: string) => void;
}

export function BlockDetailPanel({
  block,
  avatars,
  projectAvatarId,
  projectAvatarName,
  videoFormat = "horizontal",
  onPatched,
  onRemoved,
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
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
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);
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

  React.useEffect(() => {
    setPanelCollapsed(readBlockPanelCollapsed());
  }, []);

  function togglePanelCollapsed() {
    setPanelCollapsed((prev) => {
      const next = !prev;
      writeBlockPanelCollapsed(next);
      return next;
    });
  }

  if (panelCollapsed) {
    return (
      <aside className="relative flex h-full w-10 shrink-0 flex-col items-center border-l border-border bg-panel py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={togglePanelCollapsed}
          title="Expand block panel"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {block ? (
          <span
            className="mt-4 text-2xs font-medium text-muted-foreground [writing-mode:vertical-rl]"
            title={`Block #${block.position + 1}`}
          >
            #{block.position + 1}
          </span>
        ) : (
          <span title="Block details">
            <ImageIcon className="mt-4 h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </aside>
    );
  }

  if (!block) {
    return (
      <aside className="relative flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-panel">
        <div className="flex items-center justify-end border-b border-border px-2 py-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePanelCollapsed}
            title="Collapse block panel"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-2xs text-muted-foreground">
            Select a block on the timeline to edit it.
          </p>
        </div>
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

  const mediaReadyCount = [
    block.keyframeUrl,
    block.videoUrl,
    block.audioUrl,
    block.sceneAudioUrl,
  ].filter(Boolean).length;

  return (
    <aside className="relative flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-panel">
      <div className="border-b border-border px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="truncate text-xs font-semibold">Block #{block.position + 1}</h3>
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] capitalize">
              {block.segmentType}
            </Badge>
            {dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={save}
              disabled={!dirty || saving}
              title="Save changes"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={togglePanelCollapsed}
              title="Collapse block panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={remove} title="Delete block">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {block.status === "error" && block.errorMessage && (
          <div className="mt-1 flex items-start gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
            <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
            <span className="line-clamp-2">{block.errorMessage}</span>
          </div>
        )}
        {generating && (
          <div className="mt-1 flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <span>Generating…</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-auto p-1.5 scrollbar-thin">
        <BlockPanelSection
          id="setup"
          icon={<Settings2 className="h-3 w-3" />}
          title="Setup"
          summary={`${segmentType} · ${durationSeconds}s`}
        >
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-[10px]">
                <Layers className="h-2.5 w-2.5" />
                Segment
              </Label>
              <Select value={segmentType} onValueChange={setSegmentType}>
                <SelectTrigger className="h-7 text-xs">
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
              <Label className="mb-0.5 flex items-center gap-1 text-[10px]">
                <Clock className="h-2.5 w-2.5" />
                Duration
              </Label>
              <Input
                type="number"
                min={2}
                max={60}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="mt-1.5">
            <Label
              className="mb-0.5 flex items-center gap-1 text-[10px]"
              title="Used for keyframe and video generation"
            >
              <UserRound className="h-2.5 w-2.5" />
              Character
              {savingAvatar && <Loader2 className="ml-1 h-2.5 w-2.5 animate-spin" />}
            </Label>
            <Select
              value={avatarChoice}
              onValueChange={saveAvatarChoice}
              disabled={savingAvatar}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Choose character" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  Project default{projectAvatarName ? ` (${projectAvatarName})` : ""}
                </SelectItem>
                <SelectItem value="__none__">No character</SelectItem>
                {avatars.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </BlockPanelSection>

        <BlockPanelSection
          id="content"
          icon={<FileText className="h-3 w-3" />}
          title="Script & visual"
          summary={
            narrativeText
              ? narrativeText.slice(0, 40) + (narrativeText.length > 40 ? "…" : "")
              : "Empty"
          }
        >
          <CollapsibleTextField
            label="Narration"
            storageKey="block-detail:narration-collapsed"
            defaultCollapsed
            value={narrativeText}
            onChange={setNarrativeText}
            minHeight="min-h-[72px]"
          />
          <CollapsibleTextField
            label="Visual prompt"
            storageKey="block-detail:visual-collapsed"
            defaultCollapsed
            value={visualPrompt}
            onChange={setVisualPrompt}
            minHeight="min-h-[56px]"
            className="mt-1.5"
          />
        </BlockPanelSection>

        <BlockPanelSection
          id="audio"
          icon={<Volume2 className="h-3 w-3" />}
          title="Audio levels"
          summary={`Narration ${audioVolume}% · Scene ${sceneAudioVolume}%`}
          defaultCollapsed
        >
          <div className="space-y-2">
            <CompactVolumeSlider
              icon={<AudioLines className="h-2.5 w-2.5" />}
              label="Narration"
              value={audioVolume}
              saving={savingVolume}
              onChange={saveAudioVolume}
              title="Clip level — combined with track + master on timeline"
            />
            <CompactVolumeSlider
              icon={<Waves className="h-2.5 w-2.5 text-cyan-400" />}
              label="Scene"
              value={sceneAudioVolume}
              saving={savingSceneVolume}
              onChange={saveSceneAudioVolume}
              disabled={!block.sceneAudioUrl}
              title={
                block.sceneAudioUrl
                  ? "Ambient audio from the generated video"
                  : "No scene audio — regenerate video to retry"
              }
            />
          </div>
        </BlockPanelSection>

        <BlockPanelSection
          id="media"
          icon={<Film className="h-3 w-3" />}
          title="Generated media"
          summary={`${mediaReadyCount}/4 ready`}
          defaultCollapsed
        >
          <div className="space-y-1">
            <MediaRow
              label="Keyframe"
              icon={<ImageIcon className="h-3 w-3" />}
              url={block.keyframeUrl ?? null}
              kind="image"
              previewClass={cn(
                "mt-1 w-full rounded object-contain bg-black",
                formatSpec.previewAspectClass,
                formatSpec.id === "vertical"
                  ? "mx-auto max-h-36 max-w-[100px]"
                  : "h-14 object-cover",
              )}
              onRegen={() => regenerate("keyframe")}
            />
            <MediaRow
              label="Video"
              icon={<Film className="h-3 w-3" />}
              url={block.videoUrl ?? null}
              kind="video"
              previewClass={cn(
                "mt-1 w-full rounded bg-black object-contain",
                formatSpec.previewAspectClass,
                formatSpec.id === "vertical" ? "mx-auto max-h-40 max-w-[100px]" : "h-20",
              )}
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
            <Button
              variant="primary"
              size="sm"
              className="mt-1 w-full"
              onClick={() => regenerate("media")}
              disabled={generating}
            >
              <RefreshCw className="h-3 w-3" />
              Regen all
            </Button>
          </div>
        </BlockPanelSection>
      </div>
    </aside>
  );
}

function readCollapsed(storageKey: string, defaultCollapsed = false): boolean {
  try {
    if (typeof window === "undefined") return defaultCollapsed;
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return defaultCollapsed;
    return stored === "1";
  } catch {
    return defaultCollapsed;
  }
}

function writeCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(storageKey, "1");
    else localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

function BlockPanelSection({
  id,
  icon,
  title,
  summary,
  defaultCollapsed = false,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary?: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `block-detail:section-${id}`;
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    setCollapsed(readCollapsed(storageKey, defaultCollapsed));
  }, [storageKey, defaultCollapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[11px] font-medium">{title}</span>
        {collapsed && summary && (
          <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && <div className="border-t border-border px-2 py-1.5">{children}</div>}
    </div>
  );
}

function CompactVolumeSlider({
  icon,
  label,
  value,
  saving,
  disabled,
  title,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  saving?: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div title={title}>
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {value}%{saving ? " …" : ""}
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        className="h-1"
      />
    </div>
  );
}

function CollapsibleTextField({
  label,
  storageKey,
  value,
  onChange,
  minHeight,
  defaultCollapsed = false,
  className,
}: {
  label: string;
  storageKey: string;
  value: string;
  onChange: (value: string) => void;
  minHeight: string;
  defaultCollapsed?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    setCollapsed(readCollapsed(storageKey, defaultCollapsed));
  }, [storageKey, defaultCollapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-1 rounded-sm text-left hover:bg-muted/30"
        aria-expanded={!collapsed}
      >
        <Label className="cursor-pointer text-[10px]">{label}</Label>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("mt-0.5 min-h-0 text-xs", minHeight)}
        />
      ) : (
        <p className="mt-0.5 line-clamp-1 rounded border border-border/60 bg-panel px-1.5 py-1 text-[10px] text-muted-foreground">
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
  previewClass,
  onRegen,
  regenLabel,
}: {
  label: string;
  icon: React.ReactNode;
  url: string | null;
  kind: "image" | "video" | "audio";
  previewClass?: string;
  onRegen: () => void;
  regenLabel?: string;
}) {
  return (
    <div className="rounded border border-border/80 bg-panel px-1.5 py-1">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1 text-[10px]">
          {icon}
          <span className="truncate">{label}</span>
          <Badge
            variant={url ? "success" : "default"}
            className="ml-0.5 shrink-0 px-1 py-0 text-[9px]"
          >
            {url ? "✓" : "—"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5"
          onClick={onRegen}
          title={regenLabel ?? `Regenerate ${label}`}
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </Button>
      </div>
      {url && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={previewClass ?? "mt-1 h-16 w-full rounded object-cover"} />
      )}
      {url && kind === "video" && (
        <video src={url} controls className={previewClass ?? "mt-1 h-24 w-full rounded bg-black"} />
      )}
      {url && kind === "audio" && (
        <audio src={url} controls className="mt-1 w-full" />
      )}
    </div>
  );
}
