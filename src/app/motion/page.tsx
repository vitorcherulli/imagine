"use client";

import React, { useEffect, useState } from "react";
import { Clapperboard, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MOTION_TEMPLATES } from "@/lib/motion/templates";

interface DesignRow {
  id: string;
  title: string;
  templateId: string;
  outputUrl: string | null;
  status: string;
  updatedAt: string;
}

export default function MotionLibraryPage() {
  const { toast } = useToast();
  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/motion", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setDesigns(json.designs ?? []);
      else setDesigns([]);
    } catch {
      setDesigns([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (templateId: string) => {
    setCreating(templateId);
    try {
      const res = await fetch("/api/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao criar");
      window.location.href = `/motion/${json.design.id}`;
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setCreating(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/motion/${id}`, { method: "DELETE" });
    setDesigns((d) => (d ? d.filter((x) => x.id !== id) : d));
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 flex items-center gap-2">
        <Clapperboard className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-semibold tracking-tight">Motion design</h1>
      </div>
      <p className="mb-8 text-sm text-muted-foreground">
        Crie peças animadas a partir de modelos, edite por controles ou por chat e exporte em MP4.
      </p>

      {/* Modelos */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Criar do zero</h2>
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MOTION_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => create(t.id)}
            disabled={creating !== null}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-accent disabled:opacity-60"
          >
            <div className="mb-3 inline-flex rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
              {t.thumb}
            </div>
            <div className="mb-1 flex items-center gap-2 text-base font-semibold">
              {t.name}
              {creating === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />}
            </div>
            <p className="text-sm text-muted-foreground">{t.description}</p>
            <div className="mt-3 text-xs text-muted-foreground">
              {t.width}×{t.height} · {t.aspect}
            </div>
          </button>
        ))}
      </div>

      {/* Minhas peças */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minhas peças</h2>
      {designs === null ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : designs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma peça ainda. Escolha um modelo acima para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <div key={d.id} className="group relative rounded-lg border border-border bg-card p-4">
              <a href={`/motion/${d.id}`} className="block">
                <div className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-medium">{d.title}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{MOTION_TEMPLATES.find((t) => t.id === d.templateId)?.name ?? d.templateId}</span>
                  <span className="flex items-center gap-1">
                    {d.outputUrl ? <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">MP4</span> : null}
                    {d.status === "error" ? <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">erro</span> : null}
                  </span>
                </div>
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => remove(d.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
