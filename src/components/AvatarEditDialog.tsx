"use client";

import * as React from "react";
import { Loader2, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
import { AVATAR_POSTURE_PRESETS } from "@/lib/avatar-posture-presets";
import { MAX_AVATAR_IMAGES, parseAvatarImageUrls } from "@/lib/avatar-images";
import { getDefaultApiModels, IMAGE_MODEL_OPTIONS } from "@/lib/project-api-models";
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
  avatar: Avatar;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (avatar: Avatar) => void;
  onDeleted: () => void;
}

export function AvatarEditDialog({ avatar, open, onOpenChange, onUpdated, onDeleted }: Props) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(avatar);
  const [name, setName] = React.useState(avatar.name);
  const [description, setDescription] = React.useState(avatar.description ?? "");
  const [imageModel, setImageModel] = React.useState(getDefaultApiModels().imageModel);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [savingMeta, setSavingMeta] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(avatar);
    setName(avatar.name);
    setDescription(avatar.description ?? "");
    setSelectedPresetId(null);
    setCustomPrompt("");
  }, [avatar, open]);

  const images = parseAvatarImageUrls(draft);
  const atLimit = images.length >= MAX_AVATAR_IMAGES;

  async function saveMeta() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/avatars/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { avatar?: Avatar; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      if (data.avatar) {
        setDraft(data.avatar);
        onUpdated(data.avatar);
      }
      toast({ title: "Avatar updated" });
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
      const res = await fetch(`/api/avatars/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryImageUrl: url }),
      });
      const data = (await res.json().catch(() => ({}))) as { avatar?: Avatar; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.avatar) {
        setDraft(data.avatar);
        onUpdated(data.avatar);
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
      const res = await fetch(`/api/avatars/${draft.id}/images`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as { avatar?: Avatar; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.avatar) {
        setDraft(data.avatar);
        onUpdated(data.avatar);
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
        description: `Remove a reference before adding more (max ${MAX_AVATAR_IMAGES}).`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("images", f));
      const res = await fetch(`/api/avatars/${draft.id}/images`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { avatar?: Avatar; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.avatar) {
        setDraft(data.avatar);
        onUpdated(data.avatar);
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

  async function generatePosture() {
    const custom = customPrompt.trim();
    if (!selectedPresetId && !custom) {
      toast({
        title: "Choose a pose",
        description: "Pick a preset or describe the pose you want.",
        variant: "destructive",
      });
      return;
    }
    if (atLimit) {
      toast({
        title: "Image limit reached",
        description: `Remove a reference before generating (max ${MAX_AVATAR_IMAGES}).`,
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/avatars/${draft.id}/generate-posture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postureId: selectedPresetId ?? undefined,
          customPrompt: custom || undefined,
          imageModel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        avatar?: Avatar;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.avatar) {
        setDraft(data.avatar);
        onUpdated(data.avatar);
      }
      toast({ variant: "success", title: "New posture added" });
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

  async function deleteAvatar() {
    if (!confirm(`Delete avatar "${draft.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/avatars/${draft.id}`, { method: "DELETE" });
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
          <DialogTitle>Edit avatar</DialogTitle>
          <DialogDescription>
            Manage reference postures for {draft.name}. Generated images use your existing photos
            as identity anchors (GPT Image, Gemini, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-avatar-name">Name</Label>
            <Input
              id="edit-avatar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-avatar-model">Image model</Label>
            <Select value={imageModel} onValueChange={setImageModel}>
              <SelectTrigger id="edit-avatar-model" className="h-9 text-xs">
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
          <Label htmlFor="edit-avatar-desc">Notes</Label>
          <Textarea
            id="edit-avatar-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Traits, outfit, personality — used when generating new poses."
          />
          <Button
            variant="outline"
            size="sm"
            disabled={savingMeta}
            onClick={() => void saveMeta()}
          >
            {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save name & notes
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>
              Reference library ({images.length}/{MAX_AVATAR_IMAGES})
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
              Upload
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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((url) => {
              const isPrimary = url === draft.primaryImageUrl;
              return (
                <div
                  key={url}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-md border bg-muted",
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
                      title={isPrimary ? "Primary reference" : "Set as primary"}
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
                      disabled={busy || images.length <= 1}
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
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-accent" />
            Generate new posture
          </div>
          <p className="text-2xs text-muted-foreground">
            Pick a preset or describe a pose. The API keeps the same face and outfit as your
            references.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_POSTURE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={generating}
                onClick={() => {
                  setSelectedPresetId(preset.id);
                  setCustomPrompt("");
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                  selectedPresetId === preset.id
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-accent/40",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Textarea
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              if (e.target.value.trim()) setSelectedPresetId(null);
            }}
            rows={2}
            placeholder="Or describe a custom pose… e.g. kneeling to inspect a flower, looking up in wonder"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={generating || atLimit}
            onClick={() => void generatePosture()}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate posture
          </Button>
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteAvatar()} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete avatar
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
