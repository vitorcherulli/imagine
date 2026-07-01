#!/usr/bin/env python3
"""Capitólio V2 — Watchtower of Turkey style edit (Dalessandri)."""

from __future__ import annotations

import base64
import copy
import gzip
import json
import os
import shutil
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGINE_ENV = ROOT.parent / ".env.local"
BASE = Path("/mnt/e/Vídeos/2017/Capitólio V2 Com IA")
PROJECT = BASE / "Capitólio V2 Com IA.prproj"
AUDIO = BASE / "Audio"
DOCS = BASE / "Docs"
TICKS = 254016000000
WIN = r"E:\Vídeos\2017\Capitólio V2 Com IA"
SEQ_NAME = "Capitólio V2 — Watchtower Minas"
TEMPLATE = Path(
    "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Antigos/Capitólio IA 2026.prproj"
)
TARGET_DUR = 200.0  # ~3:20 like Turkey

MUSIC_PROMPT = (
    "Cinematic travel film score in the style of Ludovico Einaudi Experience. "
    "Solo piano opening, building to emotional orchestral strings, awe and wonder, "
    "no vocals, no drums, 200 seconds arc with gentle climax at 2 minutes, "
    "perfect for fast rhythmic video editing about Brazilian canyons and lakes."
)

MUSIC_FILE = "Musica Watchtower Capitólio V2.mp3"

# Uses only clips present in full template bin (52 files) — unique per timeline slot
WATCHTOWER_CUTS: list[tuple[str, float, float, str]] = [
    ("inicio (3).MP4", 3, 7, "intro"),
    ("inicio (2).MP4", 0, 5, "intro 2"),
    ("DJI_0005.MP4", 15, 20, "wide gold"),
    ("DJI_0003.MP4", 8, 13, "water"),
    ("DJI_0001.MP4", 1, 6, "forward"),
    ("DJI_0002.MP4", 8, 11, "glide"),
    ("DJI_0009.MP4", 6, 11, "mirante"),
    ("DJI_0012.MP4", 4, 7, "stable"),
    ("DJI_0014.MP4", 0, 5, "trail"),
    ("DJI_0015.MP4", 5, 10, "fall"),
    ("DJI_0018.MP4", 42, 47, "climb"),
    ("DJI_0021.MP4", 0, 5, "path"),
    ("DJI_0029.MP4", 10, 15, "flow"),
    ("DJI_0036.MP4", 11, 16, "cascata"),
    ("DJI_0038.MP4", 8, 13, "canyon"),
    ("DJI_0039.MP4", 36, 41, "turquoise"),
    ("DJI_0040.MP4", 8, 13, "glow"),
    ("DJI_0046.MP4", 0, 5, "falls"),
    ("DJI_0047.MP4", 73, 88, "boat climax"),
    ("DJI_0048.MP4", 0, 5, "valley"),
    ("DJI_0008.MP4", 19, 24, "layer"),
    ("DJI_0010.MP4", 0, 4, "beat"),
    ("DJI_0016.MP4", 19, 24, "depth"),
    ("DJI_0020.MP4", 14, 19, "view"),
    ("DJI_0024.MP4", 14, 19, "transition"),
    ("DJI_0034.MP4", 2, 7, "pulse"),
    ("DJI_0041.MP4", 4, 9, "detail"),
    ("DJI_0043.MP4", 0, 5, "rhythm"),
    ("DJI_0011.MP4", 30, 35, "wide"),
    ("DJI_0023.MP4", 0, 6, "establish"),
    ("DJI_0037.MP4", 3, 7, "side"),
    ("inicio (4).MP4", 5, 10, "outro"),
    ("DJI_0006.MP4", 12, 18, "final drift"),
]


def load_env() -> None:
    for f in (ROOT / ".env", IMAGINE_ENV):
        if not f.is_file():
            continue
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def api_key() -> str:
    k = os.environ.get("OPENROUTER_API_KEY")
    if not k:
        raise SystemExit("OPENROUTER_API_KEY missing")
    return k


