"use client";

import * as React from "react";
import { Dna, Loader2 } from "lucide-react";
import type { ProjectDna } from "@/lib/db/schema";
import type { DnaEvolveFieldChange, DnaEvolvePreview } from "@/lib/project-dna-evolve";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

function ChangeRow({
  change,
  checked,
  onCheckedChange,
}: {
  change: DnaEvolveFieldChange;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
        checked ? "border-accent/40 bg-muted/40" : "border-border/80 bg-background opacity-70",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-border accent-accent"
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="text-xs font-semibold text-foreground">{change.label}</span>
        {change.before && !change.appendOnly ? (
          <p className="line-clamp-2 text-[10px] text-muted-foreground">
            <span className="font-medium">Before: </span>
            {change.before}
          </p>
        ) : change.before && change.appendOnly ? (
          <p className="line-clamp-2 text-[10px] text-muted-foreground">
            <span className="font-medium">Current memory: </span>
            {change.before.slice(-200)}
          </p>
        ) : null}
        {change.after ? (
          <p className="line-clamp-3 text-[10px] text-foreground/90">
            <span className="font-medium text-accent">
              {change.appendOnly ? "Add: " : "After: "}
            </span>
            {change.appendOnly
              ? change.after.split("\n").pop() ?? change.after
              : change.after}
          </p>
        ) : null}
        <p className="text-[10px] italic text-muted-foreground">{change.rationale}</p>
      </span>
    </label>
  );
}

export function DnaEvolveDialog({
  projectId,
  open,
  onOpenChange,
  onApplied,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (dna: ProjectDna) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [preview, setPreview] = React.useState<DnaEvolvePreview | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const loadPreview = React.useCallback(async () => {
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/dna-evolve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      const p = data.preview as DnaEvolvePreview;
      setPreview(p);
      setSelected(new Set(p.changes.map((c) => c.field)));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not analyze episode",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast, onOpenChange]);

  React.useEffect(() => {
    if (open) void loadPreview();
    else {
      setPreview(null);
      setSelected(new Set());
    }
  }, [open, loadPreview]);

  async function applySelected() {
    if (!preview) return;
    const changes = preview.changes
      .filter((c) => selected.has(c.field))
      .map((c) => ({ field: c.field, after: c.after }));
    if (changes.length === 0) {
      toast({ title: "Select at least one change", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/dna-evolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectDnaId: preview.projectDnaId,
          changes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      toast({
        title: "DNA updated",
        description: `${preview.dnaName} — ${changes.length} change(s) applied.`,
      });
      onApplied?.(data.projectDna as ProjectDna);
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not update DNA",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dna className="h-4 w-4 text-accent" />
            Enrich DNA from this episode
          </DialogTitle>
          <DialogDescription>
            AI analyzed this video against your series DNA. Review and approve what to save — nothing
            changes until you apply.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-2xs text-muted-foreground">Analyzing episode…</p>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {preview.dnaName}
              </p>
              <p className="mt-0.5 text-xs font-semibold">{preview.episodeTitle}</p>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                {preview.episodeSummary}
              </p>
            </div>

            {preview.changes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-2xs text-muted-foreground">
                No updates suggested — your DNA already matches this episode well.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Proposed changes
                </p>
                {preview.changes.map((change) => (
                  <ChangeRow
                    key={change.field}
                    change={change}
                    checked={selected.has(change.field)}
                    onCheckedChange={(v) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(change.field);
                        else next.delete(change.field);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview && preview.changes.length > 0 ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={applying || selected.size === 0}
              onClick={() => void applySelected()}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply selected ({selected.size})
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
