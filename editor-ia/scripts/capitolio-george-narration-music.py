#!/usr/bin/env python3
"""George (Kokoro) narration with pauses + emotional music for Capitólio."""

from __future__ import annotations

import gzip
import json
import os
import struct
import subprocess
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGINE_ENV = ROOT.parent / ".env.local"
OUT_DIR = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Arquivos/Audio")
PROJECT = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio IA 2026.prproj")
TICKS = 254016000000

TTS_MODEL = "hexgrad/kokoro-82m"
TTS_VOICE = "bm_george"
TTS_SPEED = 0.86
MUSIC_MODEL = "google/lyria-3-pro-preview"

NARR_MP3 = OUT_DIR / "Narracao Attenborough IA 2026.mp3"
MUSIC_WAV = OUT_DIR / "Musica Capitólio IA 2026.wav"
MUSIC_MP3 = OUT_DIR / "Musica Capitólio IA 2026.mp3"

# Paragraphs + pause after each (seconds)
SEGMENTS: list[tuple[str, float]] = [
    (
        "Six hundred kilometres from the nearest ocean, in the heart of Brazil, "
        "the landscape begins to change.",
        1.4,
    ),
    (
        "Capitólio lies in southern Minas Gerais, on the edge of the Furnas Reservoir — "
        "a lake so vast that those who live here call it the Mar de Minas, the Sea of Minas. "
        "It is one of the largest artificial lakes in Brazil. "
        "Yet time and water have made it feel like something ancient. "
        "More than twenty waterfalls spill into its valleys. "
        "For a region six hundred kilometres from the coast, it is the closest thing to a shore.",
        1.2,
    ),
    (
        "The first glimpse comes from the Furnas Canyons Lookout, along Highway MG zero fifty. "
        "A short walk through the trees — no more than a hundred metres — and the land falls away. "
        "Below, the canyon walls rise in layers of rock, carved slowly over millennia. "
        "The view demands silence.",
        1.2,
    ),
    (
        "Higher on the trail, Diquadinha Waterfall pours through the light. "
        "The water is so clear that the riverbed seems to hang beneath the surface. "
        "With every step upward, the forest opens onto a view more striking than the last.",
        1.2,
    ),
    (
        "At Cascata Eco Parque, the landscape divides into two worlds. "
        "From above, the reservoir stretches to the horizon — small boats tracing lines across the water far below. "
        "From below, inside the canyon, a network of falls has worn smooth basins into the stone. "
        "The pools shift in colour — turquoise, emerald, deep blue — according to their depth. "
        "The water holds the warmth of the earth itself.",
        1.3,
    ),
    (
        "But the true scale of this place is only revealed from the water. "
        "A boat moves between canyon walls forty metres high — cliffs that tower above the forest path. "
        "Through Toucan Valley. Past Cascatinha Fall. Beneath the lower canyon. "
        "And finally, into the Blue Lagoon — a chamber of water so vivid it seems to glow from within.",
        1.5,
    ),
    (
        "Capitólio does not announce itself. "
        "It waits, inland, far from the sea — "
        "and offers, to those who find it, a beauty that needs no ocean to be complete.",
        0.0,
    ),
]

MUSIC_PROMPT = (
    "Emotional cinematic documentary underscore for a nature film about Brazilian canyons and lakes. "
    "Slow orchestral strings, gentle acoustic guitar, soft piano, awe and reverence, no vocals, "
    "no percussion, warm and melancholic, National Geographic style, building gently toward hope."
)


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


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY missing")
    return key


def tts_segment(text: str) -> bytes:
    payload = json.dumps(
        {
            "model": TTS_MODEL,
            "input": text,
            "voice": TTS_VOICE,
            "response_format": "mp3",
            "speed": TTS_SPEED,
        }
    ).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/audio/speech",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://editor-ia.local",
            "X-Title": "editor-ia",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def make_silence_mp3(path: Path, duration: float) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(duration), "-c:a", "libmp3lame", "-b:a", "128k", str(path),
        ],
        check=True,
        capture_output=True,
    )


def concat_mp3(parts: list[Path], out: Path) -> None:
    lst = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
    for p in parts:
        lst.write(f"file '{p}'\n")
    lst.close()
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst.name, "-c:a", "libmp3lame", "-b:a", "256k", str(out)],
        check=True,
        capture_output=True,
    )
    os.unlink(lst.name)


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(r.stdout.strip())


