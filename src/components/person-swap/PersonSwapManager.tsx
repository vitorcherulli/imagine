"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, Loader2, Sparkles, UserRoundCog, X } from "lucide-react";
import type { Avatar, PersonSwap, PersonSwapItem, Scenario } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { ScenarioPicker } from "@/components/ScenarioPicker";
import { VariationModelSelect } from "@/components/VariationModelSelect";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { DEFAULT_PERSON_SWAP_MODEL, swapMaxSeconds, type CatalogModel } from "@/lib/model-catalog";
import {
  DEFAULT_SWAP_IMAGE_MODEL,
  isSwapWorking,
  PERSON_SWAP_MAX_SECONDS,
  PERSON_SWAP_MAX_UPLOAD_BYTES,
  PUBLIC_MEDIA_REQUIRED,
  type PersonSwapMode,
} from "@/lib/person-swap";
import { cn } from "@/lib/utils";
import {
  appendPeople,
  EMPTY_PEOPLE,
  PeoplePicker,
  peopleCount,
  VoiceControl,
  type PeopleValue,
} from "@/components/person-swap/parts";

export type SwapWithItems = PersonSwap & { items: PersonSwapItem[] };

const MODEL_KEY = "imagine.swap.videoModel";
const IMAGE_MODEL_KEY = "imagine.swap.imageModel";

function useRemembered(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = React.useState(fallback);
  React.useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored) setValue(stored);
  }, [key]);
  return [
    value,
    React.useCallback(
      (v: string) => {
        setValue(v);
        window.localStorage.setItem(key, v);
      },
      [key],
    ),
  ];
}

/** "~$0.28/s" × seconds → rough cost per person. */
export function estimateSwapCost(model: CatalogModel | undefined, seconds: number): string | null {
  const perSecond = Number(model?.priceHint?.match(/\$([\d.]+)\/s/)?.[1]);
  if (!model || !Number.isFinite(perSecond) || seconds <= 0) return null;
  const used = Math.min(seconds, swapMaxSeconds(model));
  return `≈ $${(perSecond * used).toFixed(2)} per person`;
}

