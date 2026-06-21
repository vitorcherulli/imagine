"use client";

import { useRef, useState } from "react";
import { Dna, Plus, Trash2, Upload, X } from "lucide-react";
import type { ProjectDna } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { PROJECT_IDENTITY_LABEL } from "@/lib/project-identity";

export function ProjectDnaManager({ initial }: { initial: ProjectDna[] }) {
  const [items, setItems] = useState<ProjectDna[]>(initial);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-5 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{PROJECT_IDENTITY_LABEL}</h1>
          <p className="text-2xs text-muted-foreground">
            Register your series or brand identity once — name, description and logo. Then pick it on each video/episode.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New DNA
        </Button>
      </header>

      {items.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
          <Dna className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-sm font-medium">No project DNA yet</h2>
            <p className="text-2xs text-muted-foreground">
              Describe your content line — audience, tone, aesthetic — and reuse it across all
              projects.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create DNA
          </Button>
        </div>
      )}

      {creating && (
        <CreateDnaCard
          onCancel={() => setCreating(false)}
          onCreated={(dna) => {
            setItems((prev) => [dna, ...prev]);
            setCreating(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <DnaCard
            key={item.id}
            item={item}
            onChange={(next) =>
              setItems((prev) => prev.map((p) => (p.id === next.id ? { ...p, ...next } : p)))
            }
            onDelete={() => setItems((prev) => prev.filter((p) => p.id !== item.id))}
          />
        ))}
      </div>
    </div>
  );
}

function CreateDnaCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (dna: ProjectDna) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (description.trim()) fd.set("description", description.trim());
      if (logoFile) fd.set("logo", logoFile);
      const res = await fetch("/api/project-dna", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const { projectDna } = (await res.json()) as { projectDna: ProjectDna };
      onCreated(projectDna);
      toast({ title: "DNA created" });
    } catch (err) {
      toast({
        title: "Failed to create DNA",
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
        <h2 className="text-sm font-medium">Novo DNA</h2>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <Label htmlFor="dna-name">Line / brand name</Label>
            <Input
              id="dna-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bia Fitness"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="dna-desc">How it works</Label>
            <Textarea
              id="dna-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Audience, voice tone, aesthetic, what ties every video in this line together…"
              rows={5}
            />
          </div>
          <div>
            <Label>Logo (optional)</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
            >
              <Upload className="h-3.5 w-3.5" />
              {logoFile ? logoFile.name : "Click to upload (PNG, JPG, SVG — up to 4MB)"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setLogoFile(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border bg-background p-4">
          {logoFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(logoFile)}
              alt="Preview"
              className="max-h-32 max-w-full object-contain"
            />
          ) : (
            <p className="text-2xs text-muted-foreground">Logo preview</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : "Create DNA"}
        </Button>
      </div>
    </div>
  );
}

function DnaCard({
  item,
  onChange,
  onDelete,
}: {
  item: ProjectDna;
  onChange: (dna: ProjectDna) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadLogo(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("logo", file);
      const res = await fetch(`/api/project-dna/${item.id}`, { method: "PATCH", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { projectDna } = (await res.json()) as { projectDna: ProjectDna };
      onChange(projectDna);
      toast({ title: "Logo updated" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${item.name}"? Projects using this DNA will have no selection.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/project-dna/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
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
    <div className="rounded-lg border border-border bg-panel">
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center border-b border-border bg-background p-4 hover:bg-muted/40"
        title="Change logo"
      >
        {item.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.logoUrl} alt={item.name} className="max-h-16 max-w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Dna className="h-6 w-6" />
            <span className="text-2xs">Add logo</span>
          </div>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadLogo(f);
          e.currentTarget.value = "";
        }}
      />
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{item.name}</h3>
          {item.description && (
            <p className="line-clamp-3 text-2xs text-muted-foreground">{item.description}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={remove} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
