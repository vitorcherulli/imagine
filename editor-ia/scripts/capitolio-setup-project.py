#!/usr/bin/env python3
"""Create Capitólio IA 2026.prproj at project root + timeline with best takes."""

from __future__ import annotations

import gzip
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas")
ANTIGOS = BASE / "Antigos"
VIDEOS = BASE / "Videos"
AUDIO = BASE / "Audio"
SOURCE_PRPROJ = ANTIGOS / "Capitólio IA 2026.prproj"
PROJECT = BASE / "Capitólio IA 2026.prproj"
SCORES = ROOT / "data" / "capitolio-take-scores.json"
TICKS = 254016000000

WIN_BASE = r"E:\Vídeos\2017\Capitólio Mar de Minas"
NARR_WIN = rf"{WIN_BASE}\Audio\Narracao Attenborough IA 2026.mp3"
NARR_WSL = AUDIO / "Narracao Attenborough IA 2026.mp3"
SEQ_NAME = "Capitólio — Attenborough IA 2026"

# Best in/out from stability analysis + documentary beats (~142s)
CUTS: list[tuple[str, float, float]] = [
    ("inicio (3).MP4", 3, 7),       # 4s intro
    ("DJI_0001.MP4", 1, 9),         # 8s mar de minas
    ("DJI_0003.MP4", 8, 17),        # 9s
    ("DJI_0005.MP4", 15, 25),       # 10s
    ("DJI_0009.MP4", 6, 15),        # 9s mirante
    ("DJI_0014.MP4", 0, 6),         # 6s trilha
    ("DJI_0015.MP4", 5, 14),        # 9s
    ("DJI_0018.MP4", 42, 52),        # 10s
    ("DJI_0036.MP4", 11, 20),        # 9s cascata
    ("DJI_0038.MP4", 8, 17),        # 9s
    ("DJI_0039.MP4", 36, 47),        # 11s
    ("DJI_0046.MP4", 0, 11),        # 11s
    ("DJI_0047.MP4", 73, 86),        # 13s barco
    ("DJI_0048.MP4", 0, 9),          # 9s
    ("DJI_0040.MP4", 8, 14),         # 6s lagoa (substitui 0042 tremido)
    ("inicio (4).MP4", 5, 11),       # 6s encerramento
]


@dataclass
class TrackRef:
    track_item_id: str
    subclip_id: str
    videoclip_id: str
    name: str


def sec_to_ticks(seconds: float) -> int:
    return int(round(seconds * TICKS))


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def load_root(path: Path) -> ET.Element:
    with gzip.open(path, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, path: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def setup_folders() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    for name in ("Narracao Attenborough IA 2026.mp3", "Musica Capitólio IA 2026.mp3"):
        src = ANTIGOS / "Audio" / name
        dest = AUDIO / name
        if src.is_file() and not dest.exists():
            shutil.copy2(src, dest)
            print(f"Audio: {name}")


def copy_project() -> None:
    if not SOURCE_PRPROJ.is_file():
        raise SystemExit(f"Source project not found: {SOURCE_PRPROJ}")
    shutil.copy2(SOURCE_PRPROJ, PROJECT)
    print(f"Project: {PROJECT}")


def relink_media_paths(root: ET.Element) -> int:
    """Point all media to Videos\\ and Audio\\ at project root."""
    win_videos = rf"{WIN_BASE}\Videos"
    win_audio = rf"{WIN_BASE}\Audio"
    n = 0
    for el in root.iter():
        if el.text is None:
            continue
        t = el.text
        if "Phanton3" in t or "\\Arquivos\\Phanton3" in t:
            fname = Path(t.replace("\\", "/")).name
            if el.tag == "RelativePath":
                el.text = rf".\Videos\{fname}"
            else:
                el.text = rf"{win_videos}\{fname}"
            n += 1
        elif "Arquivos\\Audio" in t or "Arquivos/Audio" in t:
            fname = Path(t.replace("\\", "/")).name
            if el.tag == "RelativePath":
                el.text = rf".\Audio\{fname}"
            elif el.tag in ("FilePath", "ActualMediaFilePath", "MediaFileHistory0"):
                el.text = rf"{win_audio}\{fname}"
            elif el.tag == "Title" and fname.endswith(".mp3"):
                el.text = fname
            n += 1
        elif el.tag in ("OfflineReason",) and t not in ("0", "none"):
            el.text = "0"
    return n


def build_maps(root: ET.Element):
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}
    clip_name_by_subclip: dict[str, str] = {}
    videoclip_by_subclip: dict[str, str] = {}
    for elem in root.iter("SubClip"):
        oid = elem.get("ObjectID")
        if not oid:
            continue
        name_el = elem.find("Name")
        if name_el is not None and name_el.text:
            clip_name_by_subclip[oid] = name_el.text
        clip_ref = elem.find("Clip")
        if clip_ref is not None and clip_ref.get("ObjectRef"):
            videoclip_by_subclip[oid] = clip_ref.get("ObjectRef")

    track_refs: list[TrackRef] = []
    for item in root.iter("VideoClipTrackItem"):
        oid = item.get("ObjectID")
        if not oid:
            continue
        sub = item.find(".//SubClip")
        if sub is None:
            continue
        sub_id = sub.get("ObjectRef")
        if not sub_id:
            continue
        track_refs.append(TrackRef(
            oid, sub_id,
            videoclip_by_subclip.get(sub_id, ""),
            clip_name_by_subclip.get(sub_id, "?"),
        ))
    return by_id, by_uid, track_refs


