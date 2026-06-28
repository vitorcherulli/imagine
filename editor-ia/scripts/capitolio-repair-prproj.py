#!/usr/bin/env python3
"""Repair Capitólio IA 2026.prproj: relink media, fix durations, clean audio tracks."""

from __future__ import annotations

import gzip
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

TICKS = 254016000000
BASE = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas")
PROJECT = BASE / "Capitólio IA 2026.prproj"
ANTIGOS = BASE / "Antigos"
ARQUIVOS = BASE / "Arquivos"
PHANTOM = ARQUIVOS / "Phanton3"
AUDIO = ARQUIVOS / "Audio"
LUT = ARQUIVOS / "LUT"

WIN_BASE = r"E:\Vídeos\2017\Capitólio Mar de Minas"
NARR_WIN = rf"{WIN_BASE}\Arquivos\Audio\Narracao Attenborough IA 2026.mp3"
MUSIC_WIN = rf"{WIN_BASE}\Arquivos\Audio\Musica Capitólio IA 2026.mp3"
NARR_WSL = AUDIO / "Narracao Attenborough IA 2026.mp3"
MUSIC_WSL = AUDIO / "Musica Capitólio IA 2026.mp3"
SEQ_NAME = "Capitólio — Attenborough IA 2026"
VIDEO_END = 140.0


def sec_to_ticks(seconds: float) -> str:
    return str(int(round(seconds * TICKS)))


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


