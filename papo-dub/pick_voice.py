#!/usr/bin/env python3
"""Pick the edge-tts female voice whose pitch/timbre is closest to the original speaker."""
import os
import subprocess
import sys
import wave

import numpy as np

ORIG = "/home/vitor/imagine/papo-dub/audio44k.wav"
SEGMENTS_JSON = sys.argv[1] if len(sys.argv) > 1 else "/home/vitor/imagine/papo-dub/segments_small.json"
OUTDIR = "/home/vitor/imagine/papo-dub/voice_samples"
CANDIDATES = [
    "en-US-MichelleNeural",
    "en-US-JennyNeural",
    "en-US-AriaNeural",
    "en-US-EmmaMultilingualNeural",
    "en-GB-SoniaNeural",
    "en-US-AshleyNeural",
]


def read_wav_mono(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() == 2:
            data = data.reshape(-1, 2).mean(axis=1)
    return data.astype(np.float32) / 32768.0, sr


def f0_stats(path):
    """Median F0 (Hz), spread, and voiced-frame count via autocorrelation."""
    x, sr = read_wav_mono(path)
    frame = int(0.040 * sr)
    hop = int(0.020 * sr)
    f0s = []
    lag_min, lag_max = int(sr / 400), int(sr / 70)  # 70-400 Hz range
    for i in range(0, len(x) - frame, hop):
        seg = x[i:i + frame]
        if np.sqrt(np.mean(seg ** 2)) < 0.015:
            continue
        seg = seg - seg.mean()
        ac = np.correlate(seg, seg, mode="full")[frame - 1:]
        if len(ac) <= lag_max or ac[0] == 0:
            continue
        ac = ac / ac[0]
        peak = ac[lag_min:lag_max]
        if peak.size and peak.max() > 0.35:
            lag = lag_min + int(np.argmax(peak))
            f0s.append(sr / lag)
    if not f0s:
        return None
    f0s = np.array(f0s)
    return dict(
        f0_median=float(np.median(f0s)),
        f0_p25=float(np.percentile(f0s, 25)),
        f0_p75=float(np.percentile(f0s, 75)),
        voiced_frames=int(f0s.size),
    )


def speech_rate(path):
    """Syllable-ish rate: count amplitude envelope peaks per second."""
    x, sr = read_wav_mono(path)
    win = int(0.010 * sr)
    n = len(x) // win
    env = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(axis=1))
    if env.size < 3:
        return 0.0
    thr = env.max() * 0.25
    peaks = np.sum((env[1:-1] > env[:-2]) & (env[1:-1] > env[2:]) & (env[1:-1] > thr))
    dur = len(x) / sr
    return float(peaks / max(dur, 1e-6))


def synth(text, voice, out_mp3):
    subprocess.run(
        [sys.executable, "-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", out_mp3],
        check=True, capture_output=True,
    )
    out_wav = out_mp3.replace(".mp3", ".wav")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", out_mp3, "-ac", "1", "-ar", "44100", out_wav],
        check=True,
    )
    return out_wav


def main():
    import json
    os.makedirs(OUTDIR, exist_ok=True)
    segs = json.load(open(SEGMENTS_JSON))
    sample = max(segs, key=lambda s: len(s["text"]))["text"][:180]
    print(f"sample text: {sample}\n")

    orig = f0_stats(ORIG)
    print(f"ORIGINAL  {orig}")
    o_rate = speech_rate(ORIG)
    print(f"ORIGINAL  syllable-rate {o_rate:.2f}/s\n")

    results = []
    for voice in CANDIDATES:
        mp3 = os.path.join(OUTDIR, f"{voice}.mp3")
        try:
            wav = synth(sample, voice, mp3)
        except Exception as e:
            print(f"{voice}: FAILED {e}")
            continue
        st = f0_stats(wav)
        if not st:
            print(f"{voice}: no voiced frames")
            continue
        r = speech_rate(wav)
        # distance: normalized F0 difference + spread difference + rate difference
        score = (
            abs(st["f0_median"] - orig["f0_median"]) / orig["f0_median"]
            + abs(st["f0_p75"] - orig["f0_p75"]) / orig["f0_p75"]
            + abs(r - o_rate) / max(o_rate, 1e-6) * 0.5
        )
        results.append((score, voice, st, r))
        print(f"{voice:32s} f0={st['f0_median']:.1f}Hz (p25 {st['f0_p25']:.1f} / p75 {st['f0_p75']:.1f}) rate={r:.2f}/s score={score:.3f}")

    results.sort(key=lambda t: t[0])
    print("\nRANKING:")
    for score, voice, st, r in results:
        print(f"  {score:.3f}  {voice}")
    print(f"\nBEST: {results[0][1]}")


if __name__ == "__main__":
    main()
