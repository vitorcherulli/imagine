"use client";

import * as React from "react";
import { Loader2, Music, Repeat, RotateCcw, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { useAudioWaveformDuration } from "@/components/timeline/AudioWaveform";
import {
  effectiveMusicSpanSeconds,
  MUSIC_SPAN_MAX,
  MUSIC_SPAN_MIN,
  MUSIC_START_MAX,
  normalizeMusicSpanSeconds,
  normalizeMusicStartSeconds,
} from "@/lib/music-timeline";
import {
  defaultMusic2TimelineStartSeconds,
  formatMusicShortLabel,
  musicNeedsLoopForTimeline,
  musicPlayableSeconds,
  musicShortTooltip,
} from "@/lib/music-duration-mismatch";

interface Props {
  project: Project;
  timelineTotalSeconds: number;
  onClose: () => void;
  onChange: (patch: Partial<Project>) => void;
}

const PRESETS = [
  { label: "Cinematic suspense", value: "Cinematic suspense score, dark synth pads, low pulsing bass, sparse hits, builds tension under voice-over. Instrumental only." },
  { label: "Warm uplifting", value: "Warm uplifting indie-folk instrumental, soft acoustic guitar, mellow piano, gentle drums, hopeful mood. Leave space for narration." },
  { label: "Mysterious documentary", value: "Mysterious documentary score, sparse plucked strings, ambient pads, subtle percussion, contemplative. Instrumental only, low dynamics." },
  { label: "Epic motivational", value: "Epic motivational orchestral, soaring strings, big drums in choruses, hopeful brass, mid-tempo cinematic. Instrumental only." },
  { label: "Lo-fi calm", value: "Lo-fi calm beat, dusty piano chords, soft brush drums, vinyl crackle, mellow mood. Instrumental only, low energy." },
];

export function MusicPanel({ project, timelineTotalSeconds, onClose, onChange }: Props) {
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState(project.musicPrompt ?? "");
  const [volume, setVolume] = React.useState(project.musicVolume ?? 30);
  const [musicStart, setMusicStart] = React.useState(
    normalizeMusicStartSeconds(project.musicStartSeconds),
  );
  const [fitToVideo, setFitToVideo] = React.useState(project.musicSpanSeconds == null);
  const [customSpan, setCustomSpan] = React.useState(
    normalizeMusicSpanSeconds(project.musicSpanSeconds) ??
      Math.max(MUSIC_SPAN_MIN, timelineTotalSeconds),
  );
  const [generating, setGenerating] = React.useState(project.musicStatus === "generating");
  const [generating2, setGenerating2] = React.useState(project.music2Status === "generating");
  const [uploading, setUploading] = React.useState(false);
  const [uploading2, setUploading2] = React.useState(false);
  const [savingVolume, setSavingVolume] = React.useState(false);
  const [savingTrim, setSavingTrim] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fileInput2Ref = React.useRef<HTMLInputElement>(null);
  const trimTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileDuration = useAudioWaveformDuration(project.musicUrl);
  const music2Duration = useAudioWaveformDuration(project.music2Url);
  const timelineSpan = effectiveMusicSpanSeconds(project, timelineTotalSeconds);
  const playablePrimary =
    fileDuration != null ? musicPlayableSeconds(fileDuration, musicStart) : null;
  const musicShort =
    project.musicUrl &&
    project.musicStatus === "ready" &&
    fileDuration != null &&
    !project.music2Url?.trim() &&
    musicNeedsLoopForTimeline(playablePrimary ?? fileDuration, timelineSpan);
  const music2StartDefault =
    playablePrimary ??
    defaultMusic2TimelineStartSeconds(fileDuration ?? 0, musicStart);
  const maxCustomSpan = Math.max(
    MUSIC_SPAN_MIN,
    Math.min(MUSIC_SPAN_MAX, timelineTotalSeconds, fileDuration ?? timelineTotalSeconds),
  );
  const maxStart = Math.max(
    0,
    Math.min(MUSIC_START_MAX, (fileDuration ?? MUSIC_START_MAX) - MUSIC_SPAN_MIN),
  );

  React.useEffect(() => {
    setGenerating(project.musicStatus === "generating");
    setGenerating2(project.music2Status === "generating");
  }, [project.musicStatus, project.music2Status]);

  React.useEffect(() => {
    return () => {
      if (trimTimerRef.current) clearTimeout(trimTimerRef.current);
    };
  }, []);

  function scheduleTrimSave(patch: {
    musicStartSeconds?: number;
    musicSpanSeconds?: number | null;
    fitToVideo?: boolean;
    customSpan?: number;
  }) {
    const nextStart = normalizeMusicStartSeconds(
      patch.musicStartSeconds ?? musicStart,
    );
    const nextFit = patch.fitToVideo ?? fitToVideo;
    const nextCustom =
      normalizeMusicSpanSeconds(patch.customSpan ?? customSpan) ?? timelineSpan;
    const nextSpan = nextFit ? null : nextCustom;

    if (patch.musicStartSeconds !== undefined) setMusicStart(nextStart);
    if (patch.fitToVideo !== undefined) setFitToVideo(nextFit);
    if (patch.customSpan !== undefined) setCustomSpan(nextCustom);

    if (trimTimerRef.current) clearTimeout(trimTimerRef.current);
    trimTimerRef.current = setTimeout(() => {
      void persistTrim(nextStart, nextSpan);
    }, 500);
  }

  async function persistTrim(startSeconds: number, spanSeconds: number | null) {
    setSavingTrim(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          musicStartSeconds: startSeconds,
          musicSpanSeconds: spanSeconds,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange({
        musicStartSeconds: startSeconds,
        musicSpanSeconds: spanSeconds,
      });
    } catch {
      toast({ variant: "destructive", title: "Could not save music trim" });
    } finally {
      setSavingTrim(false);
    }
  }

  async function generate() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) {
      toast({
        variant: "destructive",
        title: "Prompt required",
        description: "Describe the music you want before generating.",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onChange({
        musicStatus: "generating",
        musicPrompt: data.prompt ?? nextPrompt,
        musicUrl: null,
      });
      toast({ title: "Generating music…", description: "This usually takes 20-60 seconds." });
    } catch (err) {
      setGenerating(false);
      toast({
        title: "Music generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function uploadTrack(file: File, slot: 1 | 2) {
    const setBusy = slot === 2 ? setUploading2 : setUploading;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("slot", String(slot));
      if (slot === 2 && fileDuration != null) {
        form.append("file1DurationSeconds", String(fileDuration));
        form.append("music2TimelineStartSeconds", String(music2StartDefault));
      }
      const res = await fetch(`/api/projects/${project.id}/music/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : (await res.text()) || `HTTP ${res.status}`,
        );
      }
      const data = await res.json();
      if (slot === 2) {
        onChange({
          music2Url: data.music2Url,
          music2Status: "ready",
          music2TimelineStartSeconds: data.music2TimelineStartSeconds ?? music2StartDefault,
        });
        toast({ title: "2ª trilha adicionada", description: file.name });
      } else {
        onChange({ musicUrl: data.musicUrl, musicStatus: "ready" });
        toast({ title: "Music uploaded", description: file.name });
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (slot === 1 && fileInputRef.current) fileInputRef.current.value = "";
      if (slot === 2 && fileInput2Ref.current) fileInput2Ref.current.value = "";
    }
  }

  async function generateSecond() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) {
      toast({
        variant: "destructive",
        title: "Prompt required",
        description: "Use the same prompt or edit it for the continuation track.",
      });
      return;
    }
    setGenerating2(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          slot: "2",
          music2TimelineStartSeconds: music2StartDefault,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onChange({
        music2Status: "generating",
        music2Prompt: data.prompt ?? nextPrompt,
        music2Url: null,
        music2TimelineStartSeconds: data.music2TimelineStartSeconds ?? music2StartDefault,
      });
      toast({ title: "Gerando 2ª trilha…", description: "Continuação após a primeira faixa." });
    } catch (err) {
      setGenerating2(false);
      toast({
        variant: "destructive",
        title: "Geração falhou",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function removeSecond() {
    if (!confirm("Remover a 2ª trilha?")) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/music?slot=2`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onChange({
        music2Url: null,
        music2Status: "none",
        music2Prompt: null,
        music2TimelineStartSeconds: null,
      });
      toast({ title: "2ª trilha removida" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not remove",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function remove() {
    if (!confirm("Remove background music from this project?")) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onChange({
        musicUrl: null,
        musicStatus: "none",
        music2Url: null,
        music2Status: "none",
        music2TimelineStartSeconds: null,
      });
      toast({ title: "Music removed" });
    } catch (err) {
      toast({
        title: "Could not remove",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadTrack(file, 1);
  }

  function handleFile2Change(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadTrack(file, 2);
  }

  async function saveVolume(next: number) {
    setVolume(next);
    setSavingVolume(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ musicVolume: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange({ musicVolume: next });
    } catch {
      // silent
    } finally {
      setSavingVolume(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Background music</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <Label htmlFor="music-prompt">Prompt</Label>
            <Textarea
              id="music-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the music mood, genre, instruments. Instrumental only — no vocals."
              rows={4}
            />
            <p className="mt-1 text-2xs text-muted-foreground">
              Generated with Lyria 3 ($0.08/song). Instrumental — sits under narration.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPrompt(p.value)}
                disabled={generating || uploading}
                className="rounded-full border border-border px-2 py-0.5 text-2xs hover:border-accent/40 hover:bg-muted/60 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative flex items-center gap-3 py-0.5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-2xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {project.musicUrl && project.musicStatus === "ready" && musicShort && fileDuration != null ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="flex items-start gap-2 text-xs leading-snug text-amber-950 dark:text-amber-100">
                <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium">
                    {formatMusicShortLabel({
                      fileDurationSec: playablePrimary ?? fileDuration,
                      timelineSpanSec: timelineSpan,
                    })}
                  </p>
                  <p className="text-[11px] text-amber-900/85 dark:text-amber-100/85">
                    {musicShortTooltip(
                      {
                        fileDurationSec: playablePrimary ?? fileDuration,
                        timelineSpanSec: timelineSpan,
                      },
                      Boolean(project.music2Url),
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-amber-500/50 text-[10px]"
                      disabled={uploading || generating}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3 w-3" />
                      Upload trilha mais longa
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-amber-500/50 text-[10px]"
                      disabled={generating || uploading}
                      onClick={() => void generate()}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Regerar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-amber-500/50 text-[10px]"
                      disabled={uploading2 || generating2 || uploading}
                      onClick={() => fileInput2Ref.current?.click()}
                    >
                      <Upload className="h-3 w-3" />
                      2ª trilha (upload)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-amber-500/50 text-[10px]"
                      disabled={generating2 || uploading2}
                      onClick={() => void generateSecond()}
                    >
                      <Sparkles className="h-3 w-3" />
                      2ª trilha (IA)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/flac,audio/ogg,audio/webm,audio/aac,audio/mp4,audio/x-m4a,.mp3,.wav,.flac,.ogg,.webm,.aac,.m4a"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={fileInput2Ref}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/flac,audio/ogg,audio/webm,audio/aac,audio/mp4,audio/x-m4a,.mp3,.wav,.flac,.ogg,.webm,.aac,.m4a"
              className="hidden"
              onChange={handleFile2Change}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={generating || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload your track"}
            </Button>
            <p className="mt-1 text-2xs text-muted-foreground">
              MP3, WAV, FLAC, OGG, M4A, AAC or WebM — up to 50MB. Replaces any current background
              music.
            </p>
          </div>

          {project.musicUrl && project.musicStatus === "ready" && (
            <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Timeline length</Label>
                {savingTrim ? (
                  <span className="text-2xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> saving…
                  </span>
                ) : null}
              </div>
              <p className="text-2xs text-muted-foreground">
                Video is {timelineTotalSeconds.toFixed(1)}s
                {fileDuration != null ? ` · music file is ${fileDuration.toFixed(1)}s` : ""}. By
                default the score matches the video — shorten it below if you want music to end
                earlier.
              </p>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-2xs text-muted-foreground">Start in file</span>
                  <span className="text-2xs font-mono">{musicStart.toFixed(1)}s</span>
                </div>
                <Slider
                  value={[musicStart]}
                  min={0}
                  max={maxStart}
                  step={0.5}
                  disabled={!fileDuration}
                  onValueChange={(v) => scheduleTrimSave({ musicStartSeconds: v[0] })}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-2xs">
                <input
                  type="radio"
                  name="music-span-mode"
                  checked={fitToVideo}
                  onChange={() => scheduleTrimSave({ fitToVideo: true })}
                />
                Match video ({timelineTotalSeconds.toFixed(1)}s on timeline)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-2xs">
                <input
                  type="radio"
                  name="music-span-mode"
                  checked={!fitToVideo}
                  onChange={() => scheduleTrimSave({ fitToVideo: false })}
                />
                Custom length on timeline
              </label>
              {!fitToVideo ? (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-2xs text-muted-foreground">Play for</span>
                    <span className="text-2xs font-mono">{customSpan.toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[customSpan]}
                    min={MUSIC_SPAN_MIN}
                    max={maxCustomSpan}
                    step={0.5}
                    onValueChange={(v) => scheduleTrimSave({ fitToVideo: false, customSpan: v[0] })}
                  />
                </div>
              ) : null}
              <p className="text-2xs text-muted-foreground">
                Music plays for {timelineSpan.toFixed(1)}s on the timeline
                {musicStart > 0 ? `, starting at ${musicStart.toFixed(1)}s in the file` : ""}.
              </p>
            </div>
          )}

          {project.musicUrl && project.musicStatus === "ready" && (
            <div>
              <Label>Preview</Label>
              <audio
                key={project.musicUrl}
                src={project.musicUrl}
                controls
                className="mt-1 h-8 w-full"
              />
            </div>
          )}
          {project.music2Url && project.music2Status === "ready" ? (
            <div className="space-y-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">2ª trilha</Label>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => void removeSecond()}>
                  <Trash2 className="h-3 w-3" />
                  Remover
                </Button>
              </div>
              <p className="text-2xs text-muted-foreground">
                Começa em{" "}
                {(project.music2TimelineStartSeconds ?? music2StartDefault).toFixed(1)}s na timeline
                {music2Duration != null ? ` · arquivo ${music2Duration.toFixed(1)}s` : ""}.
              </p>
              <audio key={project.music2Url} src={project.music2Url} controls className="h-8 w-full" />
            </div>
          ) : null}
          {project.music2Status === "generating" ? (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Gerando 2ª trilha…
            </p>
          ) : null}

          {project.musicStatus === "generating" && (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating new track from your prompt…
            </p>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label>Music volume</Label>
              <span className="text-2xs text-muted-foreground">
                {volume}% {savingVolume && "·"}
              </span>
            </div>
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => saveVolume(v[0])}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
          {project.musicUrl ? (
            <Button variant="ghost" size="sm" onClick={remove} disabled={generating || uploading}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : (
            <span className="text-2xs text-muted-foreground">No music yet</span>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={generate}
              disabled={generating || uploading}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : project.musicUrl ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating
                ? "Generating…"
                : project.musicUrl
                  ? "Regenerate"
                  : "Generate music"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
