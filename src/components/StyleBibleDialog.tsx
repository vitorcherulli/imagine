"use client";

import * as React from "react";
import { Loader2, Palette, Sparkles, ImageIcon, RefreshCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  emptyStyleBible,
  parseStyleBible,
  STYLE_BIBLE_FIELDS,
  type StyleBible,
} from "@/lib/style-bible";

interface Props {
  projectId: string;
  initialBible: string | null;
  initialAnchorUrl: string | null;
  onUpdated?: (next: { styleBible: StyleBible | null; anchorImageUrl: string | null }) => void;
}

type Status = "idle" | "saving" | "generating-bible" | "generating-anchor";

export function StyleBibleDialog({
  projectId,
  initialBible,
  initialAnchorUrl,
  onUpdated,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [bible, setBible] = React.useState<StyleBible>(
    () => parseStyleBible(initialBible) ?? emptyStyleBible(),
  );
  const [anchorUrl, setAnchorUrl] = React.useState<string | null>(initialAnchorUrl);
  const [status, setStatus] = React.useState<Status>("idle");
  const [hasBible, setHasBible] = React.useState<boolean>(!!parseStyleBible(initialBible));

  React.useEffect(() => {
    const parsed = parseStyleBible(initialBible);
    setBible(parsed ?? emptyStyleBible());
    setHasBible(!!parsed);
    setAnchorUrl(initialAnchorUrl);
  }, [initialBible, initialAnchorUrl]);

  function setField(key: keyof StyleBible, value: string) {
    setBible((prev) => ({ ...prev, [key]: value }));
  }

  function emit(next: { styleBible: StyleBible | null; anchorImageUrl: string | null }) {
    onUpdated?.(next);
  }

  async function handleGenerateBible() {
    setStatus("generating-bible");
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setBible(data.styleBible);
      setHasBible(true);
      emit({ styleBible: data.styleBible, anchorImageUrl: anchorUrl });
      toast({ variant: "success", title: "Style bible generated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate style bible",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStatus("idle");
    }
  }

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bible }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setHasBible(true);
      emit({ styleBible: data.styleBible, anchorImageUrl: anchorUrl });
      toast({ variant: "success", title: "Style bible saved" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save style bible",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStatus("idle");
    }
  }

  async function handleGenerateAnchor() {
    setStatus("generating-anchor");
    try {
      const res = await fetch(`/api/projects/${projectId}/anchor`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAnchorUrl(data.anchorImageUrl);
      emit({ styleBible: bible, anchorImageUrl: data.anchorImageUrl });
      toast({ variant: "success", title: "Editorial reference generated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate editorial reference",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  const canGenerateAnchor = hasBible && !busy;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Project art direction">
          <Palette className="h-3.5 w-3.5" />
          Style
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editorial line</DialogTitle>
          <DialogDescription>
            Unifies palette, light and film language across every scene. Each block keeps its own
            location — scenes look like the same film, not the same place.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <Label className="text-2xs text-muted-foreground">Editorial reference</Label>
            <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/40">
              {anchorUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={anchorUrl}
                  alt="Editorial reference"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-2xs text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                  <span>No reference yet</span>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleGenerateAnchor}
              disabled={!canGenerateAnchor}
              title={
                hasBible
                  ? "Generate abstract color/light mood board"
                  : "Generate or save the style bible first"
              }
            >
              {status === "generating-anchor" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )}
              {anchorUrl ? "Regenerate reference" : "Generate reference"}
            </Button>
            <p className="text-2xs text-muted-foreground">
              Abstract mood board (color grade + light). Guides the look — not the location — of
              each scene.
            </p>
          </div>

          {/* Bible fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-2xs text-muted-foreground">Style bible</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerateBible}
                disabled={busy}
                title="Auto-generate from the story via LLM"
              >
                {status === "generating-bible" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {hasBible ? "Regenerate from story" : "Generate from story"}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {STYLE_BIBLE_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label className="block text-2xs text-muted-foreground">{field.label}</Label>
                  <Textarea
                    rows={field.rows}
                    placeholder={field.hint}
                    value={bible[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={busy || !isFilled(bible)}
            title={isFilled(bible) ? "Save bible" : "Fill all fields before saving"}
          >
            {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isFilled(bible: StyleBible): boolean {
  return STYLE_BIBLE_FIELDS.every((f) => bible[f.key].trim().length > 0);
}