def generate_narration() -> float:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp())
    parts: list[Path] = []
    try:
        for i, (text, pause) in enumerate(SEGMENTS):
            seg_mp3 = tmp_dir / f"seg_{i:02d}.mp3"
            seg_mp3.write_bytes(tts_segment(text))
            parts.append(seg_mp3)
            if pause > 0:
                sil = tmp_dir / f"sil_{i:02d}.mp3"
                make_silence_mp3(sil, pause)
                parts.append(sil)
        concat_mp3(parts, NARR_MP3)
    finally:
        for p in tmp_dir.glob("*"):
            p.unlink(missing_ok=True)
        tmp_dir.rmdir()

    dur = probe_duration(NARR_MP3)
    print(f"Narration: {NARR_MP3} ({dur:.1f}s) voice={TTS_VOICE} speed={TTS_SPEED}")
    return dur


def generate_music() -> float:
    body = json.dumps(
        {
            "model": MUSIC_MODEL,
            "messages": [{"role": "user", "content": MUSIC_PROMPT}],
            "modalities": ["text", "audio"],
            "audio": {"format": "wav"},
            "stream": True,
        }
    ).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "HTTP-Referer": "https://editor-ia.local",
            "X-Title": "editor-ia",
        },
        method="POST",
    )
    chunks: list[str] = []
    with urllib.request.urlopen(req, timeout=300) as res:
        buf = ""
        while True:
            chunk = res.read(8192)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    continue
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                for choice in data.get("choices", []):
                    audio = choice.get("delta", {}).get("audio") or choice.get("message", {}).get("audio")
                    if audio and audio.get("data"):
                        chunks.append(audio["data"])

    if not chunks:
        raise SystemExit("Music generation returned no audio")

    import base64
    wav_bytes = base64.b64decode("".join(chunks))
    MUSIC_WAV.write_bytes(wav_bytes)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(MUSIC_WAV), "-codec:a", "libmp3lame", "-b:a", "192k", str(MUSIC_MP3)],
        check=True,
        capture_output=True,
    )
    dur = probe_duration(MUSIC_MP3)
    print(f"Music: {MUSIC_MP3} ({dur:.1f}s)")
    return dur


def loop_music_to_duration(target: float) -> None:
    dur = probe_duration(MUSIC_MP3)
    if dur >= target - 1:
        return
    loops = int(target / dur) + 1
    tmp = OUT_DIR / "_music_loop.mp3"
    subprocess.run(
        [
            "ffmpeg", "-y", "-stream_loop", str(loops), "-i", str(MUSIC_MP3),
            "-t", str(target), "-c:a", "libmp3lame", "-b:a", "192k", str(tmp),
        ],
        check=True,
        capture_output=True,
    )
    tmp.replace(MUSIC_MP3)
    print(f"Music looped to {target:.1f}s")


