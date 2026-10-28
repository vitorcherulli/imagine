#!/usr/bin/env python3
"""Measure the original speaker's pitch using only speech-segment windows (mid channel)."""
import json
import subprocess
import sys

sys.path.insert(0, "/home/vitor/imagine/papo-dub")
import numpy as np
from pick_voice import read_wav_mono, f0_stats, speech_rate

WORK = "/home/vitor/imagine/papo-dub"
segs = json.load(open(f"{WORK}/segments_final.json"))

# Extract the "mid" (center) channel to suppress stereo background music, speech is usually centered.
mid = f"{WORK}/audio_mid.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", f"{WORK}/audio44k.wav",
                "-af", "pan=mono|c0=0.5*c0+0.5*c1", "-ar", "44100", mid], check=True)

x, sr = read_wav_mono(mid)

# Concatenate just the speech windows
chunks = []
for s in segs:
    a, b = int(s["start"] * sr), int(s["end"] * sr)
    chunks.append(x[a:b])
speech = np.concatenate(chunks)

tmp = f"{WORK}/speech_only.wav"
import wave
with wave.open(tmp, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(speech, -1, 1) * 32767).astype(np.int16).tobytes())

print("SPEECH-ONLY:", f0_stats(tmp))
print("SPEECH-ONLY syllable-rate:", round(speech_rate(tmp), 2), "/s")

# Also check stereo correlation: if sides carry lots of energy -> music spread wide
with wave.open(f"{WORK}/audio44k.wav", "rb") as w:
    d = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
L, R = d[0::2], d[1::2]
mid_c, side_c = (L + R) / 2, (L - R) / 2
print(f"stereo: corr(L,R)={np.corrcoef(L, R)[0,1]:.3f}  rms_mid={np.sqrt((mid_c**2).mean()):.4f}  rms_side={np.sqrt((side_c**2).mean()):.4f}")