def find_sequence(root: ET.Element) -> ET.Element | None:
    for seq in root.iter("Sequence"):
        name = seq.find("Name")
        if name is not None and name.text in (SEQ_NAME, "Capitólio"):
            return seq
    return None


def find_video_track(by_id: dict, by_uid: dict, seq: ET.Element) -> ET.Element | None:
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        if ref is None:
            continue
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is not None and grp.tag == "VideoTrackGroup":
            for tr in grp.findall(".//Track"):
                uid = tr.get("ObjectURef")
                if uid and by_uid.get(uid):
                    return by_uid[uid]
    return None


def set_clip_in_out(by_id: dict, videoclip_id: str, in_sec: float, out_sec: float) -> None:
    vc = by_id.get(videoclip_id)
    if vc is None:
        return
    clip = vc.find("Clip")
    if clip is None:
        return
    for tag, val in (("InPoint", in_sec), ("OutPoint", out_sec)):
        node = clip.find(tag)
        if node is None:
            node = ET.SubElement(clip, tag)
        node.text = str(sec_to_ticks(val))


def set_track_item_range(item: ET.Element, start_sec: float, end_sec: float) -> None:
    ti = item.find(".//TrackItem")
    if ti is None:
        return
    for tag, val in (("Start", start_sec), ("End", end_sec)):
        node = ti.find(tag)
        if node is None:
            node = ET.SubElement(ti, tag)
        node.text = str(sec_to_ticks(val))
    cti = item.find("ClipTrackItem")
    if cti is not None:
        for tag in ("HeadTransition", "TailTransition"):
            node = cti.find(tag)
            if node is not None:
                cti.remove(node)


