#!/usr/bin/env python3
"""Synthesize an English dub timed to the original speech, then mux into the video."""
import json
import os
import subprocess
import sys
import wave

import numpy as np

SEGMENTS_JSON = sys.argv[1]
VOICE = sys.argv[2]
SR = 44100

SRC_VIDEO = "/mnt/c/Users/viche/Desktop/papo-global-whitelabel-v1.mp4"
WORK = "/home/vitor/imagine/papo-dub"
CLIPS = os.path.join(WORK, "clips")
OUT_WAV = os.path.join(WORK, "dub_track.wav")
OUT_MP4 = "/mnt/c/Users/viche/Desktop/papo-global-whitelabel-v1-english-dub.mp4"

RATE = os.environ.get("DUB_RATE", "+8%")       # edge-tts speaking rate (reels-style energy)
PITCH = os.environ.get("DUB_PITCH", "+0Hz")    # edge-tts pitch shift
MAX_TEMPO = 1.35                                # max speed-up to fit timing
MIN_TEMPO = 0.88                                # max slow-down when filling a long window


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def video_duration():
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", SRC_VIDEO]).stdout.decode().strip()
    return float(out)


def merge_segments(segs, max_gap=0.35, max_chars=130):
    """Merge close, short fragments into phrases for more natural TTS prosody."""
    merged = []
    for s in segs:
        if merged:
            prev = merged[-1]
            gap = s["start"] - prev["end"]
            combined = prev["text"].rstrip() + " " + s["text"].strip()
            if gap < max_gap and len(combined) <= max_chars and prev["text"].rstrip()[-1:] not in ".!?":
                prev["end"] = s["end"]
                prev["text"] = combined
                continue
        merged.append({"start": s["start"], "end": s["end"], "text": s["text"].strip()})
    return merged


def read_wav_mono(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() == 2:
            data = data.reshape(-1, 2).mean(axis=1)
        return data.astype(np.float32) / 32768.0, sr


def eleven_tts(text, mp3):
    """Synthesize with the cloned ElevenLabs voice."""
    import requests
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        with open("/home/vitor/imagine/.env.local") as f:
            for line in f:
                if line.strip().startswith("ELEVENLABS_API_KEY="):
                    key = line.split("=", 1)[1].strip()
    voice_id = VOICE.split(":", 1)[1] if ":" in VOICE else ""
    if os.path.exists(os.path.join(WORK, "voice_id.txt")) and not voice_id:
        voice_id = open(os.path.join(WORK, "voice_id.txt")).read().strip()
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        params={"output_format": "mp3_44100_128"},
        json={
            "text": text,
            "model_id": os.environ.get("EL_MODEL", "eleven_multilingual_v2"),
            "voice_settings": {
                "stability": float(os.environ.get("EL_STABILITY", "0.5")),
                "similarity_boost": float(os.environ.get("EL_SIMILARITY", "0.85")),
                "style": float(os.environ.get("EL_STYLE", "0.15")),
                "use_speaker_boost": True,
            },
        },
        timeout=120,
    )
    r.raise_for_status()
    with open(mp3, "wb") as f:
        f.write(r.content)


def synth_segment(text, base, window):
    """TTS one phrase; time-stretch to fit its time window (bounded for naturalness)."""
    mp3 = f"{base}.mp3"
    wav = f"{base}.wav"
    if VOICE == "xtts":
        import hashlib

        import xtts_synth
        cache_dir = os.path.join(WORK, "xtts_cache")
        os.makedirs(cache_dir, exist_ok=True)
        cache = os.path.join(cache_dir, hashlib.md5(text.encode()).hexdigest()[:12] + ".wav")
        if not os.path.exists(cache):
            print(f"    (xtts generating: {text[:50]}...)", flush=True)
            xtts_synth.synth(text, cache)
        # trim leading/trailing silence the model adds, then restore pitch
        # (cloned audio lands ~200Hz; original speaker is ~307Hz)
        pitch_ratio = os.environ.get("XTTS_PITCH", "1.5")
        trim = ("silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,"
                "areverse,"
                "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,"
                "areverse")
        run(["ffmpeg", "-y", "-v", "error", "-i", cache, "-af", f"{trim},rubberband=pitch={pitch_ratio}",
             "-ac", "1", "-ar", str(SR), wav])
    elif VOICE.startswith("eleven"):
        eleven_tts(text, mp3)
        run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ac", "1", "-ar", str(SR), wav])
    else:
        run([sys.executable, "-m", "edge_tts", "--voice", VOICE, "--rate", RATE,
             "--pitch", PITCH, "--text", text, "--write-media", mp3])
        run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ac", "1", "-ar", str(SR), wav])
    x, _ = read_wav_mono(wav)
    dur = len(x) / SR

    # slow slightly to fill a long window; speed up if the line would overrun
    if dur > window:
        tempo = min(dur / window, MAX_TEMPO)
    elif window - dur > 0.5:
        tempo = max(dur / window, MIN_TEMPO)
    else:
        tempo = 1.0
    if abs(tempo - 1.0) > 0.01:
        stretched = f"{base}_t.wav"
        run(["ffmpeg", "-y", "-v", "error", "-i", wav,
             "-filter:a", f"atempo={tempo:.4f}", "-ar", str(SR), "-ac", "1", stretched])
        x, _ = read_wav_mono(stretched)
    return x, tempo


def main():
    segs = json.load(open(SEGMENTS_JSON))
    phrases = merge_segments(segs)
    dur = video_duration()
    print(f"video {dur:.2f}s | {len(segs)} segments -> {len(phrases)} phrases | voice={VOICE}")

    os.makedirs(CLIPS, exist_ok=True)
    track = np.zeros(int(dur * SR) + SR, dtype=np.float32)

    for i, p in enumerate(phrases):
        nxt = phrases[i + 1]["start"] if i + 1 < len(phrases) else dur - 0.1
        window = max(nxt - p["start"] - 0.08, 0.6)
        x, tempo = synth_segment(p["text"], os.path.join(CLIPS, f"seg{i:03d}"), window)

        start = int(p["start"] * SR)
        end = min(start + len(x), len(track))
        chunk = x[: end - start]
        # gentle fade in/out to avoid clicks
        fade = min(int(0.012 * SR), len(chunk) // 2)
        if fade > 0:
            chunk[:fade] *= np.linspace(0, 1, fade)
            chunk[-fade:] *= np.linspace(1, 0, fade)
        track[start:end] += chunk
        print(f"[{i:3d}/{len(phrases)}] {p['start']:7.2f}s win={window:5.2f}s tempo={tempo:.2f}x  {p['text'][:60]}")

    # gentle limiter + normalize
    peak = np.abs(track).max() or 1.0
    if peak > 0.95:
        track *= 0.95 / peak
    pcm = (np.clip(track, -1, 1) * 32767).astype(np.int16)
    with wave.open(OUT_WAV, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"\nwrote {OUT_WAV}")

    run(["ffmpeg", "-y", "-v", "error", "-i", SRC_VIDEO, "-i", OUT_WAV,
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-c:a", "aac", "-b:a", "192k", "-shortest", OUT_MP4])
    print(f"wrote {OUT_MP4}")


if __name__ == "__main__":
    main()
