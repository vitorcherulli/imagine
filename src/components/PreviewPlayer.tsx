"use client";

import * as React from "react";
import type { Block } from "@/components/timeline/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";
import { getCaptionDisplayText, normalizeCaptionMode, parseCaptionLayout, type CaptionMode } from "@/lib/captions";
import { resolveNarrationPlayback } from "@/lib/cut-pace";
import { Image as ImageIcon, Maximize2, Minimize2 } from "lucide-react";
import {
  effectiveMusicGain,
  effectiveNarrationGain,
  effectiveSceneGain,
} from "@/lib/volume";

interface Props {
  blocks: Block[];
  currentTime: number;
  playing: boolean;
  onTimeChange: (t: number) => void;
  onPlay: () => void;
  onPause: () => void;
  musicUrl?: string | null;
  musicVolume?: number;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  videoFormat?: VideoFormat | string | null;
  captionMode?: CaptionMode | string | null;
}

export function PreviewPlayer({
  blocks,
  currentTime,
  playing,
  onTimeChange,
  onPlay,
  onPause,
  musicUrl,
  musicVolume = 30,
  narrationVolume = 100,
  sceneVolume = 60,
  masterVolume = 100,
  videoFormat = "horizontal",
  captionMode = "off",
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const captions = normalizeCaptionMode(captionMode);
  const captionLayout = parseCaptionLayout(captions);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const sceneRef = React.useRef<HTMLAudioElement | null>(null);
  const musicRef = React.useRef<HTMLAudioElement | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const lastTimestampRef = React.useRef<number | null>(null);
  const currentTimeRef = React.useRef(currentTime);
  const localOffsetRef = React.useRef(0);
  const activeBlockRef = React.useRef<Block | null>(null);
  const blockStartRef = React.useRef(0);
  const playingRef = React.useRef(playing);
  const totalDurationRef = React.useRef(0);
  const lastReportedTimeRef = React.useRef(-1);
  const prevPlayingRef = React.useRef(false);
  const prevBlockIdRef = React.useRef<string | null>(null);
  const onTimeChangeRef = React.useRef(onTimeChange);
  const onPauseRef = React.useRef(onPause);

  currentTimeRef.current = currentTime;
  playingRef.current = playing;
  onTimeChangeRef.current = onTimeChange;
  onPauseRef.current = onPause;

  const totalDuration = blocks.reduce((acc, b) => acc + b.durationSeconds, 0);
  totalDurationRef.current = totalDuration;

  const { activeBlock, blockStart, localOffset } = React.useMemo(() => {
    let elapsed = 0;
    for (const b of blocks) {
      if (currentTime >= elapsed && currentTime < elapsed + b.durationSeconds) {
        return { activeBlock: b, blockStart: elapsed, localOffset: currentTime - elapsed };
      }
      elapsed += b.durationSeconds;
    }
    const last = blocks[blocks.length - 1] ?? null;
    return {
      activeBlock: last,
      blockStart: Math.max(0, totalDuration - (last?.durationSeconds ?? 0)),
      localOffset: last
        ? Math.min(last.durationSeconds, currentTime - (totalDuration - last.durationSeconds))
        : 0,
    };
  }, [blocks, currentTime, totalDuration]);

  activeBlockRef.current = activeBlock;
  blockStartRef.current = blockStart;
  localOffsetRef.current = localOffset;

  const prevNarrationLeadIdRef = React.useRef<string | null>(null);

  const narrationPlayback = React.useMemo(
    () => resolveNarrationPlayback(blocks, activeBlock),
    [blocks, activeBlock],
  );

  const captionSourceBlock = narrationPlayback?.lead ?? activeBlock;
  const captionLocalOffset =
    narrationPlayback && activeBlock
      ? Math.max(0, currentTime - narrationPlayback.groupStartTime)
      : localOffset;

  const hasNarration = !!narrationPlayback?.lead.audioUrl;

  const captionText = React.useMemo(() => {
    if (!captionLayout.enabled || !captionSourceBlock?.narrativeText) return "";
    return getCaptionDisplayText({
      mode: captions,
      narrativeText: captionSourceBlock.narrativeText,
      localOffsetSeconds: captionLocalOffset,
      blockDurationSeconds: narrationPlayback?.groupDuration ?? captionSourceBlock.durationSeconds,
    });
  }, [
    captionLayout.enabled,
    captions,
    captionSourceBlock,
    captionLocalOffset,
    narrationPlayback?.groupDuration,
  ]);

  const advancePastBlock = React.useCallback((start: number, blockDur: number) => {
    const end = start + blockDur;
    const total = totalDurationRef.current;
    const playback = resolveNarrationPlayback(
      blocks,
      activeBlockRef.current,
    );
    if (
      playback &&
      end < playback.groupStartTime + playback.groupDuration - 0.02 &&
      end < total - 0.001
    ) {
      lastReportedTimeRef.current = end;
      onTimeChangeRef.current(end);
      return;
    }
    if (end >= total - 0.001) {
      onTimeChangeRef.current(total);
      onPauseRef.current();
      return;
    }
    lastReportedTimeRef.current = end;
    onTimeChangeRef.current(end);
  }, [blocks]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const desiredSrc = activeBlock?.videoUrl ?? "";
    if (!mediaSrcMatches(v.src, desiredSrc)) {
      v.src = desiredSrc;
      v.load();
    }
  }, [activeBlock?.videoUrl]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const desiredSrc = narrationPlayback?.lead.audioUrl ?? "";
    if (!mediaSrcMatches(a.src, desiredSrc)) {
      a.src = desiredSrc;
      a.load();
    }
  }, [narrationPlayback?.lead.audioUrl, narrationPlayback?.lead.id]);

  React.useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const desiredSrc = activeBlock?.sceneAudioUrl ?? "";
    if (!desiredSrc) {
      if (s.src) {
        s.removeAttribute("src");
        s.load();
      }
      return;
    }
    if (!mediaSrcMatches(s.src, desiredSrc)) {
      s.src = desiredSrc;
      s.load();
    }
  }, [activeBlock?.sceneAudioUrl]);

  // Scrub while paused only — never seek narration during playback (causes crackling).
  React.useEffect(() => {
    if (playing) return;
    seekAllMedia({
      video: videoRef.current,
      audio: audioRef.current,
      scene: sceneRef.current,
      music: musicRef.current,
      blockOffset: Math.max(0, localOffset),
      globalTime: blockStart + Math.max(0, localOffset),
      hasVideo: !!activeBlock?.videoUrl,
      hasAudio: hasNarration,
      hasScene: !!activeBlock?.sceneAudioUrl,
      hasMusic: !!musicUrl,
      narrationTime:
        narrationPlayback != null
          ? narrationPlayback.audioOffset + Math.max(0, localOffset)
          : undefined,
    });
  }, [
    localOffset,
    playing,
    activeBlock?.videoUrl,
    activeBlock?.sceneAudioUrl,
    blockStart,
    musicUrl,
    hasNarration,
    narrationPlayback,
  ]);

  // Start media only when play toggles on or the active block changes — NOT on every time tick.
  React.useEffect(() => {
    const blockId = activeBlock?.id ?? null;
    const narrationLeadId = narrationPlayback?.lead.id ?? null;
    const justStarted = playing && !prevPlayingRef.current;
    const blockChanged = playing && prevBlockIdRef.current !== blockId;
    const narrationLeadChanged =
      playing && prevNarrationLeadIdRef.current !== narrationLeadId;
    prevPlayingRef.current = playing;
    prevBlockIdRef.current = blockId;
    prevNarrationLeadIdRef.current = narrationLeadId;

    const v = videoRef.current;
    const a = audioRef.current;
    const s = sceneRef.current;
    const m = musicRef.current;

    if (!playing) {
      v?.pause();
      a?.pause();
      s?.pause();
      m?.pause();
      return;
    }

    if (!justStarted && !blockChanged) return;
    if (blockChanged && !justStarted && !narrationLeadChanged) {
      const v = videoRef.current;
      if (v && activeBlock?.videoUrl) {
        seekVideoForBlock(v, Math.max(0, localOffsetRef.current));
        v.play().catch(() => {});
      }
      return;
    }

    const offset = Math.max(0, localOffsetRef.current);
    const cleanups: Array<() => void> = [];

    if (activeBlock?.videoUrl && v) {
      const startVideo = () => {
        seekVideoForBlock(v, offset);
        v.play().catch(() => {});
      };
      if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startVideo();
      else {
        v.addEventListener("canplay", startVideo, { once: true });
        cleanups.push(() => v.removeEventListener("canplay", startVideo));
      }
    } else {
      v?.pause();
    }

    if (narrationPlayback?.lead.audioUrl && a) {
      const startNarration = () => {
        try {
          a.currentTime = narrationPlayback.audioOffset + Math.max(0, localOffsetRef.current);
        } catch {}
        a.play().catch(() => {});
      };
      if (a.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startNarration();
      else {
        a.addEventListener("canplay", startNarration, { once: true });
        cleanups.push(() => a.removeEventListener("canplay", startNarration));
      }
    } else {
      a?.pause();
    }

    if (activeBlock?.sceneAudioUrl && s) {
      const startScene = () => {
        seekSceneAtOffset(s, offset);
        s.play().catch(() => {});
      };
      if (s.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startScene();
      else {
        s.addEventListener("canplay", startScene, { once: true });
        cleanups.push(() => s.removeEventListener("canplay", startScene));
      }
    } else {
      s?.pause();
    }

    if (musicUrl && m) {
      syncMusicTime(m, blockStartRef.current + offset);
      m.play().catch(() => {});
    } else {
      m?.pause();
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [
    playing,
    activeBlock?.id,
    activeBlock?.videoUrl,
    activeBlock?.sceneAudioUrl,
    narrationPlayback?.lead.audioUrl,
    narrationPlayback?.lead.id,
    narrationPlayback?.audioOffset,
    musicUrl,
  ]);

  // Narration `ended` → next block.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a || !narrationPlayback?.lead.audioUrl) return;

    function onEnded() {
      if (!playingRef.current) return;
      const playback = resolveNarrationPlayback(blocks, activeBlockRef.current);
      if (!playback) return;
      const groupEnd = playback.groupStartTime + playback.groupDuration;
      const total = totalDurationRef.current;
      if (groupEnd >= total - 0.001) {
        onTimeChangeRef.current(total);
        onPauseRef.current();
        return;
      }
      lastReportedTimeRef.current = groupEnd;
      onTimeChangeRef.current(groupEnd);
    }

    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [blocks, narrationPlayback?.lead.audioUrl, narrationPlayback?.lead.id]);

  // Master clock: read narration currentTime via rAF, but throttle React state updates.
  // Never touch audio.currentTime here — that is what caused crackling / slow-motion audio.
  React.useEffect(() => {
    if (!playing || !hasNarration) return;
    const a = audioRef.current;
    if (!a) return;

    const start = blockStart;
    let frame = 0;
    let cancelled = false;
    let lastVideoSync = 0;

    function step(now: number) {
      if (cancelled) return;
      const audio = audioRef.current;
      const block = activeBlockRef.current;
      if (!audio || !block) {
        frame = requestAnimationFrame(step);
        return;
      }

      const playback = resolveNarrationPlayback(blocks, block);
      const blockDur = block.durationSeconds;
      const local = audio.currentTime;
      const groupGlobal = playback
        ? playback.groupStartTime + Math.max(0, local)
        : blockStartRef.current + local;
      const blockEnd = blockStartRef.current + blockDur;
      const effectiveEnd = playback
        ? playback.groupStartTime + playback.groupDuration
        : effectivePlaybackEnd(blockDur, audio);

      if (
        groupGlobal >= blockEnd - 0.05 &&
        playback &&
        blockEnd < playback.groupStartTime + playback.groupDuration - 0.02
      ) {
        advancePastBlock(blockStartRef.current, blockDur);
        return;
      }

      if (
        audio.ended ||
        (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          groupGlobal >= effectiveEnd - 0.05)
      ) {
        if (playback) {
          const groupEnd = playback.groupStartTime + playback.groupDuration;
          const total = totalDurationRef.current;
          if (groupEnd >= total - 0.001) {
            onTimeChangeRef.current(total);
            onPauseRef.current();
            return;
          }
          lastReportedTimeRef.current = groupEnd;
          onTimeChangeRef.current(groupEnd);
          return;
        }
        advancePastBlock(blockStartRef.current, blockDur);
        return;
      }

      if (Math.abs(groupGlobal - lastReportedTimeRef.current) >= 0.08) {
        lastReportedTimeRef.current = groupGlobal;
        onTimeChangeRef.current(groupGlobal);
      }

      // Video sync at most ~4×/sec — never touch narration/scene audio here.
      if (now - lastVideoSync > 250) {
        lastVideoSync = now;
        const v = videoRef.current;
        if (v && block.videoUrl && v.readyState >= 2) {
          const videoLocal = Math.max(0, groupGlobal - blockStartRef.current);
          softSyncVideoToNarration(v, videoLocal);
        }
      }

      frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [playing, hasNarration, activeBlock?.id, blockStart, advancePastBlock]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function applyLoop() {
      const block = activeBlockRef.current;
      if (!block) return;
      const dur = v!.duration;
      const target = block.durationSeconds;
      const shouldLoop = Number.isFinite(dur) && dur > 0 && dur + 0.2 < target;
      v!.loop = shouldLoop;
    }
    v.addEventListener("loadedmetadata", applyLoop);
    applyLoop();
    return () => v.removeEventListener("loadedmetadata", applyLoop);
  }, [activeBlock?.id, activeBlock?.videoUrl, activeBlock?.durationSeconds]);

  // Fallback clock for blocks without narration.
  React.useEffect(() => {
    if (!playing || hasNarration) {
      lastTimestampRef.current = null;
      return;
    }

    function tick(ts: number) {
      if (lastTimestampRef.current !== null) {
        const dt = (ts - lastTimestampRef.current) / 1000;
        const next = currentTimeRef.current + dt;
        if (next >= totalDurationRef.current) {
          onTimeChangeRef.current(totalDurationRef.current);
          onPauseRef.current();
          return;
        }
        onTimeChangeRef.current(next);
      }
      lastTimestampRef.current = ts;
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return () => {
      lastTimestampRef.current = null;
    };
  }, [playing, hasNarration]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = effectiveNarrationGain({
      blockVolume: activeBlock?.audioVolume,
      trackVolume: narrationVolume,
      masterVolume,
    });
  }, [activeBlock?.audioVolume, activeBlock?.id, narrationVolume, masterVolume]);

  React.useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.volume = effectiveSceneGain({
      blockVolume: activeBlock?.sceneAudioVolume,
      trackVolume: sceneVolume,
      masterVolume,
    });
  }, [activeBlock?.sceneAudioVolume, activeBlock?.id, sceneVolume, masterVolume]);

  React.useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    m.volume = effectiveMusicGain({ musicVolume, masterVolume });
  }, [musicVolume, masterVolume]);

  React.useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    if (!musicUrl) {
      m.removeAttribute("src");
      m.load();
      return;
    }
    if (!mediaSrcMatches(m.src, musicUrl)) {
      m.src = musicUrl;
      m.load();
    }
  }, [musicUrl]);

  React.useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        return;
      }
      await el.requestFullscreen();
      onPlay();
    } catch {
      // ignore unsupported / blocked fullscreen
    }
  }

  return (
    <div className={cn(formatSpec.previewContainerClass)}>
      <div
        ref={containerRef}
        className={cn(
          "group/preview relative w-full overflow-hidden rounded-md bg-black",
          formatSpec.previewAspectClass,
          "fullscreen:flex fullscreen:aspect-auto fullscreen:h-screen fullscreen:w-screen fullscreen:max-w-none fullscreen:items-center fullscreen:justify-center fullscreen:rounded-none",
        )}
      >
      {activeBlock?.videoUrl ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          muted
          preload="auto"
        />
      ) : activeBlock?.keyframeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeBlock.keyframeUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60">
          <ImageIcon className="h-6 w-6" />
          <span className="text-2xs">
            {activeBlock ? "No media yet for this block" : "Generate a story to start"}
          </span>
        </div>
      )}
      <audio ref={audioRef} className="hidden" preload="auto" />
      <audio ref={sceneRef} className="hidden" preload="auto" />
      <audio ref={musicRef} className="hidden" loop preload="auto" />

      {captionLayout.enabled && captionText && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3",
            captionLayout.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-10",
          )}
        >
          <p
            className={cn(
              "max-w-[92%] text-balance text-center font-medium leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]",
              formatSpec.id === "vertical" ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
            )}
          >
            <span className="rounded-md bg-black/55 px-2.5 py-1.5 backdrop-blur-[2px]">
              {captionText}
            </span>
          </p>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen (Space to play/pause)"}
        className="absolute right-1.5 top-1.5 z-10 border border-white/10 bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 hover:text-white group-hover/preview:opacity-100 fullscreen:opacity-100"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </Button>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-2xs text-white/80">
        <span>
          {activeBlock?.segmentType ?? "—"}
          {activeBlock ? ` · ${activeBlock.position + 1}/${blocks.length}` : ""}
        </span>
        <span className="font-mono">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function effectivePlaybackEnd(blockDur: number, media: HTMLMediaElement): number {
  const md = media.duration;
  if (Number.isFinite(md) && md > 0) return Math.min(blockDur, md);
  return blockDur;
}

