"use client";

import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import { ChevronRight, Dna, Plus, Trash2, Upload, X } from "lucide-react";
import type { ProjectDna } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { PROJECT_IDENTITY_LABEL } from "@/lib/project-identity";
import {
  DnaStyleFieldsForm,
  dnaStyleFormFromRecord,
  type DnaStyleFormValue,
  EMPTY_DNA_STYLE_FORM,
} from "@/components/DnaStyleFieldsForm";
import { formatDnaStyleSummary } from "@/lib/dna-style";

export function ProjectDnaManager({ initial }: { initial: ProjectDna[] }) {
  const [items, setItems] = useState<ProjectDna[]>(initial);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-5 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{PROJECT_IDENTITY_LABEL}</h1>
          <p className="text-2xs text-muted-foreground">
            Register your series or brand identity once — voice, colors, visual style and logo. Reused on every video and publication.
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <DnaCard
            key={item.id}
            item={item}
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
  const [style, setStyle] = useState<DnaStyleFormValue>(EMPTY_DNA_STYLE_FORM);
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
      if (style.genre) fd.set("genre", style.genre);
      if (style.visualStyle) fd.set("visualStyle", style.visualStyle);
      if (style.voiceTone) fd.set("voiceTone", style.voiceTone);
      if (style.colorPalette.trim()) fd.set("colorPalette", style.colorPalette.trim());
      if (style.visualMood.trim()) fd.set("visualMood", style.visualMood.trim());
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
      <div className="mt-3 rounded-md border border-border bg-background p-3">
        <h3 className="mb-2 text-xs font-medium">Visual identity</h3>
        <DnaStyleFieldsForm value={style} onChange={setStyle} compact />
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
  onDelete,
}: {
  item: ProjectDna;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const styleSummary = formatDnaStyleSummary(item);

  async function remove(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
    <div className="group relative rounded-lg border border-border bg-panel transition-colors hover:border-accent/30">
      <Link href={`/dna/${item.id}`} className="block">
        <div className="flex w-full items-center justify-center border-b border-border bg-background p-4">
          {item.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.logoUrl} alt={item.name} className="max-h-16 max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Dna className="h-6 w-6" />
              <span className="text-2xs">No logo yet</span>
            </div>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-medium group-hover:text-accent">{item.name}</h3>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{item.description}</p>
          ) : null}
          {styleSummary ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-accent/90">{styleSummary}</p>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground">Add colors & style inside</p>
          )}
          {item.learnedNotes ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground/80">Memory: </span>
              {item.learnedNotes.split("\n").slice(-2).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground group-hover:text-foreground/80">
          Open to edit identity, photos & linked videos
        </div>
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        onClick={remove}
        disabled={busy}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
