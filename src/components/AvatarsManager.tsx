"use client";

import { useRef, useState } from "react";
import { Plus, Star, Trash2, Upload, UserSquare, X } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

type AvatarRow = Avatar & { _images?: string[] };

function parseImages(av: Avatar): string[] {
  try {
    const arr = JSON.parse(av.imageUrls || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function AvatarsManager({ initial }: { initial: Avatar[] }) {
  const [avatars, setAvatars] = useState<AvatarRow[]>(initial);
  const [creating, setCreating] = useState(false);
  return (
    <div className="mx-auto max-w-4xl px-5 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Avatars</h1>
          <p className="text-2xs text-muted-foreground">
            Upload reference images of a character or persona. Picked avatars are reused as the
            visual anchor for every video block.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New avatar
        </Button>
      </header>

      {avatars.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
          <UserSquare className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-sm font-medium">No avatars yet</h2>
            <p className="text-2xs text-muted-foreground">
              Add an avatar once and reuse it across every project — the character will appear
              consistently in keyframes and videos.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create avatar
          </Button>
        </div>
      )}

      {creating && (
        <CreateAvatarCard
          onCancel={() => setCreating(false)}
          onCreated={(av) => {
            setAvatars((prev) => [av, ...prev]);
            setCreating(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((av) => (
          <AvatarCard
            key={av.id}
            avatar={av}
            onChange={(next) =>
              setAvatars((prev) => prev.map((p) => (p.id === next.id ? { ...p, ...next } : p)))
            }
            onDelete={() => setAvatars((prev) => prev.filter((p) => p.id !== av.id))}
          />
        ))}
      </div>
    </div>
  );
}

function CreateAvatarCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (a: Avatar) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...next].slice(0, 6));
  }

  async function submit() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (files.length === 0) {
      toast({ title: "Upload at least one image", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (description.trim()) fd.set("description", description.trim());
      files.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/avatars", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const { avatar } = (await res.json()) as { avatar: Avatar };
      onCreated(avatar);
      toast({ title: "Avatar created" });
    } catch (err) {
      toast({
        title: "Failed to create avatar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">New avatar</h2>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <Label htmlFor="avatar-name">Name</Label>
            <Input
              id="avatar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Luna the explorer"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="avatar-desc">Notes (optional)</Label>
            <Textarea
              id="avatar-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the character — used as a hint when prompting."
              rows={3}
            />
          </div>
          <div>
            <Label>Reference images</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
            >
              <Upload className="h-3.5 w-3.5" />
              Click to upload (up to 6 images, 8MB each)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
        <div>
          {files.length === 0 ? (
            <div className="flex h-full min-h-32 items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted-foreground">
              Reference images will appear here
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-md bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create avatar"}
        </Button>
      </div>
    </div>
  );
}

function AvatarCard({
  avatar,
  onChange,
  onDelete,
}: {
  avatar: Avatar;
  onChange: (a: Avatar) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const images = parseImages(avatar);
  const [busy, setBusy] = useState(false);

  async function setPrimary(url: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryImageUrl: url }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange({ ...avatar, primaryImageUrl: url });
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

  async function remove() {
    if (!confirm(`Delete avatar "${avatar.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
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

  return (
    <div className="rounded-lg border border-border bg-panel">
      <div className="grid grid-cols-3 gap-1 p-2">
        {images.slice(0, 6).map((url) => {
          const isPrimary = url === avatar.primaryImageUrl;
          return (
            <button
              key={url}
              type="button"
              disabled={busy}
              onClick={() => setPrimary(url)}
              className={
                "group relative aspect-square overflow-hidden rounded-md border " +
                (isPrimary ? "border-accent ring-1 ring-accent/40" : "border-transparent hover:border-border")
              }
              title={isPrimary ? "Primary" : "Set as primary"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={avatar.name} className="h-full w-full object-cover" />
              {isPrimary && (
                <span className="absolute left-1 top-1 rounded-full bg-accent p-0.5 text-accent-foreground">
                  <Star className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{avatar.name}</h3>
          {avatar.description && (
            <p className="line-clamp-1 text-2xs text-muted-foreground">{avatar.description}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={remove} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
