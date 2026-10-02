"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Loader2, Sparkles } from "lucide-react";
import type { Creative } from "@/lib/db/schema";
import type { VariationSet } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { cn } from "@/lib/utils";
import {
  CREATIVE_FORMATS,
  CREATIVE_LANGUAGES,
  CREATIVE_RATIOS,
  buildCreativeName,
  creativeCode,
  ratioFromSize,
  type CreativeFormat,
} from "@/lib/creatives";
import { VARIATION_ASPECTS, VARIATION_COUNTS, closestVariationAspect, type VariationAspect } from "@/lib/variations";
import { fmtDuration, nameOf, readLocalMediaSize, type Concept } from "@/components/creatives/shared";

const FORMAT_OPTIONS = (Object.keys(CREATIVE_FORMATS) as CreativeFormat[]).map((f) => ({ value: f, label: f }));
const LANGUAGE_OPTIONS = CREATIVE_LANGUAGES.map((l) => ({ value: l as string, label: l }));

async function sendJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function ProductInput({
  id,
  value,
  onChange,
  products,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  products: string[];
}) {
  return (
    <>
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. EXTRATOR"
        maxLength={16}
      />
      <datalist id={`${id}-list`}>
        {products.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

function NamePreview({ name }: { name: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-2">
      <p className="text-2xs text-muted-foreground">File and ad name</p>
      <p className="break-all font-mono text-xs">{name}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

export type UploadTarget = { mode: "new"; product?: string } | { mode: "version" | "size"; base: Creative };

export function UploadDialog({
  target,
  onClose,
  nextCode,
  nextVersion,
  products,
  onCreated,
}: {
  target: UploadTarget | null;
  onClose: () => void;
  nextCode: number;
  nextVersion: (code: number) => number;
  products: string[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [size, setSize] = React.useState<{ width: number; height: number; duration: number | null } | null>(null);
  const [product, setProduct] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [hook, setHook] = React.useState("");
  const [format, setFormat] = React.useState<CreativeFormat>("IMG");
  const [creator, setCreator] = React.useState("");
  const [language, setLanguage] = React.useState("PT");
  const [submitting, setSubmitting] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const base = target && target.mode !== "new" ? target.base : null;

  React.useEffect(() => {
    if (!target) return;
    setFile(null);
    setSize(null);
    setSubmitting(false);
    setProduct(base?.product ?? (target.mode === "new" ? (target.product ?? "") : ""));
    setAngle(base?.angle ?? "");
    setHook(base?.hook ?? "");
    setFormat((base?.format as CreativeFormat) ?? "IMG");
    setCreator(base?.creator ?? "");
    setLanguage(base?.language ?? "PT");
  }, [target, base]);

  async function pick(next: File | null | undefined) {
    if (!next) return;
    setFile(next);
    const isVideo = next.type.startsWith("video/") || /\.(mp4|mov)$/i.test(next.name);
    if (!base && format === "IMG" && isVideo) setFormat("VID");
    setSize(await readLocalMediaSize(next));
  }

  const code = base?.code ?? nextCode;
  const version = !base ? 1 : target?.mode === "version" ? nextVersion(base.code) : base.version;
  const ratio = ratioFromSize(size?.width, size?.height);
  const preview = buildCreativeName({
    code,
    product,
    angle,
    format,
    creator,
    aspectRatio: ratio ?? "?x?",
    version,
    language,
  });

  async function submit() {
    if (!file || !target) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", target.mode);
      if (base) fd.set("fromId", base.id);
      fd.set("product", product);
      fd.set("angle", angle);
      fd.set("hook", hook);
      fd.set("format", format);
      fd.set("creator", creator);
      fd.set("language", language);
      const res = await fetch("/api/creatives", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { creative?: Creative; error?: string };
      if (!res.ok || !data.creative) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ title: "Creative added", description: nameOf(data.creative) });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setSubmitting(false);
    }
  }

  const title = !base
    ? "New concept"
    : target?.mode === "version"
      ? `New version of ${creativeCode(base.code)}`
      : `Another size of ${creativeCode(base.code)} v${base.version}`;
  const description = !base
    ? "A new hook or idea gets the next code. Variations of it later become v2, v3…"
    : target?.mode === "version"
      ? "Same hook, different execution (new image, edit, cut or text)."
      : "The same piece in another aspect ratio — it keeps the code and version.";

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 transition-colors",
            dragging ? "border-accent bg-accent/10" : "border-border hover:border-accent/60",
          )}
        >
          <FileUp className="h-5 w-5 shrink-0 text-muted-foreground" />
          {file ? (
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-2xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
                {size ? ` · ${size.width}×${size.height}` : ""}
                {size?.duration ? ` · ${fmtDuration(size.duration)}` : ""}
                {ratio ? ` · ${ratio.replace("x", ":")}` : ""}
              </p>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Drop the file or click to choose</p>
              <p className="text-2xs">PNG, JPG, WebP, MP4 or MOV · the aspect ratio is detected</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.mov"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {ratio === "2x3" ? (
          <p className="text-2xs text-warning">
            2:3 gets cropped to 4:5 in the Meta feed — make a 4:5 and a 9:16 version for best delivery.
          </p>
        ) : null}

        {!base ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="creative-product">Folder (product)</Label>
              <ProductInput id="creative-product" value={product} onChange={setProduct} products={products} />
            </div>
            <div>
              <Label htmlFor="creative-angle">Angle (short)</Label>
              <Input
                id="creative-angle"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="e.g. Sells while you sleep"
                maxLength={60}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="creative-hook">Hook (first line / first 3 seconds)</Label>
              <Textarea
                id="creative-hook"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                rows={2}
                maxLength={300}
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl<CreativeFormat> label="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
          <SegmentedControl<string> label="Language" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
          {format === "UGC" ? (
            <div>
              <Label htmlFor="creative-creator">Creator</Label>
              <Input
                id="creative-creator"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="e.g. Marina"
                maxLength={20}
              />
            </div>
          ) : null}
        </div>

        <NamePreview name={preview} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!file || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Add creative
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ConceptEditDialog({
  concept,
  onClose,
  products,
  onSaved,
}: {
  concept: Concept | null;
  onClose: () => void;
  products: string[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [product, setProduct] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [hook, setHook] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!concept) return;
    setProduct(concept.product);
    setAngle(concept.angle);
    setHook(concept.hook);
    setNotes(concept.notes);
    setSaving(false);
  }, [concept]);

  async function save() {
    if (!concept) return;
    setSaving(true);
    try {
      await sendJson(`/api/creatives/concepts/${concept.code}`, "PATCH", { product, angle, hook, notes });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!concept} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {concept ? creativeCode(concept.code) : ""}</DialogTitle>
          <DialogDescription>Applies to every version and size of this concept.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="concept-product">Folder (product)</Label>
            <ProductInput id="concept-product" value={product} onChange={setProduct} products={products} />
          </div>
          <div>
            <Label htmlFor="concept-angle">Angle</Label>
            <Input id="concept-angle" value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={60} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="concept-hook">Hook</Label>
            <Textarea id="concept-hook" value={hook} onChange={(e) => setHook(e.target.value)} rows={2} maxLength={300} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="concept-notes">Notes / learnings</Label>
            <Textarea
              id="concept-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What worked, what didn't, audiences tested…"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FileEditDialog({
  creative,
  onClose,
  onSaved,
}: {
  creative: Creative | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [format, setFormat] = React.useState<CreativeFormat>("IMG");
  const [creator, setCreator] = React.useState("");
  const [aspectRatio, setAspectRatio] = React.useState("1x1");
  const [version, setVersion] = React.useState("1");
  const [language, setLanguage] = React.useState("PT");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!creative) return;
    setFormat(creative.format as CreativeFormat);
    setCreator(creative.creator);
    setAspectRatio(creative.aspectRatio);
    setVersion(String(creative.version));
    setLanguage(creative.language);
    setSaving(false);
  }, [creative]);

  async function save() {
    if (!creative) return;
    setSaving(true);
    try {
      await sendJson(`/api/creatives/${creative.id}`, "PATCH", {
        format,
        creator,
        aspectRatio,
        version: Math.max(1, Math.round(Number(version) || 1)),
        language,
      });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setSaving(false);
    }
  }

  const preview = creative
    ? buildCreativeName({ ...creative, format, creator, aspectRatio, version: Number(version) || 1, language })
    : "";

  return (
    <Dialog open={!!creative} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit file</DialogTitle>
          <DialogDescription>{creative?.originalName}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl<CreativeFormat> label="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
          <SegmentedControl<string> label="Language" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
          <div>
            <Label>Aspect ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CREATIVE_RATIOS).map(([r, label]) => (
                  <SelectItem key={r} value={r}>
                    {r.replace("x", ":")} — {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="file-version">Version</Label>
            <Input id="file-version" type="number" min={1} value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          {format === "UGC" ? (
            <div>
              <Label htmlFor="file-creator">Creator</Label>
              <Input id="file-creator" value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={20} />
            </div>
          ) : null}
        </div>
        <NamePreview name={preview} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

type VariationPick = {
  id: string;
  imageUrl: string;
  videoUrl: string | null;
  direction: string | null;
  setName: string;
};

export function FromVariationsDialog({
  open,
  onClose,
  concepts,
  products,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  concepts: Concept[];
  products: string[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<VariationPick[] | null>(null);
  const [selected, setSelected] = React.useState<VariationPick | null>(null);
  const [useVideo, setUseVideo] = React.useState(false);
  const [target, setTarget] = React.useState("new");
  const [product, setProduct] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [hook, setHook] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setItems(null);
    setSelected(null);
    setUseVideo(false);
    setTarget("new");
    setSaving(false);
    fetch("/api/creatives/from-variation")
      .then((r) => r.json())
      .then((d: { items?: VariationPick[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, [open]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const baseFile = target === "new" ? null : concepts.find((c) => String(c.code) === target)?.files[0];
      await sendJson("/api/creatives/from-variation", "POST", {
        itemId: selected.id,
        useVideo,
        mode: baseFile ? "version" : "new",
        fromId: baseFile?.id,
        product,
        angle,
        hook,
        format: useVideo ? "VID" : "IMG",
      });
      toast({ title: "Added to Creatives" });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: "Could not import", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add from Variations</DialogTitle>
          <DialogDescription>Pick a generated variation and file it as a concept or a new version.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[40vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-5">
          {items === null ? (
            <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
              No finished variations yet.
            </p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setSelected(it);
                  setUseVideo(false);
                  if (!product && !angle) setAngle(it.setName);
                }}
                className={cn(
                  "relative overflow-hidden rounded-md border-2 bg-muted",
                  selected?.id === it.id ? "border-accent" : "border-transparent hover:border-border",
                )}
                title={it.direction ?? it.setName}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt="" className="aspect-square w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-left text-2xs text-white">
                  {it.setName}
                  {it.videoUrl ? " · video" : ""}
                </span>
              </button>
            ))
          )}
        </div>
        {selected ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {selected.videoUrl ? (
              <SegmentedControl<string>
                label="Use"
                value={useVideo ? "video" : "image"}
                onChange={(v) => setUseVideo(v === "video")}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                ]}
              />
            ) : null}
            <div>
              <Label>File as</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New concept</SelectItem>
                  {concepts.map((c) => (
                    <SelectItem key={c.code} value={String(c.code)}>
                      New version of {creativeCode(c.code)} · {c.product} {c.angle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {target === "new" ? (
              <>
                <div>
                  <Label htmlFor="fv-product">Product</Label>
                  <ProductInput id="fv-product" value={product} onChange={setProduct} products={products} />
                </div>
                <div>
                  <Label htmlFor="fv-angle">Angle</Label>
                  <Input id="fv-angle" value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={60} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="fv-hook">Hook</Label>
                  <Input id="fv-hook" value={hook} onChange={(e) => setHook(e.target.value)} maxLength={300} />
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!selected || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Add creative
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

const SHRINK_ABOVE_BYTES = 4 * 1024 * 1024;

export function GenerateVariationsDialog({ creative, onClose }: { creative: Creative | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [aspect, setAspect] = React.useState<VariationAspect>("4:5");
  const [count, setCount] = React.useState("4");
  const [instructions, setInstructions] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!creative) return;
    setSubmitting(false);
    setInstructions("");
    setAspect(
      creative.aspectRatio === "2x3"
        ? "4:5"
        : creative.width && creative.height
          ? closestVariationAspect(creative.width, creative.height)
          : "4:5",
    );
  }, [creative]);

  async function submit() {
    if (!creative) return;
    setSubmitting(true);
    try {
      const blob = await fetch(creative.fileUrl).then((r) => {
        if (!r.ok) throw new Error(`Could not read the image (HTTP ${r.status})`);
        return r.blob();
      });
      const ext = creative.mimeType === "image/jpeg" ? "jpg" : creative.mimeType.split("/")[1];
      let file = new File([blob], `${nameOf(creative)}.${ext}`, { type: creative.mimeType });
      if (file.size > SHRINK_ABOVE_BYTES) file = await shrinkImageFile(file, 2400, 0.9);
      const fd = new FormData();
      fd.set("image", file);
      fd.set("name", `${creativeCode(creative.code)} ${creative.product} ${creative.angle}`.slice(0, 80));
      fd.set("aspectRatio", aspect);
      fd.set("count", count);
      if (instructions.trim()) fd.set("instructions", instructions.trim());
      const res = await fetch("/api/variations", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { set?: VariationSet; error?: string };
      if (!res.ok || !data.set) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/variations/${data.set.id}`);
    } catch (err) {
      toast({ title: "Could not start", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!creative} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate variations</DialogTitle>
          <DialogDescription>
            Opens Variations with this creative as the source. Bring the best results back here with “Add from
            Variations”.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl<VariationAspect>
            label="Format"
            value={aspect}
            onChange={setAspect}
            options={VARIATION_ASPECTS.map((a) => ({ value: a, label: a }))}
          />
          <SegmentedControl<string>
            label="How many"
            value={count}
            onChange={setCount}
            options={VARIATION_COUNTS.map((c) => ({ value: String(c), label: String(c) }))}
          />
        </div>
        <div>
          <Label htmlFor="gv-instructions">What should change? (optional)</Label>
          <Textarea
            id="gv-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. Same message, recompose for 4:5 with the headline on top…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { sendJson };
