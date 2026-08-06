"use client";

import * as React from "react";
import type { DubSegmentClip } from "@/lib/dubbing/track-view";

export type DubPreviewMode = "original" | "dub" | "mix";

type PreviewSegment = Pick<
  DubSegmentClip,
  "id" | "startSeconds" | "endSeconds" | "ttsAudioUrl"
>;

function playSegmentAudio(audio: HTMLAudioElement, url: string, offset: number) {
  const startPlayback = () => {
    try {
      audio.currentTime = offset;
    } catch {
      // ignore seek before metadata
    }
    void audio.play().catch(() => {
      // Autoplay policies or corrupt media — ignore during scrubbing.
    });
  };

  audio.src = url;

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    startPlayback();
    return;
  }

  const onReady = () => {
    audio.removeEventListener("loadedmetadata", onReady);
    audio.removeEventListener("canplay", onReady);
    startPlayback();
  };
  audio.addEventListener("loadedmetadata", onReady);
  audio.addEventListener("canplay", onReady);
  audio.load();
}

/**
 * During preview, mux dubbed TTS segments on top of (or instead of) the source
 * media element — mirrors export mix when mode === "mix".
 */
export function useDubPreviewAudio({
  mediaRef,
  segments,
  mode,
  backgroundGain,
  enabled,
}: {
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  segments: PreviewSegment[];
  mode: DubPreviewMode;
  backgroundGain: number;
  /** False when no segments synthesized yet. */
  enabled: boolean;
}) {
  const dubAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastSegmentIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const media = mediaRef.current;
    if (!media || !enabled) return;

    if (mode === "original") {
      media.muted = false;
      media.volume = 1;
      dubAudioRef.current?.pause();
      lastSegmentIdRef.current = null;
      return;
    }

    if (mode === "dub") {
      media.muted = true;
      return;
    }

    media.muted = false;
    media.volume = Math.min(1, Math.max(0, backgroundGain));
  }, [mediaRef, mode, backgroundGain, enabled]);

  React.useEffect(() => {
    const media = mediaRef.current;
    if (!media || !enabled || mode === "original") {
      dubAudioRef.current?.pause();
      lastSegmentIdRef.current = null;
      return;
    }

    if (!dubAudioRef.current) {
      dubAudioRef.current = new Audio();
      dubAudioRef.current.preload = "auto";
    }

    function stopDub() {
      dubAudioRef.current?.pause();
      lastSegmentIdRef.current = null;
    }

    function segmentAtTime(t: number): PreviewSegment | undefined {
      return segments.find(
        (s) =>
          s.ttsAudioUrl &&
          t >= s.startSeconds - 0.04 &&
          t < s.endSeconds + 0.02,
      );
    }

    function syncDubAudio() {
      if (media!.paused) {
        dubAudioRef.current?.pause();
        return;
      }

      const t = media!.currentTime;
      const seg = segmentAtTime(t);

      if (!seg?.ttsAudioUrl) {
        if (dubAudioRef.current && !dubAudioRef.current.paused) {
          dubAudioRef.current.pause();
        }
        lastSegmentIdRef.current = null;
        return;
      }

      const offset = Math.max(0, t - seg.startSeconds);
      const audio = dubAudioRef.current!;

      if (lastSegmentIdRef.current !== seg.id) {
        lastSegmentIdRef.current = seg.id;
        playSegmentAudio(audio, seg.ttsAudioUrl, offset);
        return;
      }

      if (!audio.paused && Math.abs(audio.currentTime - offset) > 0.35) {
        try {
          audio.currentTime = offset;
        } catch {
          playSegmentAudio(audio, seg.ttsAudioUrl, offset);
        }
      }
    }

    function onSeeked() {
      lastSegmentIdRef.current = null;
      syncDubAudio();
    }

    media.addEventListener("timeupdate", syncDubAudio);
    media.addEventListener("seeked", onSeeked);
    media.addEventListener("pause", stopDub);
    media.addEventListener("play", syncDubAudio);

    return () => {
      media.removeEventListener("timeupdate", syncDubAudio);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("pause", stopDub);
      media.removeEventListener("play", syncDubAudio);
      dubAudioRef.current?.pause();
      dubAudioRef.current = null;
      lastSegmentIdRef.current = null;
    };
  }, [mediaRef, segments, mode, enabled]);

  React.useEffect(() => {
    return () => {
      dubAudioRef.current?.pause();
      dubAudioRef.current = null;
    };
  }, []);
}
