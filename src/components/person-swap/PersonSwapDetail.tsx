"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  Languages,
  Loader2,
  Mic,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UserPlus,
  UserRoundCog,
} from "lucide-react";
import type { Avatar, PersonSwap, PersonSwapItem, Scenario } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { ScenarioPicker } from "@/components/ScenarioPicker";
import { VariationModelSelect } from "@/components/VariationModelSelect";
import { AddToCreativesButton } from "@/components/creatives/AddToCreatives";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { DUB_LANGUAGES } from "@/lib/dub-languages";
import { DEFAULT_PERSON_SWAP_MODEL } from "@/lib/model-catalog";
import {
  DEFAULT_SWAP_IMAGE_MODEL,
  isSwapWorking,
  PERSON_SWAP_STATUS_LABELS,
  type PersonSwapMode,
  type PersonSwapStatus,
} from "@/lib/person-swap";
import { cn } from "@/lib/utils";
import {
  appendPeople,
  EMPTY_PEOPLE,
  PeoplePicker,
  peopleCount,
  VoiceControl,
  useVoiceLabel,
  VoiceSelect,
  type PeopleValue,
} from "@/components/person-swap/parts";
import { estimateSwapCost } from "@/components/person-swap/PersonSwapManager";

export function PersonSwapDetail({
  initialSwap,
  initialItems,
  avatars,
  scenarios,
}: {
  initialSwap: PersonSwap;
  initialItems: PersonSwapItem[];
  avatars: Avatar[];
  scenarios: Scenario[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [swap, setSwap] = React.useState(initialSwap);
  const [items, setItems] = React.useState(initialItems);
  const { models } = useModelCatalog("video", "swap");
  const working = items.some((i) => isSwapWorking(i.status));

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/swaps/${initialSwap.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { swap: PersonSwap; items: PersonSwapItem[] };
    setSwap(data.swap);
    setItems(data.items);
  }, [initialSwap.id]);

  React.useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [working, refresh]);

  async function patch(body: Record<string, unknown>) {
    const prev = swap;
    setSwap((s) => ({ ...s, ...body }) as PersonSwap);
    const res = await fetch(`/api/swaps/${swap.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setSwap(prev);
      toast({ title: "Could not save", variant: "destructive" });
    }
  }

  async function action(item: PersonSwapItem, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const res = await fetch(`/api/swaps/items/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      toast({ title: "Could not do that", description: String(data.error ?? res.status), variant: "destructive" });
      return null;
    }
    await refresh();
    return data;
  }

  async function removeItem(item: PersonSwapItem) {
    if (!window.confirm(`Delete the video with ${item.avatarName || "this person"}?`)) return;
    setItems((list) => list.filter((i) => i.id !== item.id));
    await fetch(`/api/swaps/items/${item.id}`, { method: "DELETE" });
  }

  async function removeSwap() {
    if (!window.confirm(`Delete “${swap.name}” and all its videos?`)) return;
    await fetch(`/api/swaps/${swap.id}`, { method: "DELETE" });
    router.push("/swap");
    router.refresh();
  }

  const videoModel = swap.videoModel ?? DEFAULT_PERSON_SWAP_MODEL;
  const avatarPhoto = (id: string | null) => avatars.find((a) => a.id === id)?.primaryImageUrl ?? null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/swap" className="rounded p-1 text-muted-foreground hover:text-foreground" title="All videos">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-base font-semibold">
          <UserRoundCog className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate">{swap.name}</span>
        </h1>
        <Button variant="outline" size="xs" onClick={() => void removeSwap()}>
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <video src={swap.sourceUrl} controls playsInline className="max-h-[420px] w-full object-contain" />
          </div>
          <p className="text-2xs text-muted-foreground">
            Original · {swap.durationSeconds.toFixed(1)} s · {swap.aspectRatio}
            {swap.audioUrl ? "" : " · no sound"}
          </p>

          <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
            <p className="text-2xs text-muted-foreground">Settings for new people and retries</p>
            <VariationModelSelect
              kind="video"
              usage="swap"
              label="AI that swaps the video"
              value={videoModel}
              onChange={(v) => void patch({ videoModel: v })}
            />
            <VariationModelSelect
              kind="image"
              usage="all"
              label="AI that casts the person"
              value={swap.imageModel ?? DEFAULT_SWAP_IMAGE_MODEL}
              onChange={(v) => void patch({ imageModel: v })}
            />
            <SegmentedControl<PersonSwapMode>
              label="What changes"
              value={swap.mode as PersonSwapMode}
              onChange={(m) => void patch({ mode: m })}
              options={[
                { value: "person", label: "Only the person" },
                { value: "scene", label: "Person + scene" },
              ]}
            />
            {swap.mode === "scene" ? (
              <ScenarioPicker
                items={scenarios}
                value={swap.scenarioId}
                onChange={(id) => void patch({ scenarioId: id })}
              />
            ) : null}
            <VoiceControl
              voiceId={swap.voiceMode === "voice" ? swap.voiceId : null}
              hasAudio={!!swap.audioUrl}
              onChange={(v) => void patch({ voiceMode: v ? "voice" : "original", voiceId: v })}
            />
            <InstructionsField value={swap.instructions ?? ""} onSave={(v) => void patch({ instructions: v })} />
          </div>
        </aside>

        <section className="space-y-4">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No people yet — add someone below.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <SwapItemCard
                  key={item.id}
                  swap={swap}
                  item={item}
                  photo={avatarPhoto(item.avatarId)}
                  onAction={(body) => action(item, body)}
                  onDelete={() => void removeItem(item)}
                  onDubbed={(id) => router.push(`/dubs/${id}`)}
                />
              ))}
            </div>
          )}

          <AddPeoplePanel
            swapId={swap.id}
            avatars={avatars}
            cost={estimateSwapCost(models.find((m) => m.value === videoModel), swap.durationSeconds)}
            onAdded={() => void refresh()}
          />
        </section>
      </div>
    </div>
  );
}

