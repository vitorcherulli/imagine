#!/usr/bin/env python3
"""Generate Attenborough narration via Gemini TTS (Sadaltager) + OpenRouter."""

from __future__ import annotations

import json
import os
import struct
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGINE_ENV = ROOT.parent / ".env.local"
SCRIPT_PATH = ROOT / "roteiros/capitolio-mar-de-minas/youtube-en.md"
OUT_DIR = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Arquivos/Audio")
OUT_BASENAME = "Narracao Attenborough IA 2026"
PROJECT = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio IA 2026.prproj")

TTS_MODEL = "google/gemini-3.1-flash-tts-preview"
TTS_VOICE = "Sadaltager"  # Knowledgeable — documentary / Attenborough-adjacent
TTS_SPEED = 0.88  # slow, measured delivery
GEMINI_PCM_RATE = 24000


def load_env() -> None:
    for env_file in (ROOT / ".env", IMAGINE_ENV):
        if not env_file.is_file():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def pcm_to_wav(pcm: bytes, sample_rate: int = GEMINI_PCM_RATE) -> bytes:
    channels, bits = 1, 16
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm),
        b"WAVE",
        b"fmt ",
        16,
        1,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits,
        b"data",
        len(pcm),
    )
    return header + pcm


def generate_speech(text: str) -> bytes:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY not set — use editor-ia/.env or imagine/.env.local")

    payload = json.dumps(
        {
            "model": TTS_MODEL,
            "input": text,
            "voice": TTS_VOICE,
            "response_format": "pcm",
            "speed": TTS_SPEED,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/audio/speech",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://editor-ia.local",
            "X-Title": "editor-ia",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            content_type = res.headers.get("Content-Type", "")
            body = res.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"TTS HTTP {e.code}: {detail}") from e

    if "application/json" in content_type or (len(body) < 4096 and body[:1] == b"{"):
        data = json.loads(body)
        err = data.get("error", {})
        raise SystemExit(err.get("message", str(data)))

    return pcm_to_wav(body)


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "256k", str(mp3_path)],
        check=True,
        capture_output=True,
    )


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(r.stdout.strip())


def patch_prproj_audio_duration(duration: float) -> None:
    import gzip
    import xml.etree.ElementTree as ET

    TICKS = 254016000000
    end_ticks = str(int(round(duration * TICKS)))
    win = (
        r"E:\Vídeos\2017\Capitólio Mar de Minas\Arquivos\Audio"
        r"\Narracao Attenborough IA 2026.mp3"
    )

    with gzip.open(PROJECT, "rb") as f:
        root = ET.fromstring(f.read().decode("utf-8"))
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}

    for media in root.iter("Media"):
        fp = media.find("FilePath")
        if fp is None or "Attenborough" not in (fp.text or "") and "Narracao" not in (fp.text or ""):
            title = media.find("Title")
            if title is None or "Attenborough" not in (title.text or ""):
                continue
        for tag in ("FilePath", "ActualMediaFilePath"):
            el = media.find(tag)
            if el is not None:
                el.text = win
        off = media.find("OfflineReason")
        if off is not None:
            off.text = "0"

    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        if sc is None:
            continue
        sub = by_id.get(sc.get("ObjectRef", ""))
        if sub is None:
            continue
        name = sub.find("Name")
        if name is None or "Attenborough" not in (name.text or ""):
            continue
        ti = item.find(".//TrackItem")
        if ti is not None:
            s, e = ti.find("Start"), ti.find("End")
            if s is not None:
                s.text = "0"
            if e is not None:
                e.text = end_ticks
        clip_ref = sub.find("Clip")
        if clip_ref is not None:
            clip_elem = by_id.get(clip_ref.get("ObjectRef", ""))
            if clip_elem is not None:
                c = clip_elem.find("Clip")
                if c is not None:
                    ip, op = c.find("InPoint"), c.find("OutPoint")
                    if ip is not None:
                        ip.text = "0"
                    if op is not None:
                        op.text = end_ticks

    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(PROJECT, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))
    print(f"Patched prproj audio duration: {duration:.2f}s")


def main() -> None:
    load_env()
    text = SCRIPT_PATH.read_text(encoding="utf-8").strip()
    print(f"Script: {len(text.split())} words | model={TTS_MODEL} voice={TTS_VOICE} speed={TTS_SPEED}")

    wav_bytes = generate_speech(text)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = OUT_DIR / f"{OUT_BASENAME}.wav"
    mp3_path = OUT_DIR / f"{OUT_BASENAME}.mp3"
    wav_path.write_bytes(wav_bytes)
    wav_to_mp3(wav_path, mp3_path)

    duration = probe_duration(mp3_path)
    (OUT_DIR / f"{OUT_BASENAME}.txt").write_text(text + "\n", encoding="utf-8")

    print(f"Saved: {mp3_path} ({mp3_path.stat().st_size} bytes, {duration:.1f}s)")
    print(f"Saved: {wav_path}")

    if PROJECT.is_file():
        patch_prproj_audio_duration(duration)
    else:
        print(f"Warning: prproj not found at {PROJECT}")


if __name__ == "__main__":
    main()
