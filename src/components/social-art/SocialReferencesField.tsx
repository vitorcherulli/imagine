"use client";

import * as React from "react";
import { ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SOCIAL_ART_LAYOUT_LABELS,
  SOCIAL_REFERENCE_LIMIT,
  SOCIAL_TITLE_STYLES,
  type SocialReference,
  type SocialReferenceAnalysis,
  type SocialReferenceMode,
} from "@/lib/social-art/types";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { projectScriptLanguageLabel } from "@/lib/project-language";

async function uploadReference(file: File): Promise<SocialReference> {
  const form = new FormData();
  form.append("image", await shrinkImageFile(file, 1600, 0.86));
  const res = await fetch("/api/publications/references", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data.reference as SocialReference;
}

interface Props {
  value: SocialReference[];
  onChange: React.Dispatch<React.SetStateAction<SocialReference[]>>;
  analysis: SocialReferenceAnalysis | null;
  onAnalysisChange: (analysis: SocialReferenceAnalysis | null) => void;
  onError: (message: string) => void;
  mode?: SocialReferenceMode;
}

export function SocialReferencesField({ value, onChange, analysis, onAnalysisChange, onError, mode = "inspire" }: Props) {
  const [uploading, setUploading] = React.useState(0);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const token = React.useRef(0);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const key = value.map((r) => r.assetId).join(",");
  const analyze = React.useCallback(async () => {
    const ids = valueRef.current.map((r) => r.assetId);
    const mine = ++token.current;
    if (ids.length === 0) {
      setAnalyzing(false);
      setAnalysisError(null);
      onAnalysisChange(null);
      return;
    }
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/publications/references/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (mine !== token.current) return;
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      onAnalysisChange(data.analysis as SocialReferenceAnalysis);
    } catch (err) {
      if (mine !== token.current) return;
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      if (mine === token.current) setAnalyzing(false);
    }
  }, [onAnalysisChange]);

  const lastAnalyzed = React.useRef(key);
  React.useEffect(() => {
    if (uploading > 0 || key === lastAnalyzed.current) return;
    lastAnalyzed.current = key;
    const timer = setTimeout(() => void analyze(), 500);
    return () => clearTimeout(timer);
  }, [key, uploading, analyze]);

  async function addFiles(files: FileList | null) {
    const room = SOCIAL_REFERENCE_LIMIT - valueRef.current.length;
    const picked = Array.from(files ?? []).slice(0, Math.max(0, room));
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    setUploading((n) => n + picked.length);
    await Promise.all(
      picked.map(async (file) => {
        try {
          const ref = await uploadReference(file);
          onChange((prev) => [...prev, ref].slice(0, SOCIAL_REFERENCE_LIMIT));
        } catch (err) {
          onError(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }

  const full = value.length + uploading >= SOCIAL_REFERENCE_LIMIT;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {value.map((ref) => (
          <div key={ref.assetId} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ref.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove reference"
              onClick={() => onChange((prev) => prev.filter((r) => r.assetId !== ref.assetId))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ))}
        {!full ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-2xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            Add images
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => void addFiles(e.target.files)}
      />

      {analyzing ? (
        <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Reading your references…
        </p>
      ) : analysisError ? (
        <div className="flex items-center justify-between gap-2 text-2xs text-destructive">
          <span>{analysisError}</span>
          <Button variant="ghost" size="sm" onClick={() => void analyze()}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      ) : analysis && value.length > 0 ? (
        <div className="space-y-1.5 rounded-md bg-background p-2.5 text-2xs leading-relaxed">
          <p className="flex items-center gap-1 font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-accent" /> What the AI will follow
          </p>
          {analysis.styleNotes ? <p className="text-muted-foreground">{analysis.styleNotes}</p> : null}
          {analysis.contentNotes ? <p className="text-muted-foreground">{analysis.contentNotes}</p> : null}
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-muted-foreground">
            {analysis.palette ? (
              <span className="flex items-center gap-1">
                {(["dark", "accent", "light"] as const).map((k) => (
                  <span
                    key={k}
                    title={analysis.palette?.[k]}
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ background: analysis.palette?.[k] }}
                  />
                ))}
              </span>
            ) : null}
            {analysis.titleStyle ? <span>Title: {SOCIAL_TITLE_STYLES[analysis.titleStyle].label}</span> : null}
            {analysis.language ? <span>Language: {projectScriptLanguageLabel(analysis.language)}</span> : null}
          </div>
          {mode === "copy" && analysis.items.length > 0 ? (
            <ol className="space-y-1 border-t border-border pt-1.5">
              {analysis.items.map((item, i) => (
                <li key={i} className="flex gap-1.5 text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground">{i + 1}.</span>
                  <span className="min-w-0">
                    {item.lead ? <span>{item.lead} </span> : null}
                    {item.headline ? <span className="text-foreground">“{item.headline}”</span> : <em>No headline</em>}
                    {" · "}
                    {SOCIAL_ART_LAYOUT_LABELS[item.layout]}, title {item.position === "top" ? "on top" : "at the bottom"}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : (
        <p className="text-2xs text-muted-foreground">
          Up to {SOCIAL_REFERENCE_LIMIT} posts or photos you like. Style, colors, title look, texts and images all
          start from them, in every publication you create here.
        </p>
      )}
    </div>
  );
}
