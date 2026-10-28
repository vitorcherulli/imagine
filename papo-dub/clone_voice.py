#!/usr/bin/env python3
"""Build a clean voice sample from the original speaker and clone it on ElevenLabs."""
import json
import os
import subprocess
import sys
import wave

import numpy as np
import requests

WORK = "/home/vitor/imagine/papo-dub"
SRC = f"{WORK}/audio44k.wav"
SAMPLE_WAV = f"{WORK}/voice_sample.wav"
SAMPLE_MP3 = f"{WORK}/voice_sample.mp3"
VOICE_ID_FILE = f"{WORK}/voice_id.txt"
BASE = "https://api.elevenlabs.io/v1"


def load_key():
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if key:
        return key
    with open("/home/vitor/imagine/.env.local") as f:
        for line in f:
            if line.strip().startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


def build_sample():
    """Concatenate only the speech windows (drop pauses) into one clean sample."""
    segs = json.load(open(f"{WORK}/segments_final.json"))
    with wave.open(SRC, "rb") as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    chunks = []
    for s in segs:
        a, b = int(s["start"] * sr), int(s["end"] * sr)
        if b > a:
            chunks.append(x[a:b])
            chunks.append(np.zeros(int(0.15 * sr)))  # tiny gap between takes
    speech = np.concatenate(chunks)
    # normalize to a healthy level for cloning
    rms = np.sqrt((speech ** 2).mean()) or 1.0
    speech = speech * min(0.12 / rms, 3.0)
    speech = np.clip(speech, -1, 1)
    with wave.open(SAMPLE_WAV, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((speech * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SAMPLE_WAV, "-b:a", "128k", SAMPLE_MP3], check=True)
    dur = len(speech) / sr
    print(f"voice sample: {dur:.1f}s -> {SAMPLE_MP3}")
    return SAMPLE_MP3


def clone(key, sample):
    """Instant voice clone; returns voice_id."""
    with open(sample, "rb") as f:
        r = requests.post(
            f"{BASE}/voices/add",
            headers={"xi-api-key": key},
            data={"name": "Papo Global speaker"},
            files={"files": ("voice_sample.mp3", f, "audio/mpeg")},
            timeout=120,
        )
    if r.status_code not in (200, 201):
        print(f"voices/add failed ({r.status_code}): {r.text[:300]}", file=sys.stderr)
        r = requests.post(
            f"{BASE}/voices/create/instant",
            headers={"xi-api-key": key},
            data={"name": "Papo Global speaker"},
            files=[("files", ("voice_sample.mp3", open(sample, "rb"), "audio/mpeg"))],
            timeout=120,
        )
    r.raise_for_status()
    vid = r.json()["voice_id"]
    with open(VOICE_ID_FILE, "w") as f:
        f.write(vid)
    print(f"cloned voice_id: {vid}")
    return vid


def main():
    key = load_key()
    if not key:
        sys.exit("ELEVENLABS_API_KEY not set (env or /home/vitor/imagine/.env.local)")
    r = requests.get(f"{BASE}/user/subscription", headers={"xi-api-key": key}, timeout=30)
    r.raise_for_status()
    sub = r.json()
    print(f"plan: {sub.get('tier')} | characters left: {sub.get('character_count')}")

    sample = build_sample()
    clone(key, sample)


if __name__ == "__main__":
    main()