def patch_prproj(narr_dur: float, music_dur: float) -> None:
    win_narr = r"E:\Vídeos\2017\Capitólio Mar de Minas\Arquivos\Audio\Narracao Attenborough IA 2026.mp3"
    win_music = r"E:\Vídeos\2017\Capitólio Mar de Minas\Arquivos\Audio\Musica Capitólio IA 2026.mp3"
    wsl_music = str(MUSIC_MP3)

    with gzip.open(PROJECT, "rb") as f:
        root = ET.fromstring(f.read().decode("utf-8"))
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}

    narr_ticks = str(int(round(narr_dur * TICKS)))
    seq_dur = max(narr_dur, music_dur)
    seq_ticks = str(int(round(seq_dur * TICKS)))

    # Update narration duration on A1
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
            ti.find("Start").text = "0"
            ti.find("End").text = narr_ticks
        for tag in ("FilePath", "ActualMediaFilePath"):
            for media in root.iter("Media"):
                el = media.find(tag)
                if el is not None and el.text and "Narracao Attenborough" in el.text:
                    el.text = win_narr

    # Add music Media if missing
    music_media_exists = any(
        (m.find("FilePath") is not None and "Musica Capit" in (m.find("FilePath").text or ""))
        for m in root.iter("Media")
    )

    next_id = max(int(e.get("ObjectID")) for e in root.iter() if e.get("ObjectID", "").isdigit()) + 1

    if not music_media_exists:
        media = ET.Element("Media", {"ObjectID": str(next_id), "ClassID": "7a5c103e-f3ac-4391-b6b4-7cc3d2f9a7ff", "Version": "27"})
        ET.SubElement(media, "AudioStream", {"ObjectRef": str(next_id + 1)})
        ET.SubElement(media, "FilePath").text = win_music
        ET.SubElement(media, "Title").text = "Musica Capitólio IA 2026.mp3"
        ET.SubElement(media, "ActualMediaFilePath").text = win_music
        root.append(media)
        next_id += 2

    # Find audio track 1 (second track) and add music clip via cloning A1 structure
    narr_item = None
    narr_track = None
    for seq in root.iter("Sequence"):
        if seq.find("Name") is None or "Capitólio" not in (seq.find("Name").text or ""):
            continue
        for tg in seq.findall(".//TrackGroup"):
            ref = tg.find("Second")
            grp = by_id.get(ref.get("ObjectRef", ""))
            if grp is None or grp.tag != "AudioTrackGroup":
                continue
            tracks = grp.findall(".//Track")
            if len(tracks) < 2:
                continue
            a1_uid = tracks[1].get("ObjectURef")
            a0_uid = tracks[0].get("ObjectURef")
            narr_track = by_uid.get(a0_uid or "")
            music_track = by_uid.get(a1_uid or "")
            if narr_track is None or music_track is None:
                continue
            for ti_ref in narr_track.findall(".//ClipItems/TrackItems/TrackItem"):
                item = by_id.get(ti_ref.get("ObjectRef", ""))
                if item is not None and item.tag == "AudioClipTrackItem":
                    narr_item = item
                    break
            if narr_item is None:
                continue

            # Remove existing music items on A2
            clip_items = music_track.find(".//ClipItems/TrackItems")
            if clip_items is not None:
                clip_items.clear()

            # Clone narr item tree shallowly - add new track item pointing to new subclip
            # Simpler: duplicate ObjectIDs by deep copy narr audio chain
            import copy as cp

            id_map: dict[str, str] = {}

            def remap(elem: ET.Element) -> ET.Element:
                nonlocal next_id
                e = cp.deepcopy(elem)
                oid = e.get("ObjectID")
                if oid:
                    new_oid = str(next_id)
                    next_id += 1
                    id_map[oid] = new_oid
                    e.set("ObjectID", new_oid)
                ouid = e.get("ObjectUID")
                if ouid:
                    e.set("ObjectUID", ouid + "-music")  # may break; skip uid elems
                for child in e.iter():
                    ref = child.get("ObjectRef")
                    if ref and ref in id_map:
                        child.set("ObjectRef", id_map[ref])
                return e

            # Collect narr audio object subtree via BFS from narr_item
            to_clone = [narr_item]
            sub_ref = narr_item.find(".//SubClip").get("ObjectRef")
            sub = by_id[sub_ref]
            to_clone.append(sub)
            clip_ref = sub.find("Clip").get("ObjectRef")
            to_clone.append(by_id[clip_ref])
            mc_ref = sub.find("MasterClip").get("ObjectURef")
            for mc in root.iter("MasterClip"):
                if mc.get("ObjectUID") == mc_ref:
                    to_clone.append(mc)
                    break
            co_ref = narr_item.find(".//ComponentOwner/Components").get("ObjectRef")
            to_clone.append(by_id[co_ref])

            new_elems = []
            for elem in to_clone:
                ne = remap(elem)
                if ne.tag == "MasterClip" and ne.find("Name") is not None:
                    ne.find("Name").text = "Musica Capitólio IA 2026.mp3"
                if ne.tag == "SubClip" and ne.find("Name") is not None:
                    ne.find("Name").text = "Musica Capitólio IA 2026.mp3"
                new_elems.append(ne)

            new_item_id = id_map[narr_item.get("ObjectID")]
            new_item = next(e for e in new_elems if e.get("ObjectID") == new_item_id)
            ti = new_item.find(".//TrackItem")
            ti.find("Start").text = "0"
            ti.find("End").text = seq_ticks

            for ne in new_elems:
                root.append(ne)

            if clip_items is None:
                ci = music_track.find(".//ClipItems")
                if ci is None:
                    ci = ET.SubElement(music_track.find("ClipTrack") or music_track, "ClipItems")
                    ci.set("Version", "3")
                clip_items = ET.SubElement(ci, "TrackItems")
                clip_items.set("Version", "1")
            node = ET.SubElement(clip_items, "TrackItem")
            node.set("Index", "0")
            node.set("ObjectRef", new_item_id)
            print(f"Added music to audio track 2 ({seq_dur:.1f}s)")

    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(PROJECT, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))
    print(f"Patched: {PROJECT}")


def main() -> None:
    load_env()
    if not Path(wsl_music := str(MUSIC_MP3)).parent.exists():
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    narr_dur = generate_narration()
    generate_music()
    loop_music_to_duration(max(narr_dur, 140.0))

    if PROJECT.is_file():
        patch_prproj(narr_dur, probe_duration(MUSIC_MP3))
    else:
        print(f"Warning: {PROJECT} not found — audio files saved only")


if __name__ == "__main__":
    main()