function mediaSrcMatches(elementSrc: string, urlPath: string): boolean {
  if (!urlPath) return !elementSrc;
  try {
    const current = new URL(elementSrc, window.location.origin);
    const desired = new URL(urlPath, window.location.origin);
    return current.pathname === desired.pathname && current.search === desired.search;
  } catch {
    return elementSrc.includes(urlPath.split("?")[0] ?? urlPath);
  }
}

function seekVideoForBlock(video: HTMLVideoElement, blockSeconds: number) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    try {
      video.currentTime = Math.max(0, blockSeconds);
    } catch {}
    return;
  }
  const target = blockSeconds % duration;
  try {
    video.currentTime = target;
  } catch {}
}

function softSyncVideoToNarration(video: HTMLVideoElement, narrationLocal: number) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const expected = narrationLocal % duration;
  if (Math.abs(video.currentTime - expected) > 0.5) {
    try {
      video.currentTime = expected;
    } catch {}
  }
}

function syncMusicTime(music: HTMLAudioElement, globalSeconds: number) {
  const duration = music.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const target = globalSeconds % duration;
  if (Math.abs(music.currentTime - target) > 0.35) {
    try {
      music.currentTime = target;
    } catch {}
  }
}

function seekAllMedia(opts: {
  video: HTMLVideoElement | null;
  audio: HTMLAudioElement | null;
  scene: HTMLAudioElement | null;
  music: HTMLAudioElement | null;
  blockOffset: number;
  globalTime: number;
  hasVideo: boolean;
  hasAudio: boolean;
  hasScene: boolean;
  hasMusic: boolean;
  narrationTime?: number;
}) {
  const {
    video,
    audio,
    scene,
    music,
    blockOffset,
    globalTime,
    hasVideo,
    hasAudio,
    hasScene,
    hasMusic,
    narrationTime,
  } = opts;
  if (hasVideo && video) seekVideoForBlock(video, blockOffset);
  if (hasAudio && audio) {
    try {
      audio.currentTime = narrationTime ?? blockOffset;
    } catch {}
  }
  if (hasScene && scene) seekSceneAtOffset(scene, blockOffset);
  if (hasMusic && music) syncMusicTime(music, globalTime);
}

/** Seek scene audio to block offset; loop only when clip is shorter than the block. */
function seekSceneAtOffset(scene: HTMLAudioElement, blockSeconds: number) {
  const duration = scene.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    try {
      scene.currentTime = Math.max(0, blockSeconds);
    } catch {}
    return;
  }
  const target = duration + 0.05 < blockSeconds ? blockSeconds % duration : blockSeconds;
  try {
    scene.currentTime = Math.min(target, Math.max(0, duration - 0.01));
  } catch {}
}
