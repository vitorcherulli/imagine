"use client";

import * as React from "react";
import { Loader2, Music, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";

interface Props {
  project: Project;
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

export function MusicPanel({ project, onClose, onChange }: Props) {
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState(project.musicPrompt ?? "");
  const [volume, setVolume] = React.useState(project.musicVolume ?? 30);
  const [generating, setGenerating] = React.useState(project.musicStatus === "generating");
  const [savingVolume, setSavingVolume] = React.useState(false);

  React.useEffect(() => {
    setGenerating(project.musicStatus === "generating");
  }, [project.musicStatus]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() || undefined }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onChange({ musicStatus: "generating", musicPrompt: data.prompt ?? prompt });
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

  async function remove() {
    if (!confirm("Remove background music from this project?")) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/music`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onChange({ musicUrl: null, musicStatus: "none" });
      toast({ title: "Music removed" });
    } catch (err) {
      toast({
        title: "Could not remove",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
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
                className="rounded-full border border-border px-2 py-0.5 text-2xs hover:border-accent/40 hover:bg-muted/60"
              >
                {p.label}
              </button>
            ))}
          </div>

          {project.musicUrl && (
            <div>
              <Label>Preview</Label>
              <audio src={project.musicUrl} controls className="mt-1 h-8 w-full" />
            </div>
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
            <Button variant="ghost" size="sm" onClick={remove} disabled={generating}>
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
              disabled={generating}
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
