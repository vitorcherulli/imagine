"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Megaphone } from "lucide-react";
import type { Creative } from "@/lib/db/schema";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import {
  CREATIVE_FORMATS,
  CREATIVE_LANGUAGES,
  buildAdName,
  creativeCode,
  toNameSlug,
  type CreativeFormat,
} from "@/lib/creatives";
import { groupConcepts, nameOf, type CreativeLibrary } from "@/components/creatives/shared";

/** Where the media comes from: a stored output the server can look up, or a file rendered in the browser. */
export type CreativeSource =
  | { type: "variation"; id: string; hasImage: boolean; hasVideo: boolean }
  | { type: "export" | "asset" | "dubbing" | "image-chat"; id: string; isVideo: boolean }
  | { type: "file"; getFile: () => Promise<File>; sourceRef?: string; isVideo: boolean };

const FORMAT_OPTIONS = (Object.keys(CREATIVE_FORMATS) as CreativeFormat[]).map((f) => ({ value: f, label: f }));

export function AddToCreativesButton({
  source,
  name,
  language,
  format,
  label = "Add to Creatives",
  iconOnly,
  className,
  variant = "outline",
  size = "xs",
}: {
  source: CreativeSource;
  name?: string;
  language?: string;
  format?: CreativeFormat;
  label?: string;
  iconOnly?: boolean;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? "icon-sm" : size}
        className={className}
        title="Add to Creatives — your ad library"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Megaphone className="h-3 w-3" />
        {iconOnly ? null : label}
      </Button>
      {open ? (
        <AddToCreativesDialog
          source={source}
          name={name}
          language={language}
          format={format}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AddToCreativesDialog({
  source,
  name,
  language: initialLanguage,
  format: initialFormat,
  onClose,
}: {
  source: CreativeSource;
  name?: string;
  language?: string;
  format?: CreativeFormat;
  onClose: () => void;
}) {
  const [library, setLibrary] = React.useState<CreativeLibrary | null>(null);
  const [useVideo, setUseVideo] = React.useState(
    source.type === "variation" ? source.hasVideo && !source.hasImage : source.isVideo,
  );
  const [target, setTarget] = React.useState("new");
  const [product, setProduct] = React.useState("");
  const [angle, setAngle] = React.useState(toNameSlug(name ?? ""));
  const [hook, setHook] = React.useState("");
  const [format, setFormat] = React.useState<CreativeFormat>(initialFormat ?? (useVideo ? "VID" : "IMG"));
  const [creator, setCreator] = React.useState("");
  const [language, setLanguage] = React.useState(
    initialLanguage && (CREATIVE_LANGUAGES as readonly string[]).includes(initialLanguage) ? initialLanguage : "PT",
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ creative: Creative; existing: boolean } | null>(null);

  React.useEffect(() => {
    fetch("/api/creatives", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CreativeLibrary | null) => setLibrary(d))
      .catch(() => setLibrary(null));
  }, []);

  const concepts = React.useMemo(() => (library ? groupConcepts(library.creatives) : []), [library]);
  const folders = React.useMemo(
    () => (library ? [...new Set([...library.folders, ...concepts.map((c) => c.product)])].sort() : []),
    [library, concepts],
  );
  const base = target === "new" ? null : concepts.find((c) => String(c.code) === target) ?? null;
  const nextCode = Math.max(0, ...concepts.map((c) => c.code)) + 1;

  const previewName = buildAdName({
    code: base?.code ?? nextCode,
    product: base?.product ?? product,
    angle: base?.angle ?? angle,
    format,
    creator,
    version: base ? Math.max(...base.versions.map((v) => v.version)) + 1 : 1,
    language,
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const meta = {
        mode: base ? "version" : "new",
        fromId: base?.versions[0].files[0].id,
        product,
        angle,
        hook,
        format,
        creator,
        language,
      };
      let res: Response;
      if (source.type === "file") {
        const file = await source.getFile();
        const fd = new FormData();
        fd.set("file", file);
        for (const [k, v] of Object.entries(meta)) if (v) fd.set(k, String(v));
        fd.set("source", "social-art");
        if (source.sourceRef) fd.set("sourceRef", source.sourceRef);
        res = await fetch("/api/creatives", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/creatives/from-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: source.type, id: source.id, useVideo, ...meta }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as { creative?: Creative; existing?: boolean; error?: string };
      if (!res.ok || !data.creative) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ creative: data.creative, existing: !!data.existing });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-accent" /> Add to Creatives
          </DialogTitle>
          <DialogDescription>
            Files it in your ad library with a standard name, so you can run it on Meta and track its results.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium">
                {result.existing ? "This is already in Creatives:" : "Added as:"}
              </p>
              <p className="break-all font-mono text-xs">{nameOf(result.creative)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button asChild variant="primary">
                <Link href={`/creatives?c=${result.creative.code}`}>Open in Creatives</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {source.type === "variation" && source.hasImage && source.hasVideo ? (
              <SegmentedControl<string>
                label="Use"
                value={useVideo ? "video" : "image"}
                onChange={(v) => {
                  setUseVideo(v === "video");
                  setFormat(v === "video" ? "VID" : "IMG");
                }}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                ]}
              />
            ) : null}

            <div>
              <Label>Add as</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder={library ? undefined : "Loading…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New concept (new hook or idea)</SelectItem>
                  {concepts.map((c) => (
                    <SelectItem key={c.code} value={String(c.code)}>
                      New version of {creativeCode(c.code)} · {c.product} · {c.angle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!base ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="atc-folder">Folder (product)</Label>
                  <Input
                    id="atc-folder"
                    list="atc-folders"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="e.g. EXTRATOR"
                    maxLength={16}
                  />
                  <datalist id="atc-folders">
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label htmlFor="atc-angle">Angle (short)</Label>
                  <Input id="atc-angle" value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={60} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="atc-hook">Hook (optional)</Label>
                  <Textarea id="atc-hook" value={hook} onChange={(e) => setHook(e.target.value)} rows={2} maxLength={300} />
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <SegmentedControl<CreativeFormat> label="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
              <SegmentedControl<string>
                label="Language"
                value={language}
                onChange={setLanguage}
                options={CREATIVE_LANGUAGES.map((l) => ({ value: l as string, label: l }))}
              />
              {format === "UGC" ? (
                <div>
                  <Label htmlFor="atc-creator">Creator</Label>
                  <Input id="atc-creator" value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={20} />
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-2">
              <p className="text-2xs text-muted-foreground">Ad name (the size is added from the file)</p>
              <p className="break-all font-mono text-xs">{previewName}</p>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={saving || !library} onClick={() => void save()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Add
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

