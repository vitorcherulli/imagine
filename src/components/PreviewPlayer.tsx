"use client";

import * as React from "react";
import type { Block } from "@/components/timeline/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVideoFormatSpec, fitPreviewFrameSize, type VideoFormat } from "@/lib/video-format";
import { getCaptionDisplayText, normalizeCaptionMode, parseCaptionLayout, type CaptionMode } from "@/lib/captions";
import {
  computeTimelineDurationSeconds,
  resolveMediaSeekAtTime,
  resolveNarrationPlaybackAtTime,
} from "@/lib/timeline-free-edit";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "@/lib/script-pause";
import {
  resolveTimelineVisualAtTime,
  timelinePlaybackVideoUrl,
  timelineThumbCandidates,
} from "@/lib/timeline-preview-media";
import { TimelineThumbImage } from "@/components/timeline/TimelineThumbImage";
import { Image as ImageIcon, Loader2, Maximize2, Minimize2 } from "lucide-react";
import {
  effectiveMusicGainAtTime,
  effectiveNarrationGain,
  effectiveSceneGain,
} from "@/lib/volume";
import { musicSwellMultiplierAtTime } from "@/lib/music-swell";
import {
  effectiveMusicSpanSeconds,
  musicActiveAtTime,
  musicFileOffsetAtTime,
  normalizeMusicStartSeconds,
} from "@/lib/music-timeline";
import { resolveTimelineMusicAtTime } from "@/lib/music-playback";
import { useAudioWaveformDuration } from "@/components/timeline/AudioWaveform";
import { resolveBlockPreviewUrl } from "@/lib/preview-video-cache";
import type { ResolvedPreviewSettings } from "@/lib/preview-settings";

interface Props {
  blocks: Block[];
  currentTime: number;
  playing: boolean;
  onTimeChange: (t: number) => void;
  onPlay: () => void;
  onPause: () => void;
  musicUrl?: string | null;
  musicVolume?: number;
  musicStartSeconds?: number;
  musicSpanSeconds?: number | null;
  music2Url?: string | null;
  music2TimelineStartSeconds?: number | null;
  music2FileStartSeconds?: number;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  videoFormat?: VideoFormat | string | null;
  captionMode?: CaptionMode | string | null;
  previewSettings: ResolvedPreviewSettings;
  /** Small fixed-size preview for the floating panel. */
  compact?: boolean;
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
  musicStartSeconds = 0,
  musicSpanSeconds = null,
  music2Url = null,
  music2TimelineStartSeconds = null,
  music2FileStartSeconds = 0,
  narrationVolume = 100,
  sceneVolume = 60,
  masterVolume = 100,
  videoFormat = "horizontal",
  captionMode = "off",
  previewSettings,
  compact = false,
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const compactBounds = React.useMemo(
    () =>
      fitPreviewFrameSize(
        formatSpec.id === "vertical" ? 128 : 240,
        formatSpec.id === "vertical" ? 220 : 160,
        formatSpec.id,
      ),
    [formatSpec.id],
  );
  const captions = normalizeCaptionMode(captionMode);
  const captionLayout = parseCaptionLayout(captions);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = React.useState({ width: 640, height: 360 });
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
  const prevVisualBlockIdRef = React.useRef<string | null>(null);
  const onTimeChangeRef = React.useRef(onTimeChange);
  const onPauseRef = React.useRef(onPause);

  currentTimeRef.current = currentTime;
  playingRef.current = playing;
  onTimeChangeRef.current = onTimeChange;
  onPauseRef.current = onPause;