def ticks(sec: float) -> str:
    return str(int(round(sec * TICKS)))


def probe(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def generate_music() -> float:
    load_env()
    out = AUDIO / MUSIC_FILE
    body = json.dumps({
        "model": "google/lyria-3-pro-preview",
        "messages": [{"role": "user", "content": MUSIC_PROMPT}],
        "modalities": ["text", "audio"],
        "audio": {"format": "wav"},
        "stream": True,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json",
                 "Accept": "text/event-stream"},
        method="POST",
    )
    chunks: list[str] = []
    with urllib.request.urlopen(req, timeout=300) as res:
        buf = ""
        while True:
            c = res.read(8192)
            if not c:
                break
            buf += c.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                if not line.startswith("data:"):
                    continue
                p = line[5:].strip()
                if p == "[DONE]":
                    continue
                try:
                    d = json.loads(p)
                except json.JSONDecodeError:
                    continue
                for ch in d.get("choices", []):
                    a = ch.get("delta", {}).get("audio") or ch.get("message", {}).get("audio")
                    if a and a.get("data"):
                        chunks.append(a["data"])
    if not chunks:
        fb = AUDIO / "Musica Capitólio V2.mp3"
        if fb.is_file():
            shutil.copy2(fb, out)
            print("Music fallback")
        else:
            raise SystemExit("No music generated")
    else:
        wav = AUDIO / "Musica Watchtower Capitólio V2.wav"
        wav.write_bytes(base64.b64decode("".join(chunks)))
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(out)],
            check=True, capture_output=True,
        )
    dur = probe(out)
    if dur < TARGET_DUR - 2:
        tmp = AUDIO / "_wt_loop.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-stream_loop", "2", "-i", str(out), "-t", str(TARGET_DUR),
             "-c:a", "libmp3lame", "-b:a", "192k", str(tmp)],
            check=True, capture_output=True,
        )
        tmp.replace(out)
        dur = probe(out)
    print(f"Music: {out} ({dur:.1f}s)")
    return dur