export function PersonSwapManager({
  initial,
  avatars,
  scenarios,
  initialSource,
  publicMedia,
}: {
  initial: SwapWithItems[];
  avatars: Avatar[];
  scenarios: Scenario[];
  initialSource: { url: string; name: string } | null;
  publicMedia: boolean;
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      <header className="mb-4">
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <UserRoundCog className="h-4 w-4 text-accent" /> Person swap
        </h1>
        <p className="text-2xs text-muted-foreground">
          Upload a video, pick who should be in it, and get the same video with the new person — same
          movements, background and timing. Keep the voice or change it to ours, then dub it to any language.
        </p>
      </header>

      {!publicMedia ? (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-2xs text-amber-700 dark:text-amber-300">
          {PUBLIC_MEDIA_REQUIRED}
        </p>
      ) : null}

      <NewSwapCard avatars={avatars} scenarios={scenarios} initialSource={initialSource} />

      {initial.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Videos ({initial.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {initial.map((swap) => (
              <SwapCard key={swap.id} swap={swap} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SwapCard({ swap }: { swap: SwapWithItems }) {
  const ready = swap.items.filter((i) => i.status === "ready");
  const working = swap.items.filter((i) => isSwapWorking(i.status)).length;
  const failed = swap.items.filter((i) => i.status === "error").length;
  const cover = ready[0]?.videoUrl ?? swap.sourceUrl;
  return (
    <Link
      href={`/swap/${swap.id}`}
      className="group overflow-hidden rounded-lg border border-border bg-panel transition-colors hover:border-accent/60"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        <video src={`${cover}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        {working > 0 ? (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> {working} working
          </span>
        ) : null}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-medium">{swap.name}</p>
        <p className="truncate text-2xs text-muted-foreground">
          {swap.items.map((i) => i.avatarName).filter(Boolean).join(", ") || "No people yet"}
          {failed ? ` · ${failed} failed` : ""}
        </p>
      </div>
    </Link>
  );
}

function NewSwapCard({
  avatars,
  scenarios,
  initialSource,
}: {
  avatars: Avatar[];
  scenarios: Scenario[];
  initialSource: { url: string; name: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { models } = useModelCatalog("video", "swap");
  const [videoModel, setVideoModel] = useRemembered(MODEL_KEY, DEFAULT_PERSON_SWAP_MODEL);
  const [imageModel, setImageModel] = useRemembered(IMAGE_MODEL_KEY, DEFAULT_SWAP_IMAGE_MODEL);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = React.useState<string | null>(initialSource?.url ?? null);
  const [preview, setPreview] = React.useState<string | null>(initialSource?.url ?? null);
  const [duration, setDuration] = React.useState(0);
  const [hasAudio, setHasAudio] = React.useState(true);
  const [name, setName] = React.useState(initialSource?.name ?? "");
  const [people, setPeople] = React.useState<PeopleValue>(EMPTY_PEOPLE);
  const [mode, setMode] = React.useState<PersonSwapMode>("person");
  const [scenarioId, setScenarioId] = React.useState<string | null>(null);
  const [voiceId, setVoiceId] = React.useState<string | null>(null);
  const [instructions, setInstructions] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const model = models.find((m) => m.value === videoModel);
  const maxSeconds = model ? swapMaxSeconds(model) : PERSON_SWAP_MAX_SECONDS;

  React.useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(next: File | null | undefined) {
    if (!next || !next.type.startsWith("video/")) return;
    if (next.size > PERSON_SWAP_MAX_UPLOAD_BYTES) {
      toast({ title: "Video too large", description: "Use a video under 300MB.", variant: "destructive" });
      return;
    }
    setFile(next);
    setSourceUrl(null);
    setPreview(URL.createObjectURL(next));
    if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80));
  }

  function clear() {
    setFile(null);
    setSourceUrl(null);
    setPreview(null);
    setDuration(0);
  }

  async function submit() {
    if (!file && !sourceUrl) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (file) fd.set("video", file);
      else if (sourceUrl) fd.set("sourceUrl", sourceUrl);
      fd.set("name", name.trim());
      fd.set("videoModel", videoModel);
      fd.set("imageModel", imageModel);
      fd.set("mode", mode);
      if (mode === "scene" && scenarioId) fd.set("scenarioId", scenarioId);
      fd.set("voiceMode", voiceId ? "voice" : "original");
      if (voiceId) fd.set("voiceId", voiceId);
      if (instructions.trim()) fd.set("instructions", instructions.trim());
      appendPeople(fd, people);
      const res = await fetch("/api/swaps", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (data.id) {
        if (data.error) toast({ title: "Video saved", description: data.error, variant: "destructive" });
        router.push(`/swap/${data.id}`);
        return;
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    } catch (err) {
      toast({
        title: "Could not start",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  const count = peopleCount(people);
  const cost = estimateSwapCost(model, duration);

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-panel p-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-1.5">
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
            "relative flex aspect-[9/14] items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted/40 transition-colors",
            dragging ? "border-accent bg-accent/10" : "border-border",
          )}
        >
          {preview ? (
            <>
              <video
                src={preview}
                controls
                playsInline
                className="h-full w-full bg-black object-contain"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget as HTMLVideoElement & {
                    mozHasAudio?: boolean;
                    webkitAudioDecodedByteCount?: number;
                    audioTracks?: { length: number };
                  };
                  setDuration(v.duration || 0);
                  if (v.audioTracks) setHasAudio(v.audioTracks.length > 0);
                  else if (v.mozHasAudio !== undefined) setHasAudio(v.mozHasAudio);
                }}
              />
              <Button
                variant="outline"
                size="icon-sm"
                className="absolute right-1.5 top-1.5"
                onClick={clear}
                title="Remove video"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground hover:text-foreground"
            >
              <Film className="h-6 w-6" />
              <span className="text-xs font-medium">Drop your video here</span>
              <span className="text-2xs">or click to choose · MP4, MOV, WebM</span>
              <span className="text-2xs">Best: one person, face visible, 3–15 s</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {duration > 0 ? (
          <p className={cn("text-2xs", duration > maxSeconds ? "text-amber-600" : "text-muted-foreground")}>
            {duration.toFixed(1)} s
            {duration > maxSeconds ? ` — ${model?.label ?? "this AI"} uses the first ${maxSeconds} s` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="swap-name">Name</Label>
          <Input
            id="swap-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Testimonial — gym"
            maxLength={80}
          />
        </div>

        <PeoplePicker avatars={avatars} value={people} onChange={setPeople} />

        <div className="grid gap-3 rounded-md border border-accent/30 bg-accent/5 p-2.5 sm:grid-cols-2">
          <VariationModelSelect kind="video" usage="swap" label="AI that swaps the video" value={videoModel} onChange={setVideoModel} />
          <VariationModelSelect kind="image" usage="all" label="AI that casts the person" value={imageModel} onChange={setImageModel} />
          {model?.description ? (
            <p className="text-2xs text-muted-foreground sm:col-span-2">{model.description}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <SegmentedControl<PersonSwapMode>
            label="What changes"
            value={mode}
            onChange={setMode}
            options={[
              { value: "person", label: "Only the person" },
              { value: "scene", label: "Person + scene" },
            ]}
          />
          {mode === "scene" ? (
            <ScenarioPicker items={scenarios} value={scenarioId} onChange={setScenarioId} />
          ) : null}
        </div>

        <VoiceControl voiceId={voiceId} onChange={setVoiceId} hasAudio={hasAudio} />

        <div>
          <Label htmlFor="swap-instructions">Extra direction (optional)</Label>
          <Textarea
            id="swap-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Wear a black t-shirt, keep the gym equipment, warmer light…"
          />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
          <span className="text-2xs text-muted-foreground">
            {cost ? `${cost} · ` : ""}Takes a few minutes · saved to Gallery
          </span>
          <Button
            variant="primary"
            size="md"
            disabled={(!file && !sourceUrl) || count === 0 || submitting || (mode === "scene" && !scenarioId)}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {count > 1 ? `Swap into ${count} videos` : "Swap person"}
          </Button>
        </div>
      </div>
    </div>
  );
}