function InstructionsField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div>
      <Label className="text-2xs text-muted-foreground">Extra direction</Label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== value.trim()) onSave(text);
        }}
        rows={2}
        maxLength={1000}
        placeholder="e.g. Wear a black t-shirt…"
        className="text-xs"
      />
    </div>
  );
}

function SwapItemCard({
  swap,
  item,
  photo,
  onAction,
  onDelete,
  onDubbed,
}: {
  swap: PersonSwap;
  item: PersonSwapItem;
  photo: string | null;
  onAction: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDelete: () => void;
  onDubbed: (dubId: string) => void;
}) {
  const [menu, setMenu] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dubLang, setDubLang] = React.useState("en");
  const voiceLabel = useVoiceLabel();
  const status = item.status as PersonSwapStatus;
  const working = isSwapWorking(status);
  const fallbackPhoto = React.useMemo(() => {
    try {
      return (JSON.parse(item.referenceUrls) as string[])[0] ?? null;
    } catch {
      return null;
    }
  }, [item.referenceUrls]);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setMenu(false);
    const data = await onAction(body);
    setBusy(null);
    return data;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="relative aspect-[9/14] bg-black">
        {status === "ready" && item.videoUrl ? (
          <video src={item.videoUrl} controls playsInline className="h-full w-full object-contain" />
        ) : item.keyframeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.keyframeUrl} alt="" className={cn("h-full w-full object-contain", working && "opacity-70")} />
        ) : (
          <div className="flex h-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ?? fallbackPhoto ? <img src={(photo ?? fallbackPhoto)!} alt="" className="h-20 w-20 rounded-full object-cover opacity-60" /> : null}
          </div>
        )}
        {working ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/70 px-2 py-1.5 text-2xs text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> {PERSON_SWAP_STATUS_LABELS[status]}
          </div>
        ) : null}
        {status === "error" ? (
          <div className="absolute inset-x-0 bottom-0 bg-red-950/85 px-2 py-1.5 text-2xs text-red-100">
            {item.error || "Failed"}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 p-2.5">
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ?? fallbackPhoto ? <img src={(photo ?? fallbackPhoto)!} alt="" className="h-6 w-6 rounded-full object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{item.avatarName || "Person"}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {status === "ready" ? voiceLabel(item.voiceId) : PERSON_SWAP_STATUS_LABELS[status]}
            </p>
          </div>
          {status === "ready" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : null}
          <div className="relative">
            <Button variant="ghost" size="icon-sm" onClick={() => setMenu((v) => !v)} title="More">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            {menu ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-background p-1 text-xs shadow-lg">
                <MenuItem
                  disabled={working}
                  onClick={() => void run("retry", { action: "retry", newFrame: false })}
                  icon={<RefreshCw className="h-3 w-3" />}
                  label={item.keyframeUrl ? "Re-render video (same look)" : "Try again"}
                />
                {item.keyframeUrl ? (
                  <MenuItem
                    disabled={working}
                    onClick={() => void run("retry", { action: "retry", newFrame: true })}
                    icon={<RefreshCw className="h-3 w-3" />}
                    label="Start over (new look)"
                  />
                ) : null}
                <MenuItem onClick={onDelete} icon={<Trash2 className="h-3 w-3" />} label="Delete" danger />
              </div>
            ) : null}
          </div>
        </div>

        {status === "error" && item.rawVideoUrl && item.error?.startsWith("Voice") ? (
          <Button
            variant="outline"
            size="xs"
            className="w-full"
            disabled={!!busy}
            onClick={() => void run("voice", { action: "voice", voiceId: item.voiceId ?? swap.voiceId })}
          >
            <Mic className="h-3 w-3" /> Retry voice
          </Button>
        ) : null}
        {status === "error" && !item.error?.startsWith("Voice") ? (
          <Button
            variant="outline"
            size="xs"
            className="w-full"
            disabled={!!busy}
            onClick={() => void run("retry", { action: "retry", newFrame: !item.keyframeUrl })}
          >
            {busy === "retry" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Try again
          </Button>
        ) : null}

        {status === "ready" && item.videoUrl ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="xs" asChild>
                <a href={item.videoUrl} download={`${swap.name} - ${item.avatarName || "person"}.mp4`}>
                  <Download className="h-3 w-3" /> Download
                </a>
              </Button>
              <AddToCreativesButton
                source={{ type: "swap", id: item.id, isVideo: true }}
                name={`${swap.name} ${item.avatarName}`.trim()}
                label="Creatives"
              />
            </div>
            {swap.audioUrl && item.rawVideoUrl ? (
              <div className="flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <VoiceSelect
                  includeOriginal
                  value={item.voiceId}
                  onChange={(v) => void run("voice", { action: "voice", voiceId: v })}
                  className="h-7 flex-1"
                />
              </div>
            ) : null}
            {swap.audioUrl ? (
              <div className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Select value={dubLang} onValueChange={setDubLang}>
                  <SelectTrigger className="h-7 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DUB_LANGUAGES.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.flag} {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!!busy}
                  onClick={async () => {
                    const data = await run("dub", { action: "dub", language: dubLang });
                    if (typeof data?.dubId === "string") onDubbed(data.dubId);
                  }}
                  title={item.voiceId ? `Dub with ${voiceLabel(item.voiceId)}` : "Dub with a clone of the original voice"}
                >
                  {busy === "dub" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Dub
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted disabled:opacity-40",
        danger && "text-red-600",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AddPeoplePanel({
  swapId,
  avatars,
  cost,
  onAdded,
}: {
  swapId: string;
  avatars: Avatar[];
  cost: string | null;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [people, setPeople] = React.useState<PeopleValue>(EMPTY_PEOPLE);
  const [saving, setSaving] = React.useState(false);
  const count = peopleCount(people);

  async function add() {
    setSaving(true);
    try {
      const fd = new FormData();
      appendPeople(fd, people);
      const res = await fetch(`/api/swaps/${swapId}/people`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPeople(EMPTY_PEOPLE);
      onAdded();
    } catch (err) {
      toast({
        title: "Could not add",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
      <PeoplePicker avatars={avatars} value={people} onChange={setPeople} />
      <div className="flex items-center justify-end gap-2">
        {cost ? <span className="text-2xs text-muted-foreground">{cost}</span> : null}
        <Button variant="primary" size="sm" disabled={count === 0 || saving} onClick={() => void add()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {count > 1 ? `Add ${count} people` : "Add person"}
        </Button>
      </div>
    </div>
  );
}