def load_root() -> ET.Element:
    with gzip.open(PROJECT, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(PROJECT, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def fix_media_paths(root: ET.Element) -> None:
    for el in root.iter():
        if el.text is None or not isinstance(el.text, str):
            continue
        if el.tag in ("FilePath", "ActualMediaFilePath", "MediaFileHistory0", "RelativePath"):
            t = el.text
            if any(x in t for x in (".MP4", ".mp4", "Phanton3", "DJI_", "inicio (")):
                fname = Path(t.replace("\\", "/")).name
                win = rf"{WIN}\Videos\{fname}"
                el.text = rf".\Videos\{fname}" if el.tag == "RelativePath" else win
            elif ".mp3" in t.lower():
                fname = Path(t.replace("\\", "/")).name
                if "Musica" in fname and "Watchtower" not in fname:
                    fname = MUSIC_FILE
                el.text = (
                    rf".\Audio\{fname}" if el.tag == "RelativePath"
                    else rf"{WIN}\Audio\{fname}"
                )
        if el.tag == "OfflineReason":
            el.text = "0"


def apply_video_timeline(root: ET.Element) -> float:
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}

    refs: dict[str, list[tuple[str, str]]] = {}
    for item in root.iter("VideoClipTrackItem"):
        oid = item.get("ObjectID")
        sub = item.find(".//SubClip")
        if not oid or sub is None:
            continue
        sid = sub.get("ObjectRef")
        sub_el = by_id.get(sid)
        if sub_el is None:
            continue
        name = sub_el.find("Name").text
        cr = sub_el.find("Clip").get("ObjectRef")
        refs.setdefault(name, []).append((oid, cr))

    seq = next(s for s in root.iter("Sequence") if s.find("Name") is not None)
    vtrack = None
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef"))
        if grp is not None and grp.tag == "VideoTrackGroup":
            vtrack = by_uid.get(grp.findall(".//Track")[0].get("ObjectURef"))

    selected: list[str] = []
    t = 0.0
    used_oid: dict[str, list[tuple[str, str]]] = {k: list(v) for k, v in refs.items()}

    for name, ins, outs, _ in WATCHTOWER_CUTS:
        pool = used_oid.get(name, [])
        if not pool:
            print(f"WARN {name}")
            continue
        oid, cr = pool.pop(0)
        item = by_id[oid]
        dur = outs - ins
        vc = by_id.get(cr)
        if vc is not None:
            clip = vc.find("Clip")
            if clip is not None:
                clip.find("InPoint").text = ticks(ins)
                clip.find("OutPoint").text = ticks(outs)
        ti = item.find(".//TrackItem")
        ti.find("Start").text = ticks(t)
        ti.find("End").text = ticks(t + dur)
        selected.append(oid)
        t += dur

    items = vtrack.find(".//ClipItems/TrackItems")
    items.clear()
    for i, oid in enumerate(selected):
        n = ET.SubElement(items, "TrackItem")
        n.set("Index", str(i))
        n.set("ObjectRef", oid)
    seq.find("Name").text = SEQ_NAME
    return t


def setup_audio_music_only(root: ET.Element, music_dur: float) -> None:
    """A1 = Watchtower music only; remove narration from timeline."""
    import uuid

    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}
    seq = next(s for s in root.iter("Sequence") if s.find("Name") is not None)
    mt = ticks(music_dur)

    narr_item = None
    a1_track = None
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is None or grp.tag != "AudioTrackGroup":
            continue
        tracks = grp.findall(".//Track")
        a1_track = by_uid.get(tracks[0].get("ObjectURef", ""))
        for ti_ref in a1_track.findall(".//ClipItems/TrackItems/TrackItem"):
            item = by_id.get(ti_ref.get("ObjectRef", ""))
            sub = by_id.get(item.find(".//SubClip").get("ObjectRef", ""))
            if sub and "Narracao" in (sub.find("Name").text or ""):
                narr_item = item
                break
        for tr in tracks:
            track = by_uid.get(tr.get("ObjectURef", ""))
            cont = track.find(".//ClipItems/TrackItems")
            if cont is not None:
                cont.clear()

    if narr_item is None or a1_track is None:
        print("WARN could not set music on A1")
        return

    id_map: dict[str, str] = {}

    def next_id() -> str:
        mx = max(int(e.get("ObjectID")) for e in root.iter() if e.get("ObjectID", "").isdigit())
        return str(mx + len(id_map) + 1)

    def remap(elem: ET.Element) -> ET.Element:
        e = copy.deepcopy(elem)
        oid = e.get("ObjectID")
        if oid:
            nid = next_id()
            id_map[oid] = nid
            e.set("ObjectID", nid)
        ouid = e.get("ObjectUID")
        if ouid:
            e.set("ObjectUID", str(uuid.uuid4()))
        for ch in e.iter():
            r = ch.get("ObjectRef")
            if r and r in id_map:
                ch.set("ObjectRef", id_map[r])
        return e

    sub = by_id[narr_item.find(".//SubClip").get("ObjectRef")]
    clip = by_id[sub.find("Clip").get("ObjectRef")]
    src = by_id[clip.find("Clip").find("Source").get("ObjectRef")]
    mc = next(m for m in root.iter("MasterClip") if m.get("ObjectUID") == sub.find("MasterClip").get("ObjectURef"))

    narr_media = next(
        m for m in root.iter("Media")
        if m.find("FilePath") is not None and "Narracao" in m.find("FilePath").text
    )
    new_media = copy.deepcopy(narr_media)
    new_media.set("ObjectUID", str(uuid.uuid4()))
    for tag in ("FilePath", "ActualMediaFilePath"):
        el = new_media.find(tag)
        if el is not None:
            el.text = rf"{WIN}\Audio\{MUSIC_FILE}"
    rel = new_media.find("RelativePath")
    if rel is not None:
        rel.text = rf".\Audio\{MUSIC_FILE}"
    title = new_media.find("Title")
    if title is not None:
        title.text = MUSIC_FILE
    for tag in ("ModificationState", "ContentAndMetadataState"):
        node = new_media.find(tag)
        if node is not None:
            new_media.remove(node)
    root.append(new_media)

    new_mc = remap(mc)
    new_mc.find("Name").text = MUSIC_FILE
    new_src = remap(src)
    od = new_src.find("OriginalDuration")
    if od is not None:
        od.text = mt
    new_clip = remap(clip)
    inner = new_clip.find("Clip")
    inner.find("InPoint").text = "0"
    inner.find("OutPoint").text = mt
    new_sub = remap(sub)
    new_sub.find("Name").text = MUSIC_FILE
    new_sub.find("MasterClip").set("ObjectURef", new_mc.get("ObjectUID"))
    new_item = remap(narr_item)
    ti = new_item.find(".//TrackItem")
    ti.find("Start").text = "0"
    ti.find("End").text = mt

    for e in (new_mc, new_src, new_clip, new_sub, new_item):
        root.append(e)

    cont = a1_track.find(".//ClipItems/TrackItems")
    if cont is None:
        ci = a1_track.find(".//ClipItems") or ET.SubElement(
            a1_track.find("ClipTrack") or a1_track, "ClipItems"
        )
        cont = ET.SubElement(ci, "TrackItems")
    node = ET.SubElement(cont, "TrackItem")
    node.set("Index", "0")
    node.set("ObjectRef", new_item.get("ObjectID"))
    print(f"A1 music only: {MUSIC_FILE} ({music_dur:.1f}s)")


