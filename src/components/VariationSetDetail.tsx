"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Film,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type { VariationItem, VariationSet } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { AddToCreativesButton } from "@/components/creatives/AddToCreatives";
import { cn } from "@/lib/utils";
import { modelLabel, useModelCatalog } from "@/hooks/use-model-catalog";
import { rememberVariationModel, VariationModelSelect } from "@/components/VariationModelSelect";
import {
  ORIGINAL_DIRECTION,
  VARIATION_ASPECTS,
  VARIATION_COUNTS,
  normalizeVariationTextMode,
  variationDirectionLabel,
  type VariationAspect,
  type VariationTextMode,
} from "@/lib/variations";
import { VariationTextControl } from "@/components/VariationsManager";

const POLL_MS = 4000;

const ASPECT_CLASS: Record<VariationAspect, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "variation";
}

export function VariationSetDetail({
  initialSet,
  initialItems,
  initialModels,
}: {
  initialSet: VariationSet;
  initialItems: VariationItem[];
  initialModels: { imageModel: string; videoModel: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [set, setSet] = React.useState(initialSet);
  const [items, setItems] = React.useState(initialItems);
  const [aspect, setAspect] = React.useState<VariationAspect>(
    (VARIATION_ASPECTS as readonly string[]).includes(initialSet.aspectRatio)
      ? (initialSet.aspectRatio as VariationAspect)
      : "1:1",
  );
  const [count, setCount] = React.useState("4");
  const [instructions, setInstructions] = React.useState(initialSet.instructions ?? "");
  const [generating, setGenerating] = React.useState(false);
  const [imageModel, setImageModel] = React.useState(initialModels.imageModel);
  const [videoModel, setVideoModel] = React.useState(initialModels.videoModel);
  const [textMode, setTextMode] = React.useState<VariationTextMode>(
    normalizeVariationTextMode(initialSet.textMode),
  );
  const [customText, setCustomText] = React.useState(initialSet.customText ?? "");

  const busy = items.some((i) => i.status === "generating" || i.videoStatus === "generating");

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/variations/${set.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { set: VariationSet; items: VariationItem[] };
    setSet(data.set);
    setItems(data.items);
  }, [set.id]);

  React.useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(t);
  }, [busy, refresh]);

  function fail(title: string, err: unknown) {
    toast({ title, description: err instanceof Error ? err.message : String(err), variant: "destructive" });
  }

  async function call(url: string, init: RequestInit): Promise<void> {
    const res = await fetch(url, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  }

  async function generateMore() {
    setGenerating(true);
    try {
      await call(`/api/variations/${set.id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          count: Number(count),
          instructions: instructions.trim() || null,
          aspectRatio: aspect,
          imageModel,
          textMode,
          customText: textMode === "custom" ? customText.trim() : null,
        }),
      });
      await refresh();
    } catch (err) {
      fail("Could not generate", err);
    } finally {
      setGenerating(false);
    }
  }

  async function changeImageModel(next: string) {
    setImageModel(next);
    rememberVariationModel("image", next);
    try {
      await call(`/api/variations/${set.id}`, { method: "PATCH", body: JSON.stringify({ imageModel: next }) });
    } catch (err) {
      fail("Could not save the image AI", err);
    }
  }

  async function changeVideoModel(next: string) {
    setVideoModel(next);
    rememberVariationModel("video", next);
    try {
      await call(`/api/variations/${set.id}`, { method: "PATCH", body: JSON.stringify({ videoModel: next }) });
    } catch (err) {
      fail("Could not save the video AI", err);
    }
  }

  async function renameSet(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === set.name) return;
    try {
      await call(`/api/variations/${set.id}`, { method: "PATCH", body: JSON.stringify({ name: trimmed }) });
      setSet((s) => ({ ...s, name: trimmed }));
    } catch (err) {
      fail("Could not rename", err);
    }
  }

  async function deleteSet() {
    if (!window.confirm(`Delete "${set.name}" and all its variations?`)) return;
    try {
      await call(`/api/variations/${set.id}`, { method: "DELETE" });
      router.push("/variations");
      router.refresh();
    } catch (err) {
      fail("Could not delete", err);
    }
  }

  const fileBase = slug(set.name);

  return (
    <div className="mx-auto max-w-6xl px-5 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild title="All products">
            <Link href="/variations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Wand2 className="h-4 w-4 shrink-0 text-accent" />
          <Input
            defaultValue={set.name}
            onBlur={(e) => void renameSet(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-8 w-72 max-w-full border-transparent bg-transparent px-1 text-base font-semibold hover:border-border focus:border-border"
            maxLength={80}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => void deleteSet()}>
          <Trash2 className="h-3.5 w-3.5" /> Delete product
        </Button>
      </header>

      <section className="mb-5 space-y-3 rounded-lg border border-border bg-panel p-3">
        <div className="grid gap-3 rounded-md border border-accent/30 bg-accent/5 p-2.5 sm:grid-cols-2">
          <VariationModelSelect
            kind="image"
            label="AI for images"
            value={imageModel}
            onChange={(v) => void changeImageModel(v)}
          />
          <VariationModelSelect
            kind="video"
            label="AI for videos"
            value={videoModel}
            onChange={(v) => void changeVideoModel(v)}
          />
        </div>
        <VariationTextControl
          mode={textMode}
          onModeChange={setTextMode}
          customText={customText}
          onCustomTextChange={setCustomText}
        />
        <div>
          <Label htmlFor="variation-more-instructions" className="text-2xs text-muted-foreground">
            What should change? (optional)
          </Label>
          <Textarea
            id="variation-more-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Christmas theme, keep the text identical…"
            className="text-xs"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <SegmentedControl<VariationAspect>
              label="Format"
              value={aspect}
              onChange={setAspect}
              options={VARIATION_ASPECTS.map((a) => ({ value: a, label: a }))}
            />
          </div>
          <div className="w-40">
            <SegmentedControl<string>
              label="How many"
              value={count}
              onChange={setCount}
              options={VARIATION_COUNTS.map((c) => ({ value: String(c), label: String(c) }))}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            className="ml-auto"
            disabled={generating || (textMode === "custom" && !customText.trim())}
            onClick={() => void generateMore()}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate {count} more
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item, index) => (
          <VariationCard
            key={item.id}
            item={item}
            aspect={aspect}
            downloadName={`${fileBase}-${index === 0 ? "original" : index}`}
            videoModel={videoModel}
            onChanged={refresh}
            onRemoved={() => setItems((prev) => prev.filter((p) => p.id !== item.id))}
            call={call}
            fail={fail}
          />
        ))}
      </div>
    </div>
  );
}

function VariationCard({
  item,
  aspect,
  downloadName,
  videoModel,
  onChanged,
  onRemoved,
  call,
  fail,
}: {
  item: VariationItem;
  aspect: VariationAspect;
  downloadName: string;
  videoModel: string;
  onChanged: () => Promise<void>;
  onRemoved: () => void;
  call: (url: string, init: RequestInit) => Promise<void>;
  fail: (title: string, err: unknown) => void;
}) {
  const isOriginal = item.direction === ORIGINAL_DIRECTION;
  const { models: imageModels } = useModelCatalog("image");
  const { models: videoModels } = useModelCatalog("video");
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [videoPrompt, setVideoPrompt] = React.useState("");
  const [videoDuration, setVideoDuration] = React.useState("5");
  const [showVideo, setShowVideo] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  async function run(fn: () => Promise<void>, title: string) {
    setPending(true);
    try {
      await fn();
    } catch (err) {
      fail(title, err);
    } finally {
      setPending(false);
    }
  }

  const startVideo = () =>
    run(async () => {
      await call(`/api/variations/items/${item.id}/video`, {
        method: "POST",
        body: JSON.stringify({
          prompt: videoPrompt.trim() || null,
          durationSeconds: Number(videoDuration),
          videoModel,
        }),
      });
      setVideoOpen(false);
      setShowVideo(true);
      await onChanged();
    }, "Could not start the video");

  const retry = () =>
    run(async () => {
      await call(`/api/variations/items/${item.id}`, { method: "POST" });
      await onChanged();
    }, "Could not retry");

  const remove = () =>
    run(async () => {
      await call(`/api/variations/items/${item.id}`, { method: "DELETE" });
      onRemoved();
    }, "Could not delete");

  const videoGenerating = item.videoStatus === "generating";
  const playVideo = item.videoUrl && item.videoStatus === "ready" && showVideo;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className={cn("relative overflow-hidden bg-muted", ASPECT_CLASS[aspect])}>
        {playVideo ? (
          <video
            src={item.videoUrl ?? undefined}
            controls
            loop
            playsInline
            className="h-full w-full bg-black object-contain"
          />
        ) : item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={variationDirectionLabel(item.direction)} className="h-full w-full object-contain" />
        ) : null}

        {item.status === "generating" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-2xs">Creating variation…</span>
          </div>
        ) : null}

        {item.status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="line-clamp-3 text-2xs text-muted-foreground">{item.error || "Failed"}</span>
            <Button variant="outline" size="xs" disabled={pending} onClick={() => void retry()}>
              <RotateCcw className="h-3 w-3" /> Try again
            </Button>
          </div>
        ) : null}

        {videoGenerating ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/70 px-2 py-1.5 text-2xs text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> Making video… usually 2–5 min
          </div>
        ) : null}

        <span
          className={cn(
            "absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
            isOriginal ? "bg-foreground text-background" : "bg-background/85 text-foreground",
          )}
        >
          {variationDirectionLabel(item.direction)}
        </span>
        {!isOriginal && item.imageModel ? (
          <span className="absolute right-1.5 top-1.5 max-w-[60%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {modelLabel(imageModels, item.imageModel)}
          </span>
        ) : null}
      </div>

      {item.headline ? (
        <p
          className="line-clamp-3 whitespace-pre-line border-t border-border px-2 py-1 text-2xs text-muted-foreground"
          title={item.headline}
        >
          “{item.headline}”
        </p>
      ) : null}

      {item.videoModel && item.videoStatus ? (
        <p className="flex items-center gap-1 border-t border-border px-2 py-1 text-2xs text-muted-foreground">
          <Film className="h-3 w-3" /> {modelLabel(videoModels, item.videoModel)}
        </p>
      ) : null}

      {item.videoStatus === "error" ? (
        <p className="line-clamp-2 border-t border-border px-2 py-1 text-2xs text-destructive" title={item.videoError ?? ""}>
          Video failed: {item.videoError || "unknown error"}
        </p>
      ) : null}

      {item.status === "ready" ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-border px-1.5 py-1.5">
          <Button variant="ghost" size="xs" asChild title="Download image">
            <a href={item.imageUrl ?? "#"} download={`${downloadName}.png`}>
              <Download className="h-3 w-3" /> Image
            </a>
          </Button>
          {item.videoUrl && item.videoStatus === "ready" ? (
            <>
              <Button variant="ghost" size="xs" asChild title="Download video">
                <a href={item.videoUrl} download={`${downloadName}.mp4`}>
                  <Download className="h-3 w-3" /> Video
                </a>
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setShowVideo((v) => !v)}>
                {showVideo ? "Show image" : "Play video"}
              </Button>
            </>
          ) : null}
          <Button
            variant={videoOpen ? "outline" : "ghost"}
            size="xs"
            disabled={videoGenerating}
            onClick={() => setVideoOpen((v) => !v)}
            title="Turn this image into a short video"
          >
            <Film className="h-3 w-3" /> {item.videoUrl ? "New video" : "Make video"}
          </Button>
          <AddToCreativesButton
            variant="ghost"
            label="Creative"
            name={downloadName.replace(/-(original|\d+)$/, "")}
            source={{
              type: "variation",
              id: item.id,
              hasImage: !!item.imageUrl,
              hasVideo: !!item.videoUrl && item.videoStatus === "ready",
            }}
          />
          {!isOriginal ? (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto text-muted-foreground hover:text-destructive"
              disabled={pending}
              onClick={() => void remove()}
              title="Delete variation"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ) : !isOriginal && item.status === "error" ? (
        <div className="flex justify-end border-t border-border px-1.5 py-1.5">
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => void remove()}>
            <Trash2 className="h-3 w-3" /> Remove
          </Button>
        </div>
      ) : null}

      {videoOpen ? (
        <div className="space-y-2 border-t border-border p-2">
          <p className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Film className="h-3 w-3" /> {modelLabel(videoModels, videoModel)}
            <span className="opacity-70">— change in “AI for videos” above</span>
          </p>
          <Textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Motion idea (optional) — e.g. slow zoom on the bottle, water splash…"
            className="text-xs"
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SegmentedControl<string>
                label="Length"
                value={videoDuration}
                onChange={setVideoDuration}
                options={[
                  { value: "5", label: "5s" },
                  { value: "10", label: "10s" },
                ]}
              />
            </div>
            <Button variant="primary" size="sm" disabled={pending} onClick={() => void startVideo()}>
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}
              Generate
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
