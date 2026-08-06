"use client";

import * as React from "react";
import { Loader2, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import type { Scenario } from "@/lib/db/schema";
import { MAX_SCENARIO_IMAGES, parseScenarioImageUrls } from "@/lib/scenario-images";
import { SCENARIO_PERSPECTIVE_PRESETS } from "@/lib/scenario-perspective-presets";
import { IMAGE_MODEL_OPTIONS } from "@/lib/project-api-models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

interface Props {
  scenario: Scenario;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (scenario: Scenario) => void;
  onDeleted: () => void;
}

const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9 landscape" },
  { value: "9:16", label: "9:16 vertical" },
  { value: "1:1", label: "1:1 square" },
] as const;

/** ChatGPT image model — best at keeping the same place across new perspectives. */
const DEFAULT_SCENARIO_IMAGE_MODEL = "openai/gpt-5.4-image-2";

export function ScenarioEditDialog({ scenario, open, onOpenChange, onUpdated, onDeleted }: Props) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(scenario);
  const [name, setName] = React.useState(scenario.name);
  const [description, setDescription] = React.useState(scenario.description ?? "");
  const [imageModel, setImageModel] = React.useState(DEFAULT_SCENARIO_IMAGE_MODEL);
  const [aspectRatio, setAspectRatio] = React.useState<"16:9" | "9:16" | "1:1">("16:9");
  const [prompt, setPrompt] = React.useState("");
  const [sourceImageUrl, setSourceImageUrl] = React.useState<string | null>(null);
  const [perspectiveId, setPerspectiveId] = React.useState<string | null>(null);
  const [perspectivePrompt, setPerspectivePrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generatingPerspective, setGeneratingPerspective] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [savingMeta, setSavingMeta] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(scenario);
    setName(scenario.name);
    setDescription(scenario.description ?? "");
    setPrompt("");
    setSourceImageUrl(scenario.primaryImageUrl ?? null);
    setPerspectiveId(null);
    setPerspectivePrompt("");
  }, [scenario, open]);

  const images = parseScenarioImageUrls(draft);
  const atLimit = images.length >= MAX_SCENARIO_IMAGES;

  async function saveMeta() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
      toast({ title: "Scenario updated" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSavingMeta(false);
    }
  }

  async function setPrimary(url: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryImageUrl: url }),
      });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(url: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}/images`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
    } catch (err) {
      toast({
        title: "Could not remove image",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    if (atLimit) {
      toast({
        title: "Image limit reached",
        description: `Remove an image before adding more (max ${MAX_SCENARIO_IMAGES}).`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("images", f));
      const res = await fetch(`/api/scenarios/${draft.id}/images`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
      toast({ title: "Images uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    const p = prompt.trim();
    if (p.length < 3) {
      toast({
        title: "Describe the scene",
        description: "Write what the environment looks like.",
        variant: "destructive",
      });
      return;
    }
    if (atLimit) {
      toast({
        title: "Image limit reached",
        description: `Remove an image before generating (max ${MAX_SCENARIO_IMAGES}).`,
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p, imageModel, aspectRatio }),
      });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
      toast({ variant: "success", title: "Scenario image added" });
    } catch (err) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function generatePerspective() {
    const src = sourceImageUrl && images.includes(sourceImageUrl) ? sourceImageUrl : images[0];
    if (!src) {
      toast({
        title: "No source image",
        description: "Upload or generate an image first, then create perspectives from it.",
        variant: "destructive",
      });
      return;
    }
    const custom = perspectivePrompt.trim();
    if (!perspectiveId && !custom) {
      toast({
        title: "Choose a perspective",
        description: "Pick a preset angle or describe the new viewpoint.",
        variant: "destructive",
      });
      return;
    }
    if (atLimit) {
      toast({
        title: "Image limit reached",
        description: `Remove an image before generating (max ${MAX_SCENARIO_IMAGES}).`,
        variant: "destructive",
      });
      return;
    }
    setGeneratingPerspective(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceImageUrl: src,
          perspectiveId: perspectiveId ?? undefined,
          prompt: custom || undefined,
          imageModel,
          aspectRatio,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { scenario?: Scenario; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.scenario) {
        setDraft(data.scenario);
        onUpdated(data.scenario);
      }
      toast({ variant: "success", title: "New perspective added" });
    } catch (err) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingPerspective(false);
    }
  }

  async function deleteScenario() {
    if (!confirm(`Delete scenario "${draft.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/scenarios/${draft.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit scenario</DialogTitle>
          <DialogDescription>
            Reference environment for {draft.name}. Upload real photos of a place, or generate
            AI environments — reused across scenes and episodes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-scenario-name">Name</Label>
            <Input
              id="edit-scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-scenario-model">Image model</Label>
            <Select value={imageModel} onValueChange={setImageModel}>
              <SelectTrigger id="edit-scenario-model" className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_MODEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-scenario-desc">Location notes</Label>
          <Textarea
            id="edit-scenario-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Where it is, architecture, landscape, materials, mood — used as a hint when prompting scenes."
          />
          <Button variant="outline" size="sm" disabled={savingMeta} onClick={() => void saveMeta()}>
            {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save name & notes
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>
              Images ({images.length}/{MAX_SCENARIO_IMAGES})
            </Label>
            <Button
              variant="outline"
              size="sm"
              disabled={uploading || atLimit}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload real photo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                void uploadImages(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>
          {images.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-2xs text-muted-foreground">
              No images yet — upload a real photo or generate one below.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((url) => {
                const isPrimary = url === draft.primaryImageUrl;
                return (
                  <div
                    key={url}
                    className={cn(
                      "group relative aspect-video overflow-hidden rounded-md border bg-muted",
                      isPrimary ? "border-accent ring-1 ring-accent/40" : "border-border",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        disabled={busy || isPrimary}
                        onClick={() => void setPrimary(url)}
                        className="rounded-full bg-background/90 p-1 shadow"
                        title={isPrimary ? "Primary image" : "Set as primary"}
                      >
                        <Star
                          className={cn(
                            "h-3 w-3",
                            isPrimary ? "fill-accent text-accent" : "text-muted-foreground",
                          )}
                        />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeImage(url)}
                        className="rounded-full bg-background/90 p-1 shadow"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {isPrimary ? (
                      <span className="absolute bottom-1 left-1 rounded bg-accent px-1 py-0.5 text-[9px] font-medium text-accent-foreground">
                        Primary
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {images.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-accent" />
              New perspectives from an image
            </div>
            <p className="text-2xs text-muted-foreground">
              Pick one image and generate the same place from another angle. The AI keeps the
              location and just changes the camera.
            </p>
            <div>
              <Label className="text-[10px]">1. Source image</Label>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {images.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setSourceImageUrl(url)}
                    className={cn(
                      "relative aspect-video h-14 shrink-0 overflow-hidden rounded-md border-2 bg-muted transition-colors",
                      sourceImageUrl === url
                        ? "border-accent ring-1 ring-accent/40"
                        : "border-border hover:border-accent/40",
                    )}
                    title="Use as source"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-[10px]">2. Perspective</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {SCENARIO_PERSPECTIVE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={generatingPerspective}
                    onClick={() => {
                      setPerspectiveId(preset.id);
                      setPerspectivePrompt("");
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                      perspectiveId === preset.id
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-accent/40",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={perspectivePrompt}
              onChange={(e) => {
                setPerspectivePrompt(e.target.value);
                if (e.target.value.trim()) setPerspectiveId(null);
              }}
              rows={2}
              placeholder="Or describe a custom angle… e.g. view from the opposite riverbank looking back at the falls"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={generatingPerspective || atLimit}
              onClick={() => void generatePerspective()}
            >
              {generatingPerspective ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate perspective
            </Button>
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-accent" />
            Generate environment with AI
          </div>
          <p className="text-2xs text-muted-foreground">
            Describe the place. The image is generated empty (no people) so it stays reusable as a
            setting.
          </p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="e.g. a misty waterfall in a tropical canyon at golden hour, lush vegetation, wet rocks"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="primary"
              size="sm"
              disabled={generating || atLimit}
              onClick={() => void generate()}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate scenario
            </Button>
          </div>
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => void deleteScenario()}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete scenario
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
