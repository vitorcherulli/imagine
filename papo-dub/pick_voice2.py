#!/usr/bin/env python3
"""Broader voice search + controlled pitch-shift variants vs. the original (F0 ~307 Hz)."""
import os
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, "/home/vitor/imagine/papo-dub")
from pick_voice import read_wav_mono, f0_stats, speech_rate, synth

WORK = "/home/vitor/imagine/papo-dub"
OUT = os.path.join(WORK, "voice_samples")
TARGET_F0 = 307.0

CANDIDATES = [
    "en-GB-SoniaNeural", "en-GB-MaisieNeural", "en-AU-NatashaNeural",
    "en-CA-ClaraNeural", "en-IN-NeerjaNeural", "en-US-AriaNeural",
    "en-US-EmmaMultilingualNeural", "en-US-MichelleNeural", "en-US-JennyNeural",
    "en-HU-NoemiNeural", "en-PK-UzmaNeural", "en-SG-LunaNeural",
]


def pitch_shift(wav_in, factor, wav_out):
    """Pitch shift without changing duration: asetrate + atempo compensation."""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav_in, "-af",
                    f"asetrate=44100*{factor:.4f},aresample=44100,atempo={1/factor:.4f}",
                    "-ar", "44100", "-ac", "1", wav_out], check=True)


def main():
    import json
    os.makedirs(OUT, exist_ok=True)
    segs = json.load(open(f"{WORK}/segments_final.json"))
    sample = max(segs, key=lambda s: len(s["text"]))["text"][:180]

    rows = []
    for voice in CANDIDATES:
        mp3 = os.path.join(OUT, f"{voice}.mp3")
        try:
            if not os.path.exists(mp3):
                wav0 = synth(sample, voice, mp3)
            else:
                wav0 = mp3.replace(".mp3", ".wav")
        except Exception as e:
            print(f"{voice}: FAILED {e}")
            continue
        st = f0_stats(wav0)
        if not st:
            continue
        r = speech_rate(wav0)
        rows.append((voice, st, r, wav0))
        print(f"{voice:32s} f0={st['f0_median']:6.1f}Hz  rate={r:4.2f}/s")

    print(f"\ntarget F0 = {TARGET_F0:.0f}Hz\n")
    best = []
    for voice, st, r, wav0 in rows:
        need = TARGET_F0 / st["f0_median"]
        for factor in sorted({1.0, 1.1, 1.2, 1.3, 1.4, 1.5}):
            if factor > need * 1.08:
                break
            shifted = wav0.replace(".wav", f"_x{factor:.1f}.wav")
            if factor > 1.0:
                pitch_shift(wav0, factor, shifted)
            else:
                shifted = wav0
            st2 = f0_stats(shifted)
            err = abs(st2["f0_median"] - TARGET_F0) / TARGET_F0
            best.append((err, factor, voice, st2["f0_median"]))
    best.sort()
    for err, factor, voice, f0 in best[:10]:
        print(f"err={err:.3f}  shift={factor:.1f}x  {voice:32s} -> f0={f0:.1f}Hz")


if __name__ == "__main__":
    main()