  const timelineDuration = React.useMemo(
    () => computeTimelineDurationSeconds(blocks),
    [blocks],
  );
  const effectiveMusicSpan = React.useMemo(
    () => effectiveMusicSpanSeconds({ musicSpanSeconds }, timelineDuration),
    [musicSpanSeconds, timelineDuration],
  );
  const musicStart = normalizeMusicStartSeconds(musicStartSeconds);
  const music1Duration = useAudioWaveformDuration(musicUrl);
  const music2Duration = useAudioWaveformDuration(music2Url);
  const musicFields = React.useMemo(
    () => ({
      musicUrl: musicUrl ?? null,
      musicStartSeconds: musicStart,
      musicSpanSeconds,
      music2Url: music2Url ?? null,
      music2TimelineStartSeconds,
      music2FileStartSeconds,
    }),
    [
      musicUrl,
      musicStart,
      musicSpanSeconds,
      music2Url,
      music2TimelineStartSeconds,
      music2FileStartSeconds,
    ],
  );
  const syncMusic = React.useCallback(
    (music: HTMLAudioElement, globalSeconds: number) => {
      const resolved = resolveTimelineMusicAtTime(
        musicFields,
        timelineDuration,
        globalSeconds,
        music1Duration,
        music2Duration,
      );
      if (!resolved) {
        music.pause();
        return;
      }
      if (!mediaSrcMatches(music.src, resolved.url)) {
        music.src = resolved.url;
        music.load();
      }
      if (Math.abs(music.currentTime - resolved.fileOffsetSeconds) > 0.35) {
        try {
          music.currentTime = resolved.fileOffsetSeconds;
        } catch {}
      }
    },
    [musicFields, timelineDuration, music1Duration, music2Duration],
  );

  React.useLayoutEffect(() => {
    if (compact) {
      setFrameSize(compactBounds);
      return;
    }

    const el = wrapperRef.current;
    if (!el) return;

    function updateFrameSize() {
      if (!el) return;
      const next = fitPreviewFrameSize(el.clientWidth, el.clientHeight, formatSpec.id);
      setFrameSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    }

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, compactBounds, formatSpec.id]);

  const totalDuration = computeTimelineDurationSeconds(blocks);
  totalDurationRef.current = totalDuration;

  const timelineVisual = React.useMemo(
    () => resolveTimelineVisualAtTime(blocks, currentTime),
    [blocks, currentTime],
  );
  const activeBlock = timelineVisual?.block ?? null;
  const blockStart = timelineVisual?.blockStart ?? 0;
  const localOffset = timelineVisual?.localOffset ?? 0;
  const visualBlock = timelineVisual?.visual ?? null;

  const visualBlockRef = React.useRef(visualBlock);
  visualBlockRef.current = visualBlock;

  activeBlockRef.current = activeBlock;
  blockStartRef.current = blockStart;
  localOffsetRef.current = localOffset;

  const [clientReady, setClientReady] = React.useState(false);
  const [videoFrameReady, setVideoFrameReady] = React.useState(false);
  React.useEffect(() => {
    setClientReady(true);
  }, []);

  const thumbCandidates = React.useMemo(
    () => timelineThumbCandidates(visualBlock),
    [visualBlock],
  );
  const hasStill = thumbCandidates.length > 0;
  /** Paused: keyframe only (matches timeline thumbs). Playing: full video — never the proxy. */
  const showVideo =
    clientReady &&
    !!visualBlock?.videoUrl &&
    previewSettings.playVideo &&
    playing;
  const showPausedVideoScrub =
    clientReady &&
    !!visualBlock?.videoUrl &&
    previewSettings.playVideo &&
    !playing &&
    !hasStill;
  const mountVideo = showVideo || showPausedVideoScrub;
  const playbackVideoUrl = React.useMemo(
    () => (mountVideo ? timelinePlaybackVideoUrl(visualBlock) : null),
    [mountVideo, visualBlock],
  );

  React.useEffect(() => {
    if (!playing) setVideoFrameReady(false);
  }, [playing]);

  React.useEffect(() => {
    setVideoFrameReady(false);
  }, [playbackVideoUrl, visualBlock?.id]);

  const mediaSeek = React.useMemo(
    () => resolveMediaSeekAtTime(blocks, currentTime),
    [blocks, currentTime],
  );

