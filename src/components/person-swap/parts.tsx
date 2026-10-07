"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ImagePlus, Mic, UserRound, X } from "lucide-react";
import type { Avatar } from "@/lib/db/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function voiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Original voice";
  const label = ELEVENLABS_VOICE_OPTIONS.find((v) => v.value === voiceId)?.label ?? voiceId;
  return voiceId === DEFAULT_ELEVENLABS_VOICE ? `${label.split(" — ")[0]} (our voice)` : label.split(" — ")[0];
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
  return (
    <Select value={value ?? "__original"} onValueChange={(v) => onChange(v === "__original" ? null : v)}>
      <SelectTrigger className={cn("h-8 text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeOriginal ? <SelectItem value="__original">Original voice</SelectItem> : null}
        {ELEVENLABS_VOICE_OPTIONS.map((v) => (
          <SelectItem key={v.value} value={v.value}>
            {v.value === DEFAULT_ELEVENLABS_VOICE ? `★ ${v.label.split(" — ")[0]} — our voice` : v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
            ? "ElevenLabs re-voices the speech with the same timing and emotion, so the lips still match. Background music is removed."
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
