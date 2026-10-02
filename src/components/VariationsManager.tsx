"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Sparkles, Wand2, X } from "lucide-react";
import type { VariationSet } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { shrinkImageFile } from "@/lib/social-art/shrink-image";
import { cn } from "@/lib/utils";
import { modelLabel, useModelCatalog } from "@/hooks/use-model-catalog";
import {
  useRememberedVariationModel,
  VariationModelSelect,
} from "@/components/VariationModelSelect";
import {
  closestVariationAspect,
  VARIATION_ASPECT_LABELS,
  VARIATION_ASPECTS,
  VARIATION_COUNTS,
  VARIATION_TEXT_MODE_LABELS,
  VARIATION_TEXT_MODES,
  type VariationAspect,
  type VariationTextMode,
} from "@/lib/variations";

const SHRINK_ABOVE_BYTES = 4 * 1024 * 1024;

export function VariationsManager({
  initial,
  defaults,
}: {
  initial: VariationSet[];
  defaults: { imageModel: string; videoModel: string };
}) {
  const { models: imageModels } = useModelCatalog("image");
  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      <header className="mb-4">
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <Wand2 className="h-4 w-4 text-accent" /> Variations
        </h1>
        <p className="text-2xs text-muted-foreground">
          Drop an ad image and get new versions of it — same product and message, new looks. Turn
          any of them into a video.
        </p>
      </header>

      <NewVariationSetCard defaults={defaults} />

      {initial.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Products ({initial.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {initial.map((set) => (
              <Link
                key={set.id}
                href={`/variations/${set.id}`}
                className="group overflow-hidden rounded-lg border border-border bg-panel transition-colors hover:border-accent/60"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={set.sourceImageUrl}
                    alt={set.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-medium">{set.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {VARIATION_ASPECT_LABELS[set.aspectRatio as VariationAspect] ?? set.aspectRatio} ·{" "}
                    {modelLabel(imageModels, set.imageModel ?? defaults.imageModel)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function VariationTextControl({
  mode,
  onModeChange,
  customText,
  onCustomTextChange,
}: {
  mode: VariationTextMode;
  onModeChange: (mode: VariationTextMode) => void;
  customText: string;
  onCustomTextChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <SegmentedControl<VariationTextMode>
        label="Text on the image"
        value={mode}
        onChange={onModeChange}
        options={VARIATION_TEXT_MODES.map((m) => ({ value: m, label: VARIATION_TEXT_MODE_LABELS[m] }))}
      />
      {mode === "rewrite" ? (
        <p className="text-2xs text-muted-foreground">
          The AI reads the ad and writes a different headline for each variation, replacing the old text
          completely. Steer it in “What should change?”.
        </p>
      ) : null}
      {mode === "custom" ? (
        <Textarea
          value={customText}
          onChange={(e) => onCustomTextChange(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder={"Exact text for the image — one line per row, e.g.\nFature 10k por mês\ncom IA e CRM"}
          className="text-xs"
        />
      ) : null}
    </div>
  );
}

function NewVariationSetCard({ defaults }: { defaults: { imageModel: string; videoModel: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [imageModel, setImageModel] = useRememberedVariationModel("image", defaults.imageModel);
  const [videoModel, setVideoModel] = useRememberedVariationModel("video", defaults.videoModel);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [aspect, setAspect] = React.useState<VariationAspect>("1:1");
  const [count, setCount] = React.useState<string>("4");
  const [instructions, setInstructions] = React.useState("");
  const [textMode, setTextMode] = React.useState<VariationTextMode>("keep");
  const [customText, setCustomText] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(next: File | null | undefined) {
    if (!next || !next.type.startsWith("image/")) return;
    setFile(next);
    const url = URL.createObjectURL(next);
    setPreview(url);
    if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80));
    const img = new Image();
    img.onload = () => setAspect(closestVariationAspect(img.naturalWidth, img.naturalHeight));
    img.src = url;
  }

  function clear() {
    setFile(null);
    setPreview(null);
  }

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    try {
      const upload = file.size > SHRINK_ABOVE_BYTES ? await shrinkImageFile(file, 2400, 0.9) : file;
      const fd = new FormData();
      fd.set("image", upload);
      fd.set("name", name.trim());
      fd.set("aspectRatio", aspect);
      fd.set("count", count);
      fd.set("imageModel", imageModel);
      fd.set("videoModel", videoModel);
      if (instructions.trim()) fd.set("instructions", instructions.trim());
      fd.set("textMode", textMode);
      if (textMode === "custom") fd.set("customText", customText.trim());
      const res = await fetch("/api/variations", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { set?: VariationSet; error?: string };
      if (!res.ok || !data.set) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/variations/${data.set.id}`);
    } catch (err) {
      toast({
        title: "Could not start",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-panel p-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted/40 transition-colors",
          dragging ? "border-accent bg-accent/10" : "border-border",
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Source ad" className="h-full w-full object-contain" />
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute right-1.5 top-1.5"
              onClick={clear}
              title="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs font-medium">Drop your ad image here</span>
            <span className="text-2xs">or click to choose · JPG, PNG, WebP</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="variation-name">Product name</Label>
          <Input
            id="variation-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer serum launch"
            maxLength={80}
          />
        </div>
        <div className="grid gap-3 rounded-md border border-accent/30 bg-accent/5 p-2.5 sm:grid-cols-2">
          <VariationModelSelect kind="image" label="AI for images" value={imageModel} onChange={setImageModel} />
          <VariationModelSelect kind="video" label="AI for videos" value={videoModel} onChange={setVideoModel} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SegmentedControl<VariationAspect>
            label="Format"
            value={aspect}
            onChange={setAspect}
            options={VARIATION_ASPECTS.map((a) => ({ value: a, label: a }))}
          />
          <SegmentedControl<string>
            label="How many variations"
            value={count}
            onChange={setCount}
            options={VARIATION_COUNTS.map((c) => ({ value: String(c), label: String(c) }))}
          />
        </div>
        <VariationTextControl
          mode={textMode}
          onModeChange={setTextMode}
          customText={customText}
          onCustomTextChange={setCustomText}
        />
        <div>
          <Label htmlFor="variation-instructions">What should change? (optional)</Label>
          <Textarea
            id="variation-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. Beach and summer vibe, keep the headline in Portuguese, swap the bottle color to green…"
          />
        </div>
        <div className="mt-auto flex items-center justify-end gap-2">
          <span className="text-2xs text-muted-foreground">
            Same product and text, new looks.
          </span>
          <Button
            variant="primary"
            size="md"
            disabled={!file || submitting || (textMode === "custom" && !customText.trim())}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate variations
          </Button>
        </div>
      </div>
    </div>
  );
}
