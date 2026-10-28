#!/usr/bin/env python3
"""Transcribe + translate the source audio to English with timestamps."""
import json
import sys

from faster_whisper import WhisperModel

MODEL_SIZE = sys.argv[1] if len(sys.argv) > 1 else "small"
AUDIO = "/home/vitor/imagine/papo-dub/audio16k.wav"
OUT = f"/home/vitor/imagine/papo-dub/segments_{MODEL_SIZE}.json"

model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=12)

segments, info = model.transcribe(
    AUDIO,
    task="translate",   # any language -> English text
    beam_size=5,
    vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=300),
    condition_on_previous_text=True,
)

print(f"detected language: {info.language} (p={info.language_probability:.2f})", flush=True)

rows = []
for seg in segments:
    rows.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
    print(f"[{seg.start:7.2f} -> {seg.end:7.2f}] {seg.text.strip()}", flush=True)

with open(OUT, "w") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print(f"\nwrote {len(rows)} segments to {OUT}")