def fix_narration(root: ET.Element, by_id: dict, narr_dur: float) -> None:
    ticks = str(sec_to_ticks(narr_dur))
    tick_i = int(ticks)
    old = ("SET - 360GO - INGLES CAPITOLIO.mp3", "Narracao Attenborough IA 2026.mp3")

    for media in root.iter("Media"):
        fp = media.find("FilePath")
        title = media.find("Title")
        if fp is None:
            continue
        if not any(x in (fp.text or "") or x in (title.text or "") for x in old):
            continue
        for tag in ("FilePath", "ActualMediaFilePath", "Title"):
            el = media.find(tag)
            if el is not None:
                el.text = NARR_WIN if tag != "Title" else "Narracao Attenborough IA 2026.mp3"
        off = media.find("OfflineReason")
        if off is not None:
            off.text = "0"

    for tag, field in (("MasterClip", "Name"), ("SubClip", "Name"), ("ClipLoggingInfo", "ClipName")):
        for elem in root.iter(tag):
            node = elem.find(field)
            if node is not None and node.text in old:
                node.text = "Narracao Attenborough IA 2026.mp3"

    for ams in root.iter("AudioMediaSource"):
        od = ams.find("OriginalDuration")
        if od is not None and int(float(od.text)) > tick_i:
            od.text = ticks

    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        if sc is None:
            continue
        sub = by_id.get(sc.get("ObjectRef", ""))
        if sub is None:
            continue
        nm = sub.find("Name")
        if nm is None or "Narracao Attenborough" not in (nm.text or ""):
            continue
        ti = item.find(".//TrackItem")
        if ti is not None:
            s, e = ti.find("Start"), ti.find("End")
            if s is not None:
                s.text = "0"
            if e is not None:
                e.text = ticks


def clear_extra_audio(by_id: dict, by_uid: dict, seq: ET.Element) -> None:
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is None or grp.tag != "AudioTrackGroup":
            continue
        tracks = grp.findall(".//Track")
        for tr in tracks[1:]:
            track = by_uid.get(tr.get("ObjectURef", ""))
            if track is None:
                continue
            items = track.find(".//ClipItems/TrackItems")
            if items is not None:
                items.clear()


def apply_timeline(root: ET.Element) -> float:
    by_id, by_uid, track_refs = build_maps(root)
    seq = find_sequence(root)
    if seq is None:
        raise SystemExit("Sequence not found")

    video_track = find_video_track(by_id, by_uid, seq)
    if video_track is None:
        raise SystemExit("Video track not found")

    by_name: dict[str, list[TrackRef]] = {}
    for ref in track_refs:
        by_name.setdefault(ref.name, []).append(ref)

    selected: list[str] = []
    timeline = 0.0
    missing: list[str] = []

    for name, in_sec, out_sec in CUTS:
        pool = by_name.get(name, [])
        if not pool:
            missing.append(name)
            continue
        ref = pool.pop(0)
        dur = out_sec - in_sec
        item = by_id.get(ref.track_item_id)
        if item is None:
            missing.append(name)
            continue
        set_clip_in_out(by_id, ref.videoclip_id, in_sec, out_sec)
        set_track_item_range(item, timeline, timeline + dur)
        selected.append(ref.track_item_id)
        timeline += dur

    if missing:
        print("WARNING missing clips:", ", ".join(missing))

    clip_items = video_track.find(".//ClipItems/TrackItems")
    trans = video_track.find(".//TransitionItems/TrackItems")
    if clip_items is None:
        raise SystemExit("ClipItems not found")
    clip_items.clear()
    for i, oid in enumerate(selected):
        node = ET.SubElement(clip_items, "TrackItem")
        node.set("Index", str(i))
        node.set("ObjectRef", oid)
    if trans is not None:
        trans.clear()

    seq.find("Name").text = SEQ_NAME
    return timeline


def main() -> None:
    setup_folders()
    if not list(VIDEOS.glob("*.MP4")):
        raise SystemExit(f"No videos in {VIDEOS}")

    copy_project()
    narr_dur = probe_duration(NARR_WSL) if NARR_WSL.is_file() else 160.0

    root = load_root(PROJECT)
    n = relink_media_paths(root)
    print(f"Relinked {n} path entries → Videos\\ + Audio\\")

    timeline = apply_timeline(root)
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}
    seq = find_sequence(root)
    fix_narration(root, by_id, narr_dur)
    clear_extra_audio(by_id, by_uid, seq)

    save_root(root, PROJECT)
    print(f"Timeline: {timeline:.1f}s | Narration: {narr_dur:.1f}s | Clips: {len(CUTS)}")
    print(f"Open: {WIN_BASE}\\Capitólio IA 2026.prproj")


if __name__ == "__main__":
    main()
