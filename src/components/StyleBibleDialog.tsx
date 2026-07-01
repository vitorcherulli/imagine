"use client";

import * as React from "react";
import { Loader2, Palette, Sparkles, ImageIcon, RefreshCcw, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  emptyStyleBible,
  mergeStyleBible,
  parseStyleBibleDocument,
  STYLE_BIBLE_FIELDS,
  type StyleBible,
  type StyleBibleBlockImages,
  type StyleBibleDocument,
  type StyleBibleFieldKey,
} from "@/lib/style-bible";
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";

interface Props {
  projectId: string;
  videoFormat?: VideoFormat | string | null;
  initialBible: string | null;
  initialAnchorUrl?: string | null;
  onUpdated?: (next: {
    styleBible: StyleBible | null;
    blockImages: StyleBibleBlockImages;
    anchorImageUrl?: string | null;
  }) => void;
}

type Status = "idle" | "saving" | "generating-bible" | `generating-${StyleBibleFieldKey}`;

const EDITORIAL_SAVE_MS = 700;

function EditorialReferenceImage({
  url,
  alt,
  className,
  onBroken,
}: {
  url: string;
  alt: string;
  className?: string;
  onBroken: () => void;
}) {
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => {
    setBroken(false);
  }, [url]);

  if (broken) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-2xs text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
        <span>Reference missing</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => {
        setBroken(true);
        onBroken();
      }}
    />
  );
}

function loadDocument(raw: string | null, legacyAnchorUrl?: string | null): StyleBibleDocument {
  const parsed = parseStyleBibleDocument(raw);
  if (parsed) return parsed;
  const fields = emptyStyleBible();
  const blockImages: StyleBibleBlockImages = {};
  if (legacyAnchorUrl) {
    blockImages.colorPalette = legacyAnchorUrl;
  }
  return { fields, blockImages };
}