  const prevNarrationLeadIdRef = React.useRef<string | null>(null);
  const wasPlayingRef = React.useRef(playing);
  const narrationClockBaseRef = React.useRef<{ audioBaseOffset: number; groupStartTime: number } | null>(
    null,
  );

  const narrationPlayback = React.useMemo(
    () => resolveNarrationPlaybackAtTime(blocks, currentTime),
    [blocks, currentTime],
  );

  const captionSourceBlock = narrationPlayback?.lead ?? activeBlock;
  const captionLocalOffset =
    narrationPlayback && activeBlock
      ? Math.max(0, currentTime - narrationPlayback.groupStartTime)
      : localOffset;

  const hasNarration = !!narrationPlayback?.lead.audioUrl;

  React.useEffect(() => {
    if (!playing || !narrationPlayback?.lead.audioUrl) {
      narrationClockBaseRef.current = null;
      return;
    }
    narrationClockBaseRef.current = {
      audioBaseOffset: narrationPlayback.audioBaseOffset,
      groupStartTime: narrationPlayback.groupStartTime,
    };
  }, [
    playing,
    narrationPlayback?.lead.id,
    narrationPlayback?.lead.audioUrl,
    narrationPlayback?.audioBaseOffset,
    narrationPlayback?.groupStartTime,
  ]);

  // Freeze playhead at the exact media position when pausing.
  React.useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = playing;
    if (!wasPlaying || playing) return;

    const playback = resolveNarrationPlaybackAtTime(blocks, currentTimeRef.current);
    const a = audioRef.current;
    if (playback?.lead.audioUrl && a) {
      const exact = playback.groupStartTime + Math.max(0, a.currentTime - playback.audioBaseOffset);
      lastReportedTimeRef.current = exact;
      onTimeChangeRef.current(exact);
      return;
    }

