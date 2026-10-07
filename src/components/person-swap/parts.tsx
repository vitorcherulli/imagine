"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ImagePlus, Loader2, Mic, Upload, UserRound, X } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/social-art/SocialArtControls";
import { DEFAULT_ELEVENLABS_VOICE, ELEVENLABS_VOICE_OPTIONS } from "@/lib/project-api-models";
import { PERSON_SWAP_MAX_PEOPLE } from "@/lib/person-swap";
import { cn } from "@/lib/utils";

export type PeopleValue = { avatarIds: string[]; photos: File[]; photoName: string };

export const EMPTY_PEOPLE: PeopleValue = { avatarIds: [], photos: [], photoName: "" };

export function peopleCount(v: PeopleValue): number {
  return v.avatarIds.length + (v.photos.length > 0 ? 1 : 0);
}

export function appendPeople(fd: FormData, v: PeopleValue): void {
  fd.set("avatarIds", JSON.stringify(v.avatarIds));
  for (const p of v.photos) fd.append("photos", p);
  if (v.photos.length > 0) fd.set("photoName", v.photoName.trim());
}

/** Pick avatars (one video each) and/or upload photos of someone new. */
export function PeoplePicker({
  avatars,
  value,
  onChange,
}: {
  avatars: Avatar[];
  value: PeopleValue;
  onChange: (v: PeopleValue) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const previews = React.useMemo(() => value.photos.map((f) => URL.createObjectURL(f)), [value.photos]);
  React.useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const full = peopleCount(value) >= PERSON_SWAP_MAX_PEOPLE;
  const usable = avatars.filter((a) => a.primaryImageUrl);

  function toggle(id: string) {
    const on = value.avatarIds.includes(id);
    if (!on && full) return;
    onChange({
      ...value,
      avatarIds: on ? value.avatarIds.filter((x) => x !== id) : [...value.avatarIds, id],
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-2xs text-muted-foreground">
          New person — one video per person ({peopleCount(value)}/{PERSON_SWAP_MAX_PEOPLE})
        </Label>
        <Link href="/avatars" className="text-2xs text-muted-foreground hover:text-foreground">
          Manage avatars
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {usable.map((a) => {
          const on = value.avatarIds.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              disabled={!on && full}
              title={a.description ?? a.name}
              className={cn(
                "group relative w-16 text-center disabled:opacity-40",
              )}
            >
              <span
                className={cn(
                  "relative mx-auto block h-14 w-14 overflow-hidden rounded-full border-2 transition-colors",
                  on ? "border-accent ring-2 ring-accent/30" : "border-border group-hover:border-accent/50",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.primaryImageUrl!} alt={a.name} className="h-full w-full object-cover" />
                {on ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-accent/30">
                    <Check className="h-5 w-5 text-white drop-shadow" />
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block truncate text-[10px] text-muted-foreground">{a.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={full && value.photos.length === 0}
          className="w-16 text-center disabled:opacity-40"
          title="Upload photos of someone who isn't an avatar yet"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-accent/50 hover:text-foreground">
            <ImagePlus className="h-5 w-5" />
          </span>
          <span className="mt-1 block truncate text-[10px] text-muted-foreground">Upload photo</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            if (files.length) onChange({ ...value, photos: files });
            e.target.value = "";
          }}
        />
      </div>
      {usable.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          No avatars yet — upload photos here, or create avatars in{" "}
          <Link href="/avatars" className="underline">
            Avatars
          </Link>{" "}
          to reuse them.
        </p>
      ) : null}
      {value.photos.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
          <div className="flex -space-x-2">
            {previews.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-9 w-9 rounded-full border-2 border-background object-cover" />
            ))}
          </div>
          <Input
            value={value.photoName}
            onChange={(e) => onChange({ ...value, photoName: e.target.value })}
            placeholder="Name (e.g. Ana)"
            maxLength={60}
            className="h-8 flex-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, photos: [], photoName: "" })}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            title="Remove photos"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

type VoiceOption = { voiceId: string; name: string; category: string };

const BUILT_IN_VOICES: VoiceOption[] = ELEVENLABS_VOICE_OPTIONS.map((o) => ({
  voiceId: o.value,
  name: o.label,
  category: "library",
}));
const OWN_CATEGORIES = new Set(["cloned", "professional", "generated"]);

let voicesRequest: Promise<VoiceOption[]> | null = null;
const voiceListeners = new Set<(voices: VoiceOption[]) => void>();

function loadVoices(force = false): Promise<VoiceOption[]> {
  if (!voicesRequest || force) {
    voicesRequest = fetch("/api/voices/elevenlabs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { voices?: VoiceOption[] }) => (d.voices?.length ? d.voices : BUILT_IN_VOICES))
      .catch(() => {
        voicesRequest = null;
        return BUILT_IN_VOICES;
      });
    void voicesRequest.then((voices) => voiceListeners.forEach((fn) => fn(voices)));
  }
  return voicesRequest;
}

/** ElevenLabs voices of the account (our voice, clones, library), shared across pickers. */
export function useElevenLabsVoices(): VoiceOption[] {
  const [voices, setVoices] = React.useState<VoiceOption[]>(BUILT_IN_VOICES);
  React.useEffect(() => {
    voiceListeners.add(setVoices);
    void loadVoices().then(setVoices);
    return () => {
      voiceListeners.delete(setVoices);
    };
  }, []);
  return voices;
}

function shortName(name: string): string {
  return name.split(" — ")[0] ?? name;
}

export function useVoiceLabel(): (voiceId: string | null | undefined) => string {
  const voices = useElevenLabsVoices();
  return React.useCallback(
    (voiceId) => {
      if (!voiceId) return "Original voice";
      const name = shortName(voices.find((v) => v.voiceId === voiceId)?.name ?? "Custom voice");
      return voiceId === DEFAULT_ELEVENLABS_VOICE ? `${name} (our voice)` : name;
    },
    [voices],
  );
}

export function VoiceSelect({
  value,
  onChange,
  className,
  includeOriginal = false,
}: {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  className?: string;
  includeOriginal?: boolean;
}) {
  const voices = useElevenLabsVoices();
  const [cloning, setCloning] = React.useState(false);
  const ours = voices.find((v) => v.voiceId === DEFAULT_ELEVENLABS_VOICE);
  const own = voices.filter((v) => v.voiceId !== DEFAULT_ELEVENLABS_VOICE && OWN_CATEGORIES.has(v.category));
  const library = voices.filter((v) => v.voiceId !== DEFAULT_ELEVENLABS_VOICE && !OWN_CATEGORIES.has(v.category));

  return (
    <>
      <Select
        value={value ?? "__original"}
        onValueChange={(v) => {
          if (v === "__clone") setCloning(true);
          else onChange(v === "__original" ? null : v);
        }}
      >
        <SelectTrigger className={cn("h-8 text-xs", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {includeOriginal ? <SelectItem value="__original">Original voice</SelectItem> : null}
          {ours ? (
            <SelectItem value={ours.voiceId}>★ {shortName(ours.name)} — our voice</SelectItem>
          ) : null}
          {own.length > 0 ? (
            <SelectGroup>
              <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase text-muted-foreground">Cloned voices</div>
              {own.map((v) => (
                <SelectItem key={v.voiceId} value={v.voiceId}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          <SelectGroup>
            <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase text-muted-foreground">Library</div>
            {library.map((v) => (
              <SelectItem key={v.voiceId} value={v.voiceId}>
                {v.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectItem value="__clone" className="font-medium text-accent">
            + Clone a voice…
          </SelectItem>
        </SelectContent>
      </Select>
      {cloning ? (
        <CloneVoiceDialog
          onClose={() => setCloning(false)}
          onCloned={(voiceId) => {
            setCloning(false);
            onChange(voiceId);
          }}
        />
      ) : null}
    </>
  );
}

/** ElevenLabs instant clone from a recording of the person speaking. */
function CloneVoiceDialog({ onClose, onCloned }: { onClose: () => void; onCloned: (voiceId: string) => void }) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function clone() {
    if (!file || !name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("file", file);
      const res = await fetch("/api/voices/elevenlabs/clone", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { voiceId?: string; error?: string };
      if (!res.ok || !data.voiceId) throw new Error(data.error || `HTTP ${res.status}`);
      await loadVoices(true);
      toast({ title: "Voice cloned", description: `“${name.trim()}” is ready to use.` });
      onCloned(data.voiceId);
    } catch (err) {
      toast({
        title: "Could not clone",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clone a voice</DialogTitle>
          <DialogDescription>
            Upload 1–3 minutes of the person speaking clearly (audio or video), without music. ElevenLabs
            creates the voice in your account and it shows up in every voice list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="clone-name">Voice name</Label>
            <Input
              id="clone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vinícios"
              maxLength={60}
            />
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="w-full">
              <Upload className="h-3.5 w-3.5" />
              {file ? file.name : "Choose audio or video"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                if (next && !name.trim()) setName(next.name.replace(/\.[^.]+$/, "").slice(0, 60));
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void clone()} disabled={!file || !name.trim() || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
              Clone voice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Keep the speaker's voice, or re-voice the speech with ElevenLabs (same timing and emotion). */
export function VoiceControl({
  voiceId,
  onChange,
  hasAudio = true,
}: {
  voiceId: string | null;
  onChange: (voiceId: string | null) => void;
  hasAudio?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <SegmentedControl<"original" | "voice">
        label="Voice"
        value={voiceId ? "voice" : "original"}
        onChange={(m) => onChange(m === "voice" ? voiceId ?? DEFAULT_ELEVENLABS_VOICE : null)}
        options={[
          { value: "original", label: "Keep original" },
          { value: "voice", label: "Change voice" },
        ]}
      />
      {voiceId ? (
        <div className="flex items-center gap-2">
          <Mic className="h-3.5 w-3.5 shrink-0 text-accent" />
          <VoiceSelect value={voiceId} onChange={(v) => onChange(v ?? DEFAULT_ELEVENLABS_VOICE)} className="flex-1" />
        </div>
      ) : null}
      <p className="text-2xs text-muted-foreground">
        {!hasAudio
          ? "This video has no sound."
          : voiceId
            ? "ElevenLabs re-voices the speech with the same timing and emotion, so the lips still match. Pick a cloned voice to sound like the new person. Background music is removed."
            : "The new person keeps the original soundtrack."}
      </p>
    </div>
  );
}

export function PersonChip({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
