#!/usr/bin/env python3
"""Edit Capitólio IA 2026.prproj: Attenborough narration + documentary cut."""

from __future__ import annotations

import gzip
import shutil
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TICKS = 254016000000
PROJECT = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio IA 2026.prproj")
NARRATION_WIN = (
    r"E:\Vídeos\2017\Capitólio Mar de Minas\Arquivos\Audio"
    r"\Narracao Attenborough IA 2026.mp3"
)
NARRATION_WSL = (
    "/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Arquivos/Audio"
    "/Narracao Attenborough IA 2026.mp3"
)
SEQUENCE_NAMES = ("Capitólio", "Capitólio — Attenborough IA 2026")

# Documentary cut ~141s — synced to Attenborough script beats
CUTS: list[tuple[str, float, float]] = [
    ("inicio (3).MP4", 0, 6),
    ("DJI_0001.MP4", 2, 10),
    ("DJI_0003.MP4", 3, 12),
    ("DJI_0005.MP4", 8, 18),
    ("DJI_0009.MP4", 8, 17),
    ("DJI_0014.MP4", 0, 6),
    ("DJI_0015.MP4", 0, 9),
    ("DJI_0018.MP4", 12, 22),
    ("DJI_0036.MP4", 0, 9),
    ("DJI_0038.MP4", 0, 9),
    ("DJI_0039.MP4", 0, 11),
    ("DJI_0046.MP4", 0, 11),
    ("DJI_0047.MP4", 45, 58),
    ("DJI_0048.MP4", 0, 9),
    ("DJI_0042.MP4", 0, 5),
    ("inicio (4).MP4", 0, 6),
]


@dataclass
class TrackRef:
    track_item_id: str
    subclip_id: str
    videoclip_id: str
    name: str


def sec_to_ticks(seconds: float) -> int:
    return int(round(seconds * TICKS))


def child_text(elem: ET.Element | None, tag: str) -> str | None:
    if elem is None:
        return None
    child = elem.find(tag)
    return child.text if child is not None else None