def write_docs(video_dur: float, music_dur: float, n_cuts: int) -> None:
    DOCS.mkdir(exist_ok=True)
    lines = [
        "# Capitólio V2 — Watchtower Minas (estilo Dalessandri)",
        "",
        f"**{n_cuts} cortes** | Vídeo **{video_dur:.1f}s** | Música **{music_dur:.1f}s**",
        "",
        "Estilo: [Watchtower of Turkey](https://www.youtube.com/watch?v=z7yqtW4Isec) — música guia, fluxo contínuo.",
        "",
        "| TC | Arquivo | Trecho | Nota |",
        "|----|---------|--------|------|",
    ]
    t = 0.0
    for name, ins, outs, beat in WATCHTOWER_CUTS:
        dur = outs - ins
        tc = f"{int(t//60)}:{int(t%60):02d}"
        lines.append(f"| {tc} | {name} | {ins:.0f}–{outs:.0f}s | {beat} |")
        t += dur
    (DOCS / "TIMELINE-WATCHTOWER.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    if not TEMPLATE.is_file():
        raise SystemExit(f"Template missing: {TEMPLATE}")
    backup = PROJECT.with_suffix(".prproj.pre-watchtower.bak")
    shutil.copy2(TEMPLATE, PROJECT)
    print(f"Template → {PROJECT}")

    music_dur = generate_music()
    root = load_root()
    fix_media_paths(root)
    video_dur = apply_video_timeline(root)
    setup_audio_music_only(root, max(music_dur, video_dur))
    save_root(root)
    write_docs(video_dur, music_dur, len(WATCHTOWER_CUTS))

    print(f"Sequence: {SEQ_NAME}")
    print(f"Video {video_dur:.1f}s | {len(WATCHTOWER_CUTS)} cuts | Music on A1")
    print(f"Prompt: editor-ia/roteiros/PROMPT-watchtower-dalessandri.md")
    print("Close Premiere, reopen project.")


if __name__ == "__main__":
    main()