export function StyleBibleDialog({
  projectId,
  videoFormat = "horizontal",
  initialBible,
  initialAnchorUrl = null,
  onUpdated,
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [document, setDocument] = React.useState<StyleBibleDocument>(() =>
    loadDocument(initialBible, initialAnchorUrl),
  );
  const [status, setStatus] = React.useState<Status>("idle");
  const [blockErrors, setBlockErrors] = React.useState<Partial<Record<StyleBibleFieldKey, string>>>(
    {},
  );
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef(false);

  React.useEffect(() => {
    setDocument(loadDocument(initialBible, initialAnchorUrl));
  }, [initialAnchorUrl, initialBible]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const bible = document.fields;
  const blockImages = document.blockImages;

  function emit(next: StyleBibleDocument) {
    onUpdated?.({
      styleBible: next.fields,
      blockImages: next.blockImages,
      anchorImageUrl: null,
    });
  }

  function setField(key: StyleBibleFieldKey, value: string) {
    setDocument((prev) => {
      const next = {
        ...prev,
        fields: { ...prev.fields, [key]: value },
      };
      scheduleSave(next);
      return next;
    });
  }

  async function persistDocument(next: StyleBibleDocument) {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const saved: StyleBibleDocument = {
        fields: mergeStyleBible(null, data.document?.fields ?? data.styleBible ?? next.fields),
        blockImages: data.document?.blockImages ?? data.blockImages ?? next.blockImages,
      };
      setDocument(saved);
      emit(saved);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not save editorial line",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      savingRef.current = false;
      setStatus("idle");
    }
  }

  function scheduleSave(next: StyleBibleDocument) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistDocument(next);
    }, EDITORIAL_SAVE_MS);
  }

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/style-bible`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        if (data.document) {
          setDocument(data.document as StyleBibleDocument);
          emit(data.document as StyleBibleDocument);
        }
      } catch {
        // keep local document on fetch failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  async function handleGenerateBible() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setStatus("generating-bible");
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const next: StyleBibleDocument = {
        fields: mergeStyleBible(null, data.document?.fields ?? data.styleBible ?? {}),
        blockImages: data.document?.blockImages ?? data.blockImages ?? {},
      };
      setDocument(next);
      emit(next);
      setBlockErrors(data.referenceErrors ?? {});
      if (data.partial && data.warning) {
        toast({
          variant: "destructive",
          title: "Reference images failed",
          description: data.warning,
        });
      } else {
        setBlockErrors({});
        toast({ variant: "success", title: "Editorial line generated" });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate editorial line",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStatus("idle");
    }
  }

  async function handleGenerateBlock(field: StyleBibleFieldKey) {
    setStatus(`generating-${field}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible/blocks/${field}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const next: StyleBibleDocument = {
        ...document,
        blockImages: { ...document.blockImages, [field]: data.imageUrl as string },
      };
      setDocument(next);
      emit(next);
      setBlockErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[field];
        return nextErrors;
      });
      toast({ variant: "success", title: "Block reference generated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBlockErrors((prev) => ({ ...prev, [field]: message }));
      toast({
        variant: "destructive",
        title: "Could not generate block reference",
        description: message,
      });
    } finally {
      setStatus("idle");
    }
  }

  async function handleDeleteBlock(field: StyleBibleFieldKey) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/style-bible/blocks/${field}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const next: StyleBibleDocument = data.document ?? {
        fields: { ...document.fields, [field]: "" },
        blockImages: Object.fromEntries(
          Object.entries(document.blockImages).filter(([key]) => key !== field),
        ) as StyleBibleBlockImages,
      };
      setDocument(next);
      emit(next);
      toast({ variant: "success", title: "Block removed" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not delete block",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setStatus("idle");
    }
  }

  function clearBlockImage(field: StyleBibleFieldKey) {
    setDocument((prev) => {
      if (!prev.blockImages[field]) return prev;
      const next = {
        ...prev,
        blockImages: Object.fromEntries(
          Object.entries(prev.blockImages).filter(([key]) => key !== field),
        ) as StyleBibleBlockImages,
      };
      scheduleSave(next);
      return next;
    });
  }

  const busy = status !== "idle";
  const hasAnyText = STYLE_BIBLE_FIELDS.some((field) => bible[field.key].trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Project art direction">
          <Palette className="h-3.5 w-3.5" />
          Style
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-4 overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle>Editorial line</DialogTitle>
          <DialogDescription>
            Each block defines one aspect of the film look — palette, light, atmosphere, etc.
            &quot;Generate from story&quot; fills every block with text and creates one reference
            image per block. Each scene keeps its own location; these blocks unify how everything
            looks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-muted-foreground">
            {status === "generating-bible"
              ? "Generating editorial text and reference images — this may take a few minutes…"
              : status === "saving"
                ? "Saving changes…"
                : hasAnyText
                  ? "Edits save automatically. Regenerate to refresh all blocks from the story."
                  : "Generate from story to fill all blocks with text and reference images."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateBible}
            disabled={busy}
          >
            {status === "generating-bible" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {hasAnyText ? "Regenerate from story" : "Generate from story"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {STYLE_BIBLE_FIELDS.map((field) => {
              const imageUrl = blockImages[field.key];
              const blockError = blockErrors[field.key];
              const generating = status === `generating-${field.key}`;
              const hasText = bible[field.key].trim().length > 0;
              return (
                <article
                  key={field.key}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Label className="text-xs font-medium">{field.label}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteBlock(field.key)}
                      disabled={busy || (!hasText && !imageUrl)}
                      title="Delete this block"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div
                    className={cn(
                      "relative w-full overflow-hidden rounded-md border border-border bg-muted/40",
                      formatSpec.previewAspectClass,
                    )}
                  >
                    {imageUrl ? (
                      <EditorialReferenceImage
                        url={imageUrl}
                        alt={`${field.label} reference`}
                        className="h-full w-full object-cover"
                        onBroken={() => clearBlockImage(field.key)}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-2xs text-muted-foreground">
                        <ImageIcon className="h-5 w-5" />
                        <span>No reference</span>
                      </div>
                    )}
                  </div>

                  <Textarea
                    rows={field.rows}
                    placeholder={field.hint}
                    value={bible[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className="text-xs"
                  />

                  {blockError && (
                    <p className="text-[10px] leading-snug text-destructive">{blockError}</p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void handleGenerateBlock(field.key)}
                    disabled={busy || !hasText}
                    title={
                      hasText
                        ? "Generate one image for this block only"
                        : "Write the block text first"
                    }
                  >
                    {generating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    {imageUrl ? "Regenerate reference" : "Generate reference"}
                  </Button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
