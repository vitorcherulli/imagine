"use client";

import { useRef, useState } from "react";
import { Mountain, Plus, Upload, X } from "lucide-react";
import type { Scenario } from "@/lib/db/schema";
import { parseScenarioImageUrls } from "@/lib/scenario-images";
import { ScenarioEditDialog } from "@/components/ScenarioEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export function ScenariosManager({ initial }: { initial: Scenario[] }) {
  const [scenarios, setScenarios] = useState<Scenario[]>(initial);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-5 py-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Scenarios</h1>
          <p className="text-2xs text-muted-foreground">
            Reusable environments and locations — upload real landscape/ambient photos or generate
            them with AI. Reused as the setting for videos and specific scenes.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New scenario
        </Button>
      </header>

      {scenarios.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
          <Mountain className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-sm font-medium">No scenarios yet</h2>
            <p className="text-2xs text-muted-foreground">
              Create a location once — a real place or an AI environment — and reuse it so scenes
              share the same setting across episodes.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create scenario
          </Button>
        </div>
      )}

      {creating && (
        <CreateScenarioCard
          onCancel={() => setCreating(false)}
          onCreated={(s) => {
            setScenarios((prev) => [s, ...prev]);
            setCreating(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            onChange={(next) =>
              setScenarios((prev) => prev.map((p) => (p.id === next.id ? { ...p, ...next } : p)))
            }
            onDelete={() => setScenarios((prev) => prev.filter((p) => p.id !== s.id))}
          />
        ))}
      </div>
    </div>
  );
}

function CreateScenarioCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (s: Scenario) => void;
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
    setFiles((prev) => [...prev, ...next].slice(0, 8));
  }

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
      files.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/scenarios", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const { scenario } = (await res.json()) as { scenario: Scenario };
      onCreated(scenario);
      toast({ title: "Scenario created" });
    } catch (err) {
      toast({
        title: "Failed to create scenario",
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
        <h2 className="text-sm font-medium">New scenario</h2>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <Label htmlFor="scenario-name">Name</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chapada waterfall"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="scenario-desc">Location notes (optional)</Label>
            <Textarea
              id="scenario-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Where it is, landscape, materials, mood — used as a hint when prompting scenes."
              rows={3}
            />
          </div>
          <div>
            <Label>Reference photos (optional)</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
            >
              <Upload className="h-3.5 w-3.5" />
              Click to upload real photos (up to 8, 20MB each)
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
            <p className="mt-1 text-[10px] text-muted-foreground">
              No photos? Create it and generate an AI environment inside.
            </p>
          </div>
        </div>
        <div>
          {files.length === 0 ? (
            <div className="flex h-full min-h-32 items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted-foreground">
              Reference photos will appear here
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {files.map((f, i) => (
                <div key={i} className="group relative aspect-video overflow-hidden rounded-md bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
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
          {submitting ? "Creating…" : "Create scenario"}
        </Button>
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  onChange,
  onDelete,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const images = parseScenarioImageUrls(scenario);

  return (
    <>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="overflow-hidden rounded-lg border border-border bg-panel text-left transition-colors hover:border-accent/40 hover:bg-panel/80"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {scenario.primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scenario.primaryImageUrl}
              alt={scenario.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Mountain className="h-6 w-6" />
            </div>
          )}
          {images.length > 0 ? (
            <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-medium text-foreground">
              {images.length} img
            </span>
          ) : null}
        </div>
        <div className="border-t border-border px-3 py-2">
          <h3 className="truncate text-sm font-medium">{scenario.name}</h3>
          {scenario.description ? (
            <p className="line-clamp-2 text-2xs text-muted-foreground">{scenario.description}</p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Click to edit, upload or generate
          </p>
        </div>
      </button>

      <ScenarioEditDialog
        scenario={scenario}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={onChange}
        onDeleted={onDelete}
      />
    </>
  );
}
