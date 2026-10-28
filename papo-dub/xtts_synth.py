#!/usr/bin/env python3
"""XTTS v2 synthesis with the original speaker's cloned voice (CPU)."""
import os

MODEL = None
SPEAKER_WAV = os.environ.get("XTTS_SPEAKER", "/home/vitor/imagine/papo-dub/voice_sample.wav")


def load():
    global MODEL
    if MODEL is None:
        import torch
        torch.set_num_threads(12)
        from TTS.api import TTS
        MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
    return MODEL


def synth(text, out_wav, speaker_wav=None, language="en"):
    tts = load()
    tts.tts_to_file(
        text=text,
        speaker_wav=speaker_wav or SPEAKER_WAV,
        language=language,
        file_path=out_wav,
        split_sentences=False,
    )
    return out_wav


def build_sample(max_speech_seconds=30.0):
    """Clean reference clip of the original speaker (~30s of speech, pauses removed)."""
    import json
    import wave

    import numpy as np

    work = "/home/vitor/imagine/papo-dub"
    segs = json.load(open(f"{work}/segments_final.json"))
    with wave.open(f"{work}/audio44k.wav", "rb") as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

    chunks, total = [], 0.0
    for s in segs:
        a, b = int(s["start"] * sr), int(s["end"] * sr)
        if b <= a:
            continue
        take = min(b - a, int((max_speech_seconds - total) * sr))
        chunks.append(x[a:a + take])
        chunks.append(np.zeros(int(0.12 * sr)))
        total += take / sr
        if total >= max_speech_seconds:
            break

    speech = np.concatenate(chunks)
    rms = np.sqrt((speech ** 2).mean()) or 1.0
    speech = np.clip(speech * min(0.12 / rms, 3.0), -1, 1)
    with wave.open(f"{work}/voice_sample.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((speech * 32767).astype(np.int16).tobytes())
    print(f"voice sample: {total:.1f}s speech -> {work}/voice_sample.wav")