def load_root(path: Path) -> ET.Element:
    with gzip.open(path, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, path: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def narration_duration_seconds() -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            NARRATION_WSL,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return float(result.stdout.strip())
    return 139.0


def build_maps(root: ET.Element):
    by_id: dict[str, ET.Element] = {}
    by_uid: dict[str, ET.Element] = {}
    for elem in root.iter():
        oid = elem.get("ObjectID")
        ouid = elem.get("ObjectUID")
        if oid:
            by_id[oid] = elem
        if ouid:
            by_uid[ouid] = elem

    clip_name_by_subclip: dict[str, str] = {}
    videoclip_by_subclip: dict[str, str] = {}
    for elem in root.iter("SubClip"):
        oid = elem.get("ObjectID")
        if not oid:
            continue
        name = child_text(elem, "Name")
        if name:
            clip_name_by_subclip[oid] = name
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
        name = clip_name_by_subclip.get(sub_id, "?")
        vc_id = videoclip_by_subclip.get(sub_id, "")
        track_refs.append(TrackRef(oid, sub_id, vc_id, name))

    return by_id, by_uid, track_refs


def find_sequence(root: ET.Element) -> ET.Element | None:
    for seq in root.iter("Sequence"):
        name = child_text(seq, "Name")
        if name in SEQUENCE_NAMES:
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
                if uid and by_uid.get(uid) is not None:
                    return by_uid[uid]
    return None


def set_clip_in_out(by_id: dict, videoclip_id: str, in_sec: float, out_sec: float) -> None:
    vc = by_id.get(videoclip_id)
    if vc is None:
        return
    clip = vc.find("Clip")
    if clip is None:
        return
    in_pt = clip.find("InPoint")
    out_pt = clip.find("OutPoint")
    if in_pt is None:
        in_pt = ET.SubElement(clip, "InPoint")
    if out_pt is None:
        out_pt = ET.SubElement(clip, "OutPoint")
    in_pt.text = str(sec_to_ticks(in_sec))
    out_pt.text = str(sec_to_ticks(out_sec))


def set_track_item_range(item: ET.Element, start_sec: float, end_sec: float) -> None:
    ti = item.find(".//TrackItem")
    if ti is None:
        return
    start = ti.find("Start")
    end = ti.find("End")
    if start is None:
        start = ET.SubElement(ti, "Start")
    if end is None:
        end = ET.SubElement(ti, "End")
    start.text = str(sec_to_ticks(start_sec))
    end.text = str(sec_to_ticks(end_sec))
    cti = item.find("ClipTrackItem")
    if cti is not None:
        for tag in ("HeadTransition", "TailTransition"):
            node = cti.find(tag)
            if node is not None:
                cti.remove(node)


def update_narration(root: ET.Element, by_id: dict[str, ET.Element], narr_dur: float) -> None:
    if not Path(NARRATION_WSL).is_file():
        raise SystemExit(f"Narration not found: {NARRATION_WSL}")

    end_ticks = str(sec_to_ticks(narr_dur))
    old_names = (
        "SET - 360GO - INGLES CAPITOLIO.mp3",
        "Narracao Attenborough IA 2026.mp3",
    )

    for media in root.iter("Media"):
        title = child_text(media, "Title") or ""
        fp = child_text(media, "FilePath") or ""
        if not any(n in title or n in fp for n in old_names):
            continue
        for tag in ("FilePath", "ActualMediaFilePath", "MediaFileHistory0", "Title"):
            elem = media.find(tag)
            if elem is not None:
                elem.text = (
                    NARRATION_WIN if tag != "Title" else "Narracao Attenborough IA 2026.mp3"
                )
        off = media.find("OfflineReason")
        if off is not None:
            off.text = "0"

    for tag, field in (("MasterClip", "Name"), ("ClipLoggingInfo", "ClipName"), ("SubClip", "Name")):
        for elem in root.iter(tag):
            node = elem.find(field)
            if node is not None and node.text in old_names:
                node.text = "Narracao Attenborough IA 2026.mp3"

    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        if sc is None:
            continue
        sub = by_id.get(sc.get("ObjectRef", ""))
        if sub is None:
            continue
        name = child_text(sub, "Name")
        if name not in old_names and name != "Narracao Attenborough IA 2026.mp3":
            continue
        ti = item.find(".//TrackItem")
        if ti is not None:
            s = ti.find("Start")
            e = ti.find("End")
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


def main() -> None:
    if not PROJECT.is_file():
        raise SystemExit(f"Project not found: {PROJECT}")

    backup = PROJECT.with_suffix(".prproj.bak")
    if not backup.exists():
        shutil.copy2(PROJECT, backup)
        print(f"Backup: {backup}")

    narr_dur = narration_duration_seconds()
    root = load_root(PROJECT)
    by_id, by_uid, track_refs = build_maps(root)
    seq = find_sequence(root)
    if seq is None:
        raise SystemExit(f"Sequence not found (expected one of: {SEQUENCE_NAMES})")

    video_track = find_video_track(by_id, by_uid, seq)
    if video_track is None:
        raise SystemExit("Video track not found")

    by_name: dict[str, list[TrackRef]] = {}
    for ref in track_refs:
        by_name.setdefault(ref.name, []).append(ref)

    selected_ids: list[str] = []
    timeline = 0.0
    missing: list[str] = []

    for name, in_sec, out_sec in CUTS:
        pool = by_name.get(name, [])
        if not pool:
            missing.append(name)
            continue
        ref = pool.pop(0)
        duration = out_sec - in_sec
        item = by_id.get(ref.track_item_id)
        if item is None:
            missing.append(name)
            continue
        set_clip_in_out(by_id, ref.videoclip_id, in_sec, out_sec)
        set_track_item_range(item, timeline, timeline + duration)
        selected_ids.append(ref.track_item_id)
        timeline += duration

    if missing:
        print("Warning — clips not on timeline:", ", ".join(missing))

    clip_items = video_track.find(".//ClipItems/TrackItems")
    trans_items = video_track.find(".//TransitionItems/TrackItems")
    if clip_items is None:
        raise SystemExit("ClipItems/TrackItems not found")

    clip_items.clear()
    for i, oid in enumerate(selected_ids):
        node = ET.SubElement(clip_items, "TrackItem")
        node.set("Index", str(i))
        node.set("ObjectRef", oid)

    if trans_items is not None:
        trans_items.clear()

    update_narration(root, by_id, narr_dur)

    name_node = seq.find("Name")
    if name_node is not None:
        name_node.text = "Capitólio — Attenborough IA 2026"

    save_root(root, PROJECT)
    print(f"Edited: {PROJECT}")
    print(f"Timeline: {timeline:.1f}s | narration: {narr_dur:.1f}s | clips: {len(selected_ids)}")


if __name__ == "__main__":
    main()
