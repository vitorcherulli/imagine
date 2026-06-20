"use client";

import * as React from "react";
import { Reorder } from "framer-motion";
import { TimelineRuler } from "./TimelineRuler";
import {
  AudioTrackBlock,
  MusicTrackBlock,
  SceneAudioTrackBlock,
  TextTrackBlock,
  VideoTrackBlock,
} from "./TimelineBlock";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { TimelineVolumeSlider } from "./TimelineVolumeSlider";
import type { Block, AvatarLookup } from "./types";

export interface TimelineVolumes {
  master: number;
  narration: number;
  scene: number;
  music: number;
}

interface Props {
  blocks: Block[];
  pxPerSecond: number;
  currentTime: number;
  playing?: boolean;
  onScrub: (t: number) => void;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onReorder: (newOrder: Block[]) => void;
  musicUrl?: string | null;
  musicStatus?: string | null;
  musicPrompt?: string | null;
  onMusicClick?: () => void;
  volumes: TimelineVolumes;
  onVolumesChange: (patch: Partial<TimelineVolumes>) => void;
  projectAvatarId?: string | null;
  avatarMap?: AvatarLookup;
}

const TRACK_LABEL_WIDTH = 108;
const RULER_HEIGHT = 24;
const VIDEO_ROW = 64;
const TRACK_ROW = 44;
// rows: video + scene-audio + narration + music + text
const TOTAL_ROW_HEIGHT = VIDEO_ROW + TRACK_ROW * 4;

export function Timeline({
  blocks,
  pxPerSecond,
  currentTime,
  playing,
  onScrub,
  selectedBlockId,
  onSelect,
  onReorder,
  musicUrl,
  musicStatus,
  musicPrompt,
  onMusicClick,
  volumes,
  onVolumesChange,
  projectAvatarId = null,
  avatarMap = {},
}: Props) {
  const totalSeconds = blocks.reduce((acc, b) => acc + b.durationSeconds, 0) || 30;
  const contentWidth = Math.max(800, Math.ceil(totalSeconds * pxPerSecond));

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll horizontally so the playhead stays inside the visible area while playing.
  React.useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = currentTime * pxPerSecond;
    const margin = 80;
    const minVisible = el.scrollLeft + margin;
    const maxVisible = el.scrollLeft + el.clientWidth - margin;
    if (playheadX < minVisible || playheadX > maxVisible) {
      el.scrollTo({
        left: Math.max(0, playheadX - el.clientWidth / 2),
        behavior: "smooth",
      });
    }
  }, [currentTime, pxPerSecond, playing]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-timeline-bg text-white">
      <div className="flex min-h-0 flex-1">
        <TrackMixer volumes={volumes} onVolumesChange={onVolumesChange} />
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-dark"
        >
          <div className="relative" style={{ width: contentWidth }}>
            <TimelineRuler
              totalSeconds={totalSeconds}
              pxPerSecond={pxPerSecond}
              onScrub={onScrub}
            />

            <div className="relative">
              <div className="relative h-[64px] border-b border-black/30 bg-timeline-track/40">
                <Reorder.Group
                  axis="x"
                  values={blocks}
                  onReorder={onReorder}
                  className="flex h-full items-center gap-0 px-0.5"
                >
                  {blocks.map((b) => (
                    <VideoTrackBlock
                      key={b.id}
                      block={b}
                      pxPerSecond={pxPerSecond}
                      selected={b.id === selectedBlockId}
                      onSelect={onSelect}
                      projectAvatarId={projectAvatarId}
                      avatarMap={avatarMap}
                    />
                  ))}
                </Reorder.Group>
              </div>

              <div className="flex h-[44px] items-center gap-0 border-b border-black/30 bg-cyan-950/20 px-0.5">
                {blocks.map((b) => (
                  <SceneAudioTrackBlock
                    key={b.id}
                    block={b}
                    pxPerSecond={pxPerSecond}
                    selected={b.id === selectedBlockId}
                    onSelect={onSelect}
                  />
                ))}
              </div>

              <div className="flex h-[44px] items-center gap-0 border-b border-black/30 bg-timeline-track/30 px-0.5">
                {blocks.map((b) => (
                  <AudioTrackBlock
                    key={b.id}
                    block={b}
                    pxPerSecond={pxPerSecond}
                    selected={b.id === selectedBlockId}
                    onSelect={onSelect}
                    projectAvatarId={projectAvatarId}
                    avatarMap={avatarMap}
                  />
                ))}
              </div>

              <div className="flex h-[44px] items-center gap-0 border-b border-black/30 bg-amber-950/20 px-0.5">
                <MusicTrackBlock
                  totalSeconds={totalSeconds}
                  pxPerSecond={pxPerSecond}
                  musicUrl={musicUrl}
                  musicStatus={musicStatus}
                  musicPrompt={musicPrompt}
                  onClick={onMusicClick}
                />
              </div>

              <div className="flex h-[44px] items-center gap-0 bg-timeline-track/20 px-0.5">
                {blocks.map((b) => (
                  <TextTrackBlock
                    key={b.id}
                    block={b}
                    pxPerSecond={pxPerSecond}
                    selected={b.id === selectedBlockId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>

            {/* Playhead spans ruler + every track. Drag handle limited to the ruler area. */}
            <TimelinePlayhead
              currentTime={currentTime}
              pxPerSecond={pxPerSecond}
              height={RULER_HEIGHT + TOTAL_ROW_HEIGHT}
              rulerHeight={RULER_HEIGHT}
              totalSeconds={totalSeconds}
              onScrub={onScrub}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackMixer({
  volumes,
  onVolumesChange,
}: {
  volumes: TimelineVolumes;
  onVolumesChange: (patch: Partial<TimelineVolumes>) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col border-r border-black/30 bg-timeline-ruler text-white/70"
      style={{ width: TRACK_LABEL_WIDTH }}
    >
      <div className="flex h-6 flex-col justify-center border-b border-black/30 px-1.5">
        <TimelineVolumeSlider
          label="Master"
          value={volumes.master}
          onChange={(v) => onVolumesChange({ master: v })}
          compact
        />
      </div>
      <div className="flex h-[64px] items-center border-b border-black/30 px-2 text-[10px] uppercase tracking-wide">
        Video
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-black/30 px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-cyan-300/90">
          Scene
        </span>
        <TimelineVolumeSlider
          value={volumes.scene}
          onChange={(v) => onVolumesChange({ scene: v })}
          accent="cyan"
          compact
        />
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-black/30 px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-emerald-300/90">
          Narration
        </span>
        <TimelineVolumeSlider
          value={volumes.narration}
          onChange={(v) => onVolumesChange({ narration: v })}
          accent="emerald"
          compact
        />
      </div>
      <div className="flex h-[44px] flex-col justify-center gap-0.5 border-b border-black/30 px-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-amber-300/90">
          Music
        </span>
        <TimelineVolumeSlider
          value={volumes.music}
          onChange={(v) => onVolumesChange({ music: v })}
          accent="amber"
          compact
        />
      </div>
      <div className="flex h-[44px] items-center px-2 text-[10px] uppercase tracking-wide">
        Text
      </div>
    </div>
  );
}