    // Music-moment / video-only blocks: keep the timeline clock (looping video time is not global time).
    lastReportedTimeRef.current = currentTimeRef.current;
  }, [playing, blocks]);

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

  // Stop playback only when the playhead reaches the end of the timeline.
  React.useEffect(() => {
    if (!playing || blocks.length === 0) return;
    if (currentTime >= totalDuration - 0.001) {
      onPauseRef.current();
    }
  }, [playing, currentTime, totalDuration, blocks.length]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v || !mountVideo) return;
    const desiredSrc = playbackVideoUrl ?? "";
    if (!desiredSrc) return;
    if (!mediaSrcMatches(v.src, desiredSrc)) {
      v.src = desiredSrc;
      v.load();
    }
  }, [playbackVideoUrl, mountVideo, visualBlock?.id]);

  // Prefetch the next block's full video while playing so block transitions don't stall.
  React.useEffect(() => {
    const links: HTMLLinkElement[] = [];
    let cancelled = false;

    function addPrefetch(href: string, as: "video" | "image" = "video") {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = as;
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    }

    if (!playing && playbackVideoUrl && previewSettings.useProxy) {
      addPrefetch(playbackVideoUrl);
    }

    const nextBlock = findNextVisualBlock(blocks, activeBlock);
    const nextVideoUrl = nextBlock ? timelinePlaybackVideoUrl(nextBlock) : null;
    if (playing && nextVideoUrl) {
      addPrefetch(nextVideoUrl);
    }

    if (playing && previewSettings.useProxy && nextBlock?.id && nextBlock.videoUrl) {
      void resolveBlockPreviewUrl(nextBlock.id, nextBlock.videoUrl, {
        allowGeneration: true,
      })
        .then((url) => {
          if (cancelled || !url) return;
          addPrefetch(url);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      for (const link of links) link.remove();
    };
  }, [
    playing,
    blocks,
    activeBlock?.id,
    playbackVideoUrl,
    previewSettings.useProxy,
  ]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const desiredSrc = narrationPlayback?.lead.audioUrl ?? "";
    if (!mediaSrcMatches(a.src, desiredSrc)) {
      a.src = desiredSrc;
      a.load();
    }
  }, [narrationPlayback?.lead.audioUrl, narrationPlayback?.lead.id]);

  const sceneBlock = mediaSeek.scene?.block ?? activeBlock;

  React.useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const desiredSrc = sceneBlock?.sceneAudioUrl ?? "";
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
  }, [sceneBlock?.sceneAudioUrl]);

  // Scrub while paused only — never seek narration during playback (causes crackling).
  React.useEffect(() => {
    if (playing) return;

    const videoHit = mediaSeek.video;
    const sceneHit = mediaSeek.scene;
    const narration = mediaSeek.narration;
    const visualForSeek = videoHit
      ? isStoryBlockPause(videoHit.block)
        ? resolveNeighborVisualBlock(blocks, videoHit.block)
        : videoHit.block
      : null;

    seekAllMedia({
      video: videoRef.current,
      audio: audioRef.current,
      scene: sceneRef.current,
      music: musicRef.current,
      blockOffset: videoHit?.localOffset ?? 0,
      globalTime: mediaSeek.globalTime,
      hasVideo: mountVideo && !!visualForSeek?.videoUrl,
      hasAudio: !!narration?.lead.audioUrl,
      hasScene: !!sceneHit?.block.sceneAudioUrl,
      hasMusic: Boolean(musicUrl || music2Url),
      narrationTime: narration?.audioOffset,
      sceneOffset: sceneHit?.localOffset,
      musicFields,
      music1Duration,
      music2Duration,
      timelineDuration,
    });
  }, [
    blocks,
    mediaSeek,
    playing,
    mountVideo,
    musicUrl,
    music2Url,
    musicFields,
    music1Duration,
    music2Duration,
    timelineDuration,
  ]);

  // Start media only when play toggles on or the active block changes — NOT on every time tick.
  React.useEffect(() => {
    const blockId = activeBlock?.id ?? null;
    const visualBlockId = visualBlock?.id ?? null;
    const narrationLeadId = narrationPlayback?.lead.id ?? null;
    const justStarted = playing && !prevPlayingRef.current;
    const blockChanged = playing && prevBlockIdRef.current !== blockId;
    const visualBlockChanged =
      playing && prevVisualBlockIdRef.current !== visualBlockId;
    const narrationLeadChanged =
      playing && prevNarrationLeadIdRef.current !== narrationLeadId;
    prevPlayingRef.current = playing;
    prevBlockIdRef.current = blockId;
    prevVisualBlockIdRef.current = visualBlockId;
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

    if (!justStarted && !blockChanged && !visualBlockChanged && !narrationLeadChanged) {
      return;
    }

    if (justStarted) {
      lastReportedTimeRef.current = currentTimeRef.current;
    }

    const offset = Math.max(0, localOffsetRef.current);
    const cleanups: Array<() => void> = [];

    if (playbackVideoUrl && v && showVideo) {
      cleanups.push(playVideoWhenReady(v, offset));
    } else {
      v?.pause();
    }

    if (blockChanged && !justStarted && !narrationLeadChanged) {
      if (activeBlock?.sceneAudioUrl && s) {
        cleanups.push(playAudioWhenReady(s, () => seekSceneAtOffset(s, offset)));
      } else {
        s?.pause();
      }
      if ((musicUrl || music2Url) && m) {
        syncMusic(m, currentTimeRef.current);
        if (
          resolveTimelineMusicAtTime(
            musicFields,
            timelineDuration,
            currentTimeRef.current,
            music1Duration,
            music2Duration,
          )
        ) {
          m.play().catch(() => {});
        }
      }
      return () => {
        for (const fn of cleanups) fn();
      };
    }

    if (narrationPlayback?.lead.audioUrl && a) {
      const narrationSeekSeconds = narrationPlayback.audioOffset;
      cleanups.push(
        playAudioWhenReady(a, () => {
          try {
            a.currentTime = narrationSeekSeconds;
          } catch {}
        }),
      );
    } else {
      a?.pause();
    }

    if (activeBlock?.sceneAudioUrl && s) {
      cleanups.push(playAudioWhenReady(s, () => seekSceneAtOffset(s, offset)));
    } else {
      s?.pause();
    }

    if ((musicUrl || music2Url) && m) {
      syncMusic(m, currentTimeRef.current);
      if (
        resolveTimelineMusicAtTime(
          musicFields,
          timelineDuration,
          currentTimeRef.current,
          music1Duration,
          music2Duration,
        )
      ) {
        m.play().catch(() => {});
      }
    } else {
      m?.pause();
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [
    playing,
    activeBlock?.id,
    visualBlock?.id,
    visualBlock?.videoUrl,
    playbackVideoUrl,
    showVideo,
    activeBlock?.sceneAudioUrl,
    narrationPlayback?.lead.audioUrl,
    narrationPlayback?.lead.id,
    narrationPlayback?.audioOffset,
    musicUrl,
    music2Url,
    musicFields,
    music1Duration,
    music2Duration,
    timelineDuration,
    syncMusic,
    effectiveMusicSpan,
  ]);

  // Narration `ended` → next block.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a || !narrationPlayback?.lead.audioUrl) return;

    function onEnded() {
      if (!playingRef.current) return;
      const playback = narrationPlayback;
      if (!playback) return;
      const spanEnd = playback.groupStartTime + playback.groupDuration;
      const total = totalDurationRef.current;
      const timelineNow = currentTimeRef.current;
      const block = activeBlockRef.current;

      if (timelineNow < spanEnd - 0.05 && block) {
        const end = blockStartRef.current + block.durationSeconds;
        lastReportedTimeRef.current = end;
        onTimeChangeRef.current(end);
        return;
      }

      if (spanEnd >= total - 0.001) {
        onTimeChangeRef.current(total);
        onPauseRef.current();
        return;
      }
      lastReportedTimeRef.current = spanEnd;
      onTimeChangeRef.current(spanEnd);
    }

    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [blocks, narrationPlayback, narrationPlayback?.lead.audioUrl, narrationPlayback?.lead.id]);

  // Master clock: read narration currentTime via rAF, but throttle React state updates.
  React.useEffect(() => {
    if (!playing || !hasNarration) return;
    const a = audioRef.current;
    if (!a) return;

    let frame = 0;
    let cancelled = false;
    let lastVideoSync = 0;

    function timelineFromAudio(audioTime: number): number {
      const clockBase = narrationClockBaseRef.current;
      if (clockBase) {
        return clockBase.groupStartTime + Math.max(0, audioTime - clockBase.audioBaseOffset);
      }
      const playback = resolveNarrationPlaybackAtTime(blocks, currentTimeRef.current);
      if (playback) {
        return playback.groupStartTime + Math.max(0, audioTime - playback.audioBaseOffset);
      }
      return blockStartRef.current + audioTime;
    }

    function scheduleNext() {
      if (!cancelled) frame = requestAnimationFrame(step);
    }

    function step(now: number) {
      if (cancelled) return;
      if (!playingRef.current) return;

      const audio = audioRef.current;
      const block = activeBlockRef.current;
      if (!audio || !block) {
        scheduleNext();
        return;
      }

      const playback = resolveNarrationPlaybackAtTime(blocks, currentTimeRef.current);
      const blockDur = block.durationSeconds;
      const groupGlobal = timelineFromAudio(audio.currentTime);
      const blockEnd = blockStartRef.current + blockDur;
      const spanEnd = playback
        ? playback.groupStartTime + playback.groupDuration
        : blockEnd;

      if (
        playback &&
        groupGlobal >= blockEnd - 0.05 &&
        blockEnd < spanEnd - 0.02
      ) {
        const end = blockEnd;
        lastReportedTimeRef.current = end;
        onTimeChangeRef.current(end);
        scheduleNext();
        return;
      }

      if (audio.ended) {
        if (playback && groupGlobal < spanEnd - 0.05) {
          const end = blockEnd;
          lastReportedTimeRef.current = end;
          onTimeChangeRef.current(end);
          scheduleNext();
          return;
        }
        const total = totalDurationRef.current;
        if (spanEnd >= total - 0.001) {
          onTimeChangeRef.current(total);
          onPauseRef.current();
          return;
        }
        lastReportedTimeRef.current = spanEnd;
        onTimeChangeRef.current(spanEnd);
        scheduleNext();
        return;
      }

      if (groupGlobal >= totalDurationRef.current - 0.001) {
        onTimeChangeRef.current(totalDurationRef.current);
        onPauseRef.current();
        return;
      }

      if (Math.abs(groupGlobal - lastReportedTimeRef.current) >= 0.08) {
        lastReportedTimeRef.current = groupGlobal;
        onTimeChangeRef.current(groupGlobal);
      }

      if (now - lastVideoSync > 250) {
        lastVideoSync = now;
        const v = videoRef.current;
        if (v && visualBlockRef.current?.videoUrl && playbackVideoUrl && v.readyState >= 2) {
          const videoLocal = Math.max(0, groupGlobal - blockStartRef.current);
          softSyncVideoToNarration(v, videoLocal);
        }
      }

      const music = musicRef.current;
      if (music) {
        const swell = musicSwellMultiplierAtTime(blocks, groupGlobal);
        music.volume = effectiveMusicGainAtTime({
          musicVolume,
          masterVolume,
          swellMultiplier: swell,
        });
      }

      scheduleNext();
    }

    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [playing, hasNarration, blocks, musicVolume, masterVolume, playbackVideoUrl]);

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
  }, [activeBlock?.id, visualBlock?.videoUrl, activeBlock?.durationSeconds]);

  // Fallback clock for music-moment blocks and clips without narration audio.
  React.useEffect(() => {
    if (!playing || hasNarration) {
      lastTimestampRef.current = null;
      return;
    }

    let cancelled = false;
    let frame = 0;
    let lastVideoSync = 0;

    function tick(ts: number) {
      if (cancelled || !playingRef.current) return;

      const v = videoRef.current;
      const blockStart = blockStartRef.current;
      const total = totalDurationRef.current;
      const useVideoClock =
        v &&
        visualBlockRef.current?.videoUrl &&
        showVideo &&
        v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !v.paused &&
        !v.seeking;

      if (useVideoClock) {
        const global = blockStart + v!.currentTime;
        if (global >= total - 0.001) {
          onTimeChangeRef.current(total);
          onPauseRef.current();
          return;
        }
        if (Math.abs(global - lastReportedTimeRef.current) >= 0.05) {
          lastReportedTimeRef.current = global;
          onTimeChangeRef.current(global);
        }
      } else if (lastTimestampRef.current !== null) {
        const dt = (ts - lastTimestampRef.current) / 1000;
        const next = currentTimeRef.current + dt;
        if (next >= total - 0.001) {
          onTimeChangeRef.current(total);
          onPauseRef.current();
          return;
        }
        onTimeChangeRef.current(next);
        const music = musicRef.current;
        if (music) {
          const swell = musicSwellMultiplierAtTime(blocks, next);
          music.volume = effectiveMusicGainAtTime({
            musicVolume,
            masterVolume,
            swellMultiplier: swell,
          });
        }
      }

      if (useVideoClock && ts - lastVideoSync > 250) {
        lastVideoSync = ts;
        const music = musicRef.current;
        if (music) {
          const swell = musicSwellMultiplierAtTime(blocks, blockStart + v!.currentTime);
          music.volume = effectiveMusicGainAtTime({
            musicVolume,
            masterVolume,
            swellMultiplier: swell,
          });
        }
      }

      lastTimestampRef.current = ts;
      frame = requestAnimationFrame(tick);
    }

    lastTimestampRef.current = null;
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lastTimestampRef.current = null;
    };
  }, [playing, hasNarration, blocks, musicVolume, masterVolume, showVideo]);

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
    const swell = musicSwellMultiplierAtTime(blocks, currentTime);
    m.volume = effectiveMusicGainAtTime({
      musicVolume,
      masterVolume,
      swellMultiplier: swell,
    });
  }, [blocks, currentTime, musicVolume, masterVolume]);

  React.useEffect(() => {
    const m = musicRef.current;
    if (!m) return;
    if (!musicUrl && !music2Url) {
      m.removeAttribute("src");
      m.load();
    }
  }, [musicUrl, music2Url]);

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
    } catch {
      // ignore unsupported / blocked fullscreen
    }
  }

  // In fullscreen, keep the media inside an aspect-correct centered "stage"
  // (letterboxed) instead of stretching to fill the whole screen — matters
  // most for vertical 9:16 on a landscape monitor.
  const stageClass = cn(
    "absolute inset-0",
    isFullscreen &&
      cn(
        "relative inset-auto mx-auto h-full w-auto max-w-full overflow-hidden",
        formatSpec.previewAspectClass,
      ),
  );

  return (
    <div
      ref={wrapperRef}
      className={cn(compact ? "w-auto" : "h-full w-full min-h-0")}
      style={
        compact
          ? { width: compactBounds.width, height: compactBounds.height }
          : undefined
      }
    >
      <div
        ref={containerRef}
        style={
          isFullscreen
            ? undefined
            : { width: frameSize.width, height: frameSize.height }
        }
        className={cn(
          "group/preview relative mx-auto overflow-hidden rounded-md bg-black",
          "fullscreen:flex fullscreen:aspect-auto fullscreen:h-screen fullscreen:w-screen fullscreen:max-w-none fullscreen:items-center fullscreen:justify-center fullscreen:rounded-none fullscreen:bg-black",
        )}
      >
      <div className={stageClass}>
      {clientReady ? (
        <>
      {hasStill ? (
        <div
          className={cn(
            "absolute inset-0 z-[1]",
            showVideo && videoFrameReady && "opacity-0",
          )}
        >
          <TimelineThumbImage visual={visualBlock} className="h-full w-full" />
        </div>
      ) : null}
      {mountVideo ? (
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 z-0 h-full w-full object-contain transition-opacity duration-150",
            videoFrameReady ? "opacity-100" : "opacity-0",
          )}
          playsInline
          muted
          preload="auto"
          poster={thumbCandidates[0] ?? undefined}
          onLoadedData={() => setVideoFrameReady(true)}
          onCanPlay={() => setVideoFrameReady(true)}
        />
      ) : !hasStill && !visualBlock?.videoUrl ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60">
          <ImageIcon className="h-6 w-6" />
          <span className="text-2xs">
            {activeBlock
              ? "No media yet for this block"
              : blocks.length > 0
                ? "Past end of timeline"
                : "Generate a story to start"}
          </span>
        </div>
      ) : null}

      {showVideo && !videoFrameReady && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/45 px-3 text-center text-white/90">
          <Loader2 className={cn("animate-spin text-white/80", compact ? "h-4 w-4" : "h-5 w-5")} />
          <span className={cn("font-medium", compact ? "text-[10px] leading-tight" : "text-2xs")}>
            Carregando vídeo…
          </span>
        </div>
      )}
        </>
      ) : hasStill ? (
        <TimelineThumbImage visual={visualBlock} className="absolute inset-0 h-full w-full" />
      ) : visualBlock?.videoUrl ? (
        <div className="absolute inset-0 bg-black" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60">
          <ImageIcon className="h-6 w-6" />
          <span className="text-2xs">
            {activeBlock
              ? "No media yet for this block"
              : blocks.length > 0
                ? "Past end of timeline"
                : "Generate a story to start"}
          </span>
        </div>
      )}

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
      </div>

      <audio ref={audioRef} className="hidden" preload="metadata" />
      <audio ref={sceneRef} className="hidden" preload="metadata" />
      <audio ref={musicRef} className="hidden" preload="metadata" />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={toggleFullscreen}
        title={
          isFullscreen
            ? "Exit fullscreen (Esc)"
            : compact
              ? "Fullscreen video (Esc to exit)"
              : "Fullscreen (Esc to exit)"
        }
        className={cn(
          "absolute right-1 top-1 z-10 border border-white/10 bg-black/50 text-white hover:bg-black/70 hover:text-white",
          isFullscreen
            ? "opacity-100"
            : compact
              ? "h-5 w-5 opacity-80 hover:opacity-100"
              : "opacity-0 transition-opacity group-hover/preview:opacity-100",
        )}
      >
        {isFullscreen ? (
          <Minimize2 className={cn(compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />
        ) : (
          <Maximize2 className={cn(compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />
        )}
      </Button>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-2xs text-white/80",
          isFullscreen && "opacity-0 transition-opacity group-hover/preview:opacity-100",
        )}
      >
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

function findNextVisualBlock(
  blocks: Block[],
  activeBlock: Block | null,
): Block | null {
  if (!activeBlock) return null;
  const startIdx = blocks.findIndex((b) => b.id === activeBlock.id);
  if (startIdx < 0) return null;
  for (let i = startIdx + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (isStoryBlockPause(block)) continue;
    if (block.videoUrl?.trim()) return block;
  }
  return null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
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

function playVideoWhenReady(video: HTMLVideoElement, blockSeconds: number): () => void {
  const start = () => {
    seekVideoForBlock(video, blockSeconds);
    void video.play().catch(() => {});
  };
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    start();
    return () => {};
  }
  video.addEventListener("canplay", start, { once: true });
  return () => video.removeEventListener("canplay", start);
}

function playAudioWhenReady(
  audio: HTMLAudioElement,
  seek: () => void,
): () => void {
  const start = () => {
    seek();
    void audio.play().catch(() => {});
  };
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    start();
    return () => {};
  }
  audio.addEventListener("canplay", start, { once: true });
  return () => audio.removeEventListener("canplay", start);
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
  sceneOffset?: number;
  musicFields?: Parameters<typeof resolveTimelineMusicAtTime>[0];
  music1Duration?: number | null;
  music2Duration?: number | null;
  timelineDuration?: number;
  /** @deprecated use musicFields */
  musicStartSeconds?: number;
  musicSpanSeconds?: number;
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
    sceneOffset,
    musicFields,
    music1Duration = null,
    music2Duration = null,
    timelineDuration = Number.POSITIVE_INFINITY,
    musicStartSeconds = 0,
    musicSpanSeconds = Number.POSITIVE_INFINITY,
  } = opts;
  if (hasVideo && video) seekVideoForBlock(video, blockOffset);
  if (hasAudio && audio) {
    try {
      audio.currentTime = narrationTime ?? blockOffset;
    } catch {}
  }
  if (hasScene && scene) seekSceneAtOffset(scene, sceneOffset ?? blockOffset);
  if (hasMusic && music) {
    const resolved =
      musicFields != null
        ? resolveTimelineMusicAtTime(
            musicFields,
            timelineDuration,
            globalTime,
            music1Duration,
            music2Duration,
          )
        : null;
    if (!resolved) {
      if (!musicActiveAtTime(globalTime, musicSpanSeconds)) {
        music.pause();
        return;
      }
      const fileDur = music.duration;
      const target = musicFileOffsetAtTime(
        musicStartSeconds,
        globalTime,
        Number.isFinite(fileDur) && fileDur > 0 ? fileDur : null,
      );
      if (Math.abs(music.currentTime - target) > 0.35) {
        try {
          music.currentTime = target;
        } catch {}
      }
      return;
    }
    if (!mediaSrcMatches(music.src, resolved.url)) {
      music.src = resolved.url;
      music.load();
    }
    if (Math.abs(music.currentTime - resolved.fileOffsetSeconds) > 0.35) {
      try {
        music.currentTime = resolved.fileOffsetSeconds;
      } catch {}
    }
  }
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
