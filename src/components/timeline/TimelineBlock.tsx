"use client";

import * as React from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  GripVertical,
  Image as ImageIcon,
  AudioLines,
  Music,
  Loader2,
  Waves,
} from "lucide-react";
import type { Block } from "./types";
import { SEGMENT_COLORS, resolveBlockCharacterDisplay, statusDot, type AvatarLookup } from "./types";
import { cn } from "@/lib/utils";

/** Integer-only pseudo waveform — identical on server and client (avoids Math.sin FP drift). */
function waveformBars(
  count: number,
  seed: number,
): Array<{ x: number; y: number; h: number }> {
  const bars: Array<{ x: number; y: number; h: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = ((i * 2654435761 + seed * 1597334677) >>> 0) % 100;
    const b = ((i * 2246822519 + seed * 3266489917) >>> 0) % 100;
    bars.push({
      x: i * 2.5,
      y: 6 + (a % 9) - 4,
      h: 5 + (b % 10),
    });
  }
  return bars;
}

interface Props {
  block: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
}

export function VideoTrackBlock({
  block,
  pxPerSecond,
  selected,
  onSelect,
  projectAvatarId = null,
  avatarMap = {},
}: Props) {
  const controls = useDragControls();
  const width = Math.max(40, block.durationSeconds * pxPerSecond);
  const grad = SEGMENT_COLORS[block.segmentType] ?? SEGMENT_COLORS.development;
  const status = statusDot(block);
  const character = resolveBlockCharacterDisplay(block, projectAvatarId, avatarMap);

  return (
    <Reorder.Item
      value={block}
      id={block.id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-md border bg-gradient-to-br shadow-sm transition-transform",
        grad,
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-white/10 hover:border-white/30",
      )}
      style={{ width, height: 56 }}
      onClick={() => onSelect(block.id)}
    >
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          controls.start(e);
        }}
        className="absolute left-0 top-0 z-10 flex h-full w-3 cursor-grab items-center justify-center text-white/70 hover:bg-white/10 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      <div className="absolute inset-y-0 left-3 right-0 flex items-center gap-1.5 px-1.5">
        <div
          className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-black/40 text-white/80 overflow-hidden"
          style={{ minWidth: 48 }}
        >
          {block.keyframeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.keyframeUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", status.color)} title={status.label} />
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/95">
              {block.segmentType}
            </span>
            <span className="ml-auto text-[9px] font-mono text-white/70">
              {block.durationSeconds}s
            </span>
          </div>
          <div className="truncate text-[10px] text-white/85">
            {block.narrativeText.slice(0, 80)}
          </div>
          {character && (
            <div className="mt-0.5 flex items-center gap-1">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/50 ring-1 ring-white/20">
                {character.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={character.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[7px] font-bold text-white/90">
                    {character.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="truncate text-[9px] font-medium text-white/90">{character.name}</span>
            </div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}

export function AudioTrackBlock({
  block,
  pxPerSecond,
  selected,
  onSelect,
  projectAvatarId = null,
  avatarMap = {},
}: {
  block: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
}) {
  const width = Math.max(40, block.durationSeconds * pxPerSecond);
  const hasAudio = !!block.audioUrl;
  const vol = block.audioVolume ?? 100;
  const muted = vol === 0;
  const character = resolveBlockCharacterDisplay(block, projectAvatarId, avatarMap);
  return (
    <div
      onClick={() => onSelect(block.id)}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        selected ? "border-accent" : "border-white/10",
        muted
          ? "bg-timeline-track/60 text-white/30"
          : hasAudio
            ? "bg-emerald-900/40 text-emerald-200"
            : "bg-timeline-track text-white/40",
      )}
      style={{ width, height: 36 }}
      title={hasAudio ? `Narration · ${vol}%` : "No narration yet"}
    >
      <div className="flex h-full items-center gap-1 px-1.5">
        <AudioLines className="h-3 w-3 shrink-0" />
        {character && (
          <div
            className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/30 ring-1 ring-white/15"
            title={character.name}
          >
            {character.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={character.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[7px] font-bold">{character.name.slice(0, 1)}</span>
            )}
          </div>
        )}
        <span className="truncate">
          {hasAudio ? (muted ? "Muted" : "Narration") : "No narration yet"}
        </span>
        {hasAudio && vol !== 100 && (
          <span className="ml-auto shrink-0 font-mono text-[8px] text-emerald-300/80">
            {vol}%
          </span>
        )}
      </div>
      {hasAudio && (
        <svg
          className="absolute inset-x-1.5 bottom-1 h-3 opacity-70"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
        >
          {waveformBars(40, block.position).map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={1.5}
              height={bar.h}
              className="fill-emerald-300"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function MusicTrackBlock({
  totalSeconds,
  pxPerSecond,
  musicUrl,
  musicStatus,
  musicPrompt,
  onClick,
}: {
  totalSeconds: number;
  pxPerSecond: number;
  musicUrl?: string | null;
  musicStatus?: string | null;
  musicPrompt?: string | null;
  onClick?: () => void;
}) {
  const width = Math.max(40, totalSeconds * pxPerSecond);
  const hasMusic = !!musicUrl;
  const generating = musicStatus === "generating";
  const error = musicStatus === "error";
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        error
          ? "border-red-500/40 bg-red-900/30 text-red-200"
          : hasMusic
            ? "border-amber-400/40 bg-amber-900/40 text-amber-100"
            : "border-white/10 bg-timeline-track text-white/50",
      )}
      style={{ width, height: 36 }}
      title={musicPrompt ?? "No background music"}
    >
      <div className="flex h-full items-center gap-1 px-1.5">
        {generating ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Music className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">
          {error
            ? "Music failed"
            : generating
              ? "Generating music…"
              : hasMusic
                ? `Music · ${(musicPrompt ?? "background score").slice(0, 80)}`
                : "No music — click to generate"}
        </span>
      </div>
      {hasMusic && (
        <svg
          className="absolute inset-x-1.5 bottom-1 h-3 opacity-60"
          viewBox="0 0 200 20"
          preserveAspectRatio="none"
        >
          {waveformBars(80, 42).map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={1.4}
              height={bar.h}
              className="fill-amber-300"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function SceneAudioTrackBlock({
  block,
  pxPerSecond,
  selected,
  onSelect,
}: {
  block: Block;
  pxPerSecond: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const width = Math.max(40, block.durationSeconds * pxPerSecond);
  const hasAudio = !!block.sceneAudioUrl;
  const vol = block.sceneAudioVolume ?? 60;
  const muted = vol === 0;
  return (
    <div
      onClick={() => onSelect(block.id)}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border text-[10px]",
        selected ? "border-accent" : "border-white/10",
        muted
          ? "bg-timeline-track/60 text-white/30"
          : hasAudio
            ? "bg-cyan-900/40 text-cyan-200"
            : "bg-timeline-track text-white/40",
      )}
      style={{ width, height: 36 }}
      title={
        hasAudio
          ? `Scene audio · ${vol}%`
          : "Scene audio not available (model returned silent video)"
      }
    >
      <div className="flex h-full items-center gap-1 px-1.5">
        <Waves className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {hasAudio ? (muted ? "Muted" : "Scene audio") : "No scene audio"}
        </span>
        {hasAudio && vol !== 60 && (
          <span className="ml-auto shrink-0 font-mono text-[8px] text-cyan-300/80">{vol}%</span>
        )}
      </div>
      {hasAudio && (
        <svg
          className="absolute inset-x-1.5 bottom-1 h-3 opacity-70"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
        >
          {waveformBars(40, block.position * 2 + 1).map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={1.5}
              height={bar.h}
              className="fill-cyan-300"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function TextTrackBlock({ block, pxPerSecond, selected, onSelect }: { block: Block; pxPerSecond: number; selected: boolean; onSelect: (id: string) => void }) {
  const width = Math.max(40, block.durationSeconds * pxPerSecond);
  return (
    <div
      onClick={() => onSelect(block.id)}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-md border bg-timeline-track text-[10px]",
        selected ? "border-accent" : "border-white/10",
      )}
      style={{ width, height: 36 }}
    >
      <div className="line-clamp-2 px-1.5 py-0.5 text-white/85">
        {block.narrativeText}
      </div>
    </div>
  );
}