def load_root(path: Path) -> ET.Element:
    with gzip.open(path, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, path: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def restore_media_folders() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    LUT.mkdir(parents=True, exist_ok=True)
    for src, dest in [
        (ANTIGOS / "Audio" / "Narracao Attenborough IA 2026.mp3", NARR_WSL),
        (ANTIGOS / "Audio" / "Musica Capitólio IA 2026.mp3", MUSIC_WSL),
        (ANTIGOS / "LUT" / "steve-mccurry-capitolio.cube", LUT / "steve-mccurry-capitolio.cube"),
    ]:
        if src.is_file() and not dest.exists():
            shutil.copy2(src, dest)
            print(f"Restored: {dest.name}")


def fix_phantom_paths(root: ET.Element) -> None:
    """Ensure drone paths point to Arquivos\\Phanton3 (not Antigos)."""
    win_phantom = rf"{WIN_BASE}\Arquivos\Phanton3"
    for tag in ("FilePath", "ActualMediaFilePath", "RelativePath"):
        for el in root.iter(tag):
            if el.text and "Phanton3" in el.text and "Antigos" in el.text:
                name = Path(el.text.replace("\\", "/")).name
                if tag == "RelativePath":
                    el.text = rf".\Arquivos\Phanton3\{name}"
                else:
                    el.text = rf"{win_phantom}\{name}"


def fix_narration_media(root: ET.Element, narr_dur: float) -> None:
    ticks = sec_to_ticks(narr_dur)
    for media in root.iter("Media"):
        fp = media.find("FilePath")
        if fp is None or "Narracao Attenborough" not in (fp.text or ""):
            continue
        for tag in ("FilePath", "ActualMediaFilePath", "Title"):
            el = media.find(tag)
            if el is not None:
                el.text = (
                    NARR_WIN if tag != "Title" else "Narracao Attenborough IA 2026.mp3"
                )
        off = media.find("OfflineReason")
        if off is not None:
            off.text = "0"

    for ams in root.iter("AudioMediaSource"):
        parent_media = None
        for m in root.iter("Media"):
            for ms in m.iter("MediaSource"):
                pass
        od = ams.find("OriginalDuration")
        if od is not None:
            od.text = ticks

    for name_tag in ("MasterClip", "SubClip", "ClipLoggingInfo"):
        for elem in root.iter(name_tag):
            field = elem.find("Name") or elem.find("ClipName")
            if field is not None and "Narracao Attenborough" in (field.text or ""):
                pass

    for clip in root.iter("AudioClip"):
        inner = clip.find("Clip")
        if inner is None:
            continue
        sub = None
        for sc in root.iter("SubClip"):
            cr = sc.find("Clip")
            if cr is not None and cr.get("ObjectRef") == clip.get("ObjectID"):
                nm = sc.find("Name")
                if nm is not None and "Narracao Attenborough" in (nm.text or ""):
                    sub = sc
                    break
        if sub is None:
            continue
        for pt in ("InPoint", "OutPoint"):
            node = inner.find(pt)
            if node is not None:
                node.text = "0" if pt == "InPoint" else ticks


def clean_audio_tracks(root: ET.Element, by_id: dict, by_uid: dict, narr_dur: float) -> None:
    narr_ticks = sec_to_ticks(narr_dur)
    seq_ticks = sec_to_ticks(max(narr_dur, VIDEO_END))

    for seq in root.iter("Sequence"):
        if seq.find("Name") is None or seq.find("Name").text != SEQ_NAME:
            continue
        for tg in seq.findall(".//TrackGroup"):
            ref = tg.find("Second")
            grp = by_id.get(ref.get("ObjectRef", ""))
            if grp is None or grp.tag != "AudioTrackGroup":
                continue
            tracks = grp.findall(".//Track")
            # A1 — narration only
            if tracks:
                a0 = by_uid.get(tracks[0].get("ObjectURef", ""))
                if a0 is not None:
                    items = a0.find(".//ClipItems/TrackItems")
                    if items is not None:
                        for ti_ref in list(items.findall("TrackItem")):
                            item = by_id.get(ti_ref.get("ObjectRef", ""))
                            if item is None:
                                continue
                            sub = by_id.get(item.find(".//SubClip").get("ObjectRef", ""))
                            nm = sub.find("Name").text if sub is not None else ""
                            if "Narracao Attenborough" not in nm:
                                items.remove(ti_ref)
                            else:
                                ti = item.find(".//TrackItem")
                                ti.find("Start").text = "0"
                                ti.find("End").text = narr_ticks
            # A2+ — clear broken clones (narration duplicated as music)
            for tr in tracks[1:]:
                track = by_uid.get(tr.get("ObjectURef", ""))
                if track is None:
                    continue
                items = track.find(".//ClipItems/TrackItems")
                if items is not None:
                    items.clear()

        # sequence end markers
        for tag in ("Duration", "End"):
            for el in seq.iter(tag):
                if el.text and el.text.replace(".", "").isdigit():
                    if int(float(el.text)) > sec_to_ticks(VIDEO_END * 2):
                        el.text = seq_ticks


def fix_video_track_end(root: ET.Element, by_id: dict, by_uid: dict) -> None:
    for seq in root.iter("Sequence"):
        if seq.find("Name") is None or seq.find("Name").text != SEQ_NAME:
            continue
        for tg in seq.findall(".//TrackGroup"):
            ref = tg.find("Second")
            grp = by_id.get(ref.get("ObjectRef", ""))
            if grp is None or grp.tag != "VideoTrackGroup":
                continue
            tr = grp.findall(".//Track")[0]
            track = by_uid.get(tr.get("ObjectURef", ""))
            if track is None:
                continue
            t = 0.0
            for ti_ref in track.findall(".//ClipItems/TrackItems/TrackItem"):
                item = by_id.get(ti_ref.get("ObjectRef", ""))
                if item is None:
                    continue
                ti = item.find(".//TrackItem")
                start = ti.find("Start")
                end = ti.find("End")
                dur = (int(end.text) - int(start.text)) / TICKS
                start.text = sec_to_ticks(t)
                end.text = sec_to_ticks(t + dur)
                t += dur
            print(f"Video timeline: {t:.1f}s")


def remove_broken_music_clones(root: ET.Element) -> None:
    to_remove = []
    for mc in root.iter("MasterClip"):
        uid = mc.get("ObjectUID") or ""
        name = mc.find("Name")
        if "-music" in uid or (name is not None and name.text == "Musica Capitólio IA 2026.mp3"):
            to_remove.append(mc)
    for elem in to_remove:
        root.remove(elem)


def main() -> None:
    restore_media_folders()
    if not NARR_WSL.is_file():
        raise SystemExit(f"Narration missing — expected {NARR_WSL}")

    narr_dur = probe_duration(NARR_WSL)
    print(f"Narration duration: {narr_dur:.1f}s")

    backup = PROJECT.with_suffix(".prproj.pre-repair.bak")
    if not backup.exists():
        shutil.copy2(PROJECT, backup)
        print(f"Backup: {backup}")

    root = load_root(PROJECT)
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}

    fix_phantom_paths(root)
    fix_narration_media(root, narr_dur)
    clean_audio_tracks(root, by_id, by_uid, narr_dur)
    fix_video_track_end(root, by_id, by_uid)
    remove_broken_music_clones(root)

    # Fix all AudioMediaSource OriginalDuration tied to narration path
    narr_ticks = sec_to_ticks(narr_dur)
    for ams in root.iter("AudioMediaSource"):
        od = ams.find("OriginalDuration")
        if od is not None and int(float(od.text)) > int(narr_ticks) * 1.05:
            od.text = narr_ticks

    save_root(root, PROJECT)
    print(f"Repaired: {PROJECT}")
    print(f"A1 narration {narr_dur:.1f}s | Video {VIDEO_END:.1f}s | A2 cleared (add music manually)")


if __name__ == "__main__":
    main()
