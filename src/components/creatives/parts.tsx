"use client";

import * as React from "react";
import { Copy, Download, Pencil, Play, Sparkles, Trash2, UserRoundCog } from "lucide-react";
import type { Creative } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CREATIVE_STATUSES, CREATIVE_USAGES, type CreativeStatus, type CreativeUsage } from "@/lib/creatives";
import { adNameOf, fmtDuration, nameOf, type Concept } from "@/components/creatives/shared";

export type ConceptStatus = { status: CreativeStatus; suggested: boolean };

export type FileActions = {
  onAddSize: (f: Creative) => void;
  onEditFile: (f: Creative) => void;
  onDeleteFile: (f: Creative) => void;
  onCopy: (text: string) => void;
  onPreview: (f: Creative) => void;
  onVariations: (f: Creative) => void;
};

export const CONCEPT_DRAG_TYPE = "application/x-creative-concept";

const COVER_PREFERENCE = ["4x5", "1x1", "9x16", "2x3", "16x9"];

/** Best file to represent a concept: latest version, feed size first. */
export function coverOf(c: Concept): Creative {
  const files = c.versions[0]?.files ?? c.files;
  return (
    [...files].sort(
      (a, b) => COVER_PREFERENCE.indexOf(a.aspectRatio) - COVER_PREFERENCE.indexOf(b.aspectRatio),
    )[0] ?? c.files[0]
  );
}

export function StatusSelect({ concept, onChange }: { concept: Concept; onChange: (v: string) => void }) {
  return (
    <Select value={concept.manualStatus ?? "auto"} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-[112px] px-2 text-xs" title="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto status</SelectItem>
        {Object.entries(CREATIVE_STATUSES).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const USAGE_DOT: Record<CreativeUsage, string> = {
  unused: "bg-muted-foreground/40",
  used: "bg-accent",
  published: "bg-success",
  old: "bg-warning",
};

const TRASH_VALUE = "__trash";

export function UsageSelect({
  concept,
  onChange,
  onTrash,
  className,
}: {
  concept: Concept;
  onChange: (v: CreativeUsage) => void;
  onTrash?: () => void;
  className?: string;
}) {
  return (
    <Select
      value={concept.usage}
      onValueChange={(v) => (v === TRASH_VALUE ? onTrash?.() : onChange(v as CreativeUsage))}
    >
      <SelectTrigger
        className={cn("h-7 w-[112px] px-2 text-xs", className)}
        title="Mark as not used, used, published or old"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {(Object.entries(CREATIVE_USAGES) as [CreativeUsage, string][]).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", USAGE_DOT[k])} />
              {label}
            </span>
          </SelectItem>
        ))}
        {onTrash ? (
          <>
            <div className="-mx-1 my-1 h-px bg-border" />
            <SelectItem value={TRASH_VALUE} className="text-destructive focus:text-destructive">
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3 w-3 shrink-0" />
                Move to trash
              </span>
            </SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function FileThumb({
  file: f,
  actions,
  className = "h-28",
}: {
  file: Creative;
  actions: FileActions;
  className?: string;
}) {
  const [hover, setHover] = React.useState(false);
  const isVideo = f.kind === "video";
  const [w, h] = f.aspectRatio.split("x").map(Number);
  return (
    <div
      className={cn("group relative overflow-hidden rounded-md border border-border bg-muted", className)}
      style={{ aspectRatio: w && h ? `${w} / ${h}` : "4 / 5" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button type="button" onClick={() => actions.onPreview(f)} className="block h-full w-full" title={nameOf(f)}>
        {isVideo && hover ? (
          <video src={f.fileUrl} muted autoPlay loop playsInline className="h-full w-full object-cover" />
        ) : f.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.thumbUrl} alt={nameOf(f)} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-2xs text-muted-foreground">?</span>
        )}
      </button>
      <span className="pointer-events-none absolute left-1 top-1 flex flex-wrap gap-0.5">
        <span
          className={cn(
            "rounded bg-background/90 px-1 text-[10px] font-medium leading-4",
            f.aspectRatio === "2x3" && "text-warning",
          )}
        >
          {f.aspectRatio.replace("x", ":")}
        </span>
        {isVideo && f.durationSeconds ? (
          <span className="rounded bg-background/90 px-1 text-[10px] leading-4">{fmtDuration(f.durationSeconds)}</span>
        ) : null}
      </span>
      {isVideo && !hover ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/50 p-1.5 text-white">
            <Play className="h-3.5 w-3.5" />
          </span>
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-gradient-to-t from-black/70 to-transparent px-0.5 pb-0.5 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
        <ThumbAction title="Download with the standard name" href={`/api/creatives/${f.id}/download`}>
          <Download className="h-3.5 w-3.5" />
        </ThumbAction>
        {!isVideo ? (
          <ThumbAction title="Generate variations" onClick={() => actions.onVariations(f)}>
            <Sparkles className="h-3.5 w-3.5" />
          </ThumbAction>
        ) : (
          <ThumbAction
            title="Swap person — same video with another person"
            href={`/swap?source=${encodeURIComponent(f.fileUrl)}&name=${encodeURIComponent(nameOf(f).replace(/\.[^.]+$/, ""))}`}
          >
            <UserRoundCog className="h-3.5 w-3.5" />
          </ThumbAction>
        )}
        <ThumbAction title="Edit file" onClick={() => actions.onEditFile(f)}>
          <Pencil className="h-3.5 w-3.5" />
        </ThumbAction>
        <ThumbAction title="Delete" onClick={() => actions.onDeleteFile(f)}>
          <Trash2 className="h-3.5 w-3.5" />
        </ThumbAction>
      </div>
    </div>
  );
}

function ThumbAction({
  title,
  href,
  onClick,
  children,
}: {
  title: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = "rounded p-1 text-white hover:bg-white/20";
  return href ? (
    <a href={href} title={title} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function PreviewDialog({
  creative,
  onClose,
  onCopy,
}: {
  creative: Creative | null;
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <Dialog open={!!creative} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        {creative ? (
          <>
            <DialogHeader>
              <DialogTitle className="break-all font-mono text-sm">{nameOf(creative)}</DialogTitle>
              <DialogDescription>
                {creative.width && creative.height ? `${creative.width}×${creative.height} · ` : ""}
                {(creative.sizeBytes / 1024 / 1024).toFixed(1)} MB
                {creative.originalName ? ` · was “${creative.originalName}”` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[70vh] justify-center overflow-hidden rounded-md bg-muted">
              {creative.kind === "video" ? (
                <video src={creative.fileUrl} controls autoPlay className="max-h-[70vh]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creative.fileUrl} alt={nameOf(creative)} className="max-h-[70vh] object-contain" />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => onCopy(adNameOf(creative))}>
                <Copy className="h-3.5 w-3.5" /> Copy ad name
              </Button>
              <Button asChild size="sm" variant="primary">
                <a href={`/api/creatives/${creative.id}/download`}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
