#!/usr/bin/env python3
"""
Build Adobe Premiere .prproj from a matched Imagine manifest.

Requires a template project that already contains the footage clips imported
(same filenames as in manifest.timeline[].file).

Example:
  python3 scripts/imagine-build-prproj.py \\
    --manifest manifest-matched.json \\
    --template /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Antigos/Capitólio\\ IA\\ 2026.prproj \\
    --output /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Capitólio\\ Imagine.prproj \\
    --win-base "E:\\Vídeos\\2017\\Capitólio Mar de Minas" \\
    --audio /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Audio/Narracao.mp3
"""

from __future__ import annotations

import argparse
import gzip
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from imagine_manifest_lib import load_manifest, sec_to_ticks


@dataclass
class TrackRef:
    track_item_id: str
    subclip_id: str
    videoclip_id: str
    name: str


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return 0.0
    return float(result.stdout.strip())


def load_root(path: Path) -> ET.Element:
    with gzip.open(path, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, path: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def build_maps(root: ET.Element):
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}
    names: dict[str, str] = {}
    vids: dict[str, str] = {}
    for sc in root.iter("SubClip"):
        oid = sc.get("ObjectID")
        if not oid:
            continue
        n = sc.find("Name")
        if n is not None and n.text:
            names[oid] = n.text
        cr = sc.find("Clip")
        if cr is not None and cr.get("ObjectRef"):
            vids[oid] = cr.get("ObjectRef")
    refs: list[TrackRef] = []
    for item in root.iter("VideoClipTrackItem"):
        oid = item.get("ObjectID")
        sub = item.find(".//SubClip")
        if not oid or sub is None:
            continue
        sid = sub.get("ObjectRef", "")
        refs.append(TrackRef(oid, sid, vids.get(sid, ""), names.get(sid, "?")))
    return by_id, by_uid, refs


def find_sequence(root: ET.Element, seq_name: str | None) -> ET.Element:
    if seq_name:
        for seq in root.iter("Sequence"):
            n = seq.find("Name")
            if n is not None and n.text == seq_name:
                return seq
    for seq in root.iter("Sequence"):
        return seq
    raise SystemExit("No sequence found in template .prproj")


def find_video_track(by_id: dict, by_uid: dict, seq: ET.Element) -> ET.Element:
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is not None and grp.tag == "VideoTrackGroup":
            for tr in grp.findall(".//Track"):
                track = by_uid.get(tr.get("ObjectURef", ""))
                if track is not None:
                    return track
    raise SystemExit("Video track not found")


def set_clip_in_out(by_id: dict, videoclip_id: str, in_sec: float, out_sec: float) -> None:
    vc = by_id.get(videoclip_id)
    if vc is None:
        return
    clip = vc.find("Clip")
    if clip is None:
        return
    for tag, val in (("InPoint", in_sec), ("OutPoint", out_sec)):
        node = clip.find(tag) or ET.SubElement(clip, tag)
        node.text = sec_to_ticks(val)


def set_track_item_range(item: ET.Element, start_sec: float, end_sec: float) -> None:
    ti = item.find(".//TrackItem")
    if ti is None:
        return
    for tag, val in (("Start", start_sec), ("End", end_sec)):
        node = ti.find(tag) or ET.SubElement(ti, tag)
        node.text = sec_to_ticks(val)


def relink_media(root: ET.Element, win_base: str, videos_subdir: str, audio_subdir: str) -> None:
    win_v = rf"{win_base}\{videos_subdir}"
    win_a = rf"{win_base}\{audio_subdir}"
    video_markers = (".MP4", ".mp4", ".mov", ".MOV", "DJI_", "inicio (")
    for el in root.iter():
        if el.text is None or not isinstance(el.text, str):
            continue
        t = el.text
        if el.tag in ("FilePath", "ActualMediaFilePath", "MediaFileHistory0", "RelativePath"):
            if any(x in t for x in video_markers):
                fname = Path(t.replace("\\", "/")).name
                if el.tag == "RelativePath":
                    el.text = rf".\{videos_subdir}\{fname}"
                else:
                    el.text = rf"{win_v}\{fname}"
            elif ".mp3" in t.lower() or ".wav" in t.lower():
                fname = Path(t.replace("\\", "/")).name
                if el.tag == "RelativePath":
                    el.text = rf".\{audio_subdir}\{fname}"
                elif el.tag == "Title":
                    el.text = fname
                else:
                    el.text = rf"{win_a}\{fname}"
        if el.tag == "OfflineReason":
            el.text = "0"


def fix_narration(
    root: ET.Element,
    by_id: dict,
    narr_path: Path,
    win_base: str,
    audio_subdir: str,
    narr_dur: float,
    narr_basename: str | None = None,
) -> None:
    basename = narr_basename or narr_path.name
    win_narr = rf"{win_base}\{audio_subdir}\{basename}"
    ticks = sec_to_ticks(narr_dur)

    for media in root.iter("Media"):
        fp = media.find("FilePath")
        if fp is None:
            continue
        text = fp.text or ""
        if ".mp3" not in text.lower() and "Narracao" not in text and "Narration" not in text:
            continue
        for tag in ("FilePath", "ActualMediaFilePath", "Title"):
            el = media.find(tag)
            if el is not None:
                el.text = basename if tag == "Title" else win_narr
        off = media.find("OfflineReason")
        if off is not None:
            off.text = "0"

    for ams in root.iter("AudioMediaSource"):
        od = ams.find("OriginalDuration")
        if od is not None:
            od.text = ticks

    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        sub = by_id.get(sc.get("ObjectRef", "")) if sc is not None else None
        if sub is None:
            continue
        nm = sub.find("Name")
        if nm is None:
            continue
        name = nm.text or ""
        if "Narracao" not in name and "Narration" not in name and ".mp3" not in name.lower():
            continue
        nm.text = basename
        ti = item.find(".//TrackItem")
        if ti is not None:
            (ti.find("Start") or ET.SubElement(ti, "Start")).text = "0"
            (ti.find("End") or ET.SubElement(ti, "End")).text = ticks


def clear_extra_audio(by_id: dict, by_uid: dict, seq: ET.Element) -> None:
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is None or grp.tag != "AudioTrackGroup":
            continue
        for tr in grp.findall(".//Track")[1:]:
            track = by_uid.get(tr.get("ObjectURef", ""))
            if track is None:
                continue
            items = track.find(".//ClipItems/TrackItems")
            if items is not None:
                items.clear()


def apply_timeline_from_manifest(
    root: ET.Element,
    manifest: dict,
    seq_name: str | None,
) -> tuple[float, list[str]]:
    by_id, by_uid, refs = build_maps(root)
    seq = find_sequence(root, seq_name)
    video_track = find_video_track(by_id, by_uid, seq)

    by_name: dict[str, list[TrackRef]] = {}
    for ref in refs:
        by_name.setdefault(ref.name, []).append(ref)

    cuts = manifest.get("timeline") or []
    if not cuts:
        raise SystemExit("Manifest has no timeline[] — run imagine-match-manifest.py first")

    selected: list[str] = []
    missing: list[str] = []
    max_end = 0.0

    for cut in sorted(cuts, key=lambda c: float(c.get("startSec", 0))):
        fname = Path(str(cut.get("file", ""))).name
        ins = float(cut.get("inSec", 0))
        outs = float(cut.get("outSec", ins + 1))
        start = float(cut.get("startSec", 0))
        end = float(cut.get("endSec", start + (outs - ins)))

        pool = by_name.get(fname, [])
        if not pool:
            missing.append(fname)
            continue
        ref = pool.pop(0)
        item = by_id.get(ref.track_item_id)
        if item is None:
            missing.append(fname)
            continue

        set_clip_in_out(by_id, ref.videoclip_id, ins, outs)
        set_track_item_range(item, start, end)
        selected.append(ref.track_item_id)
        max_end = max(max_end, end)

    clip_items = video_track.find(".//ClipItems/TrackItems")
    if clip_items is None:
        raise SystemExit("ClipItems container missing on video track")
    clip_items.clear()
    for i, oid in enumerate(selected):
        node = ET.SubElement(clip_items, "TrackItem")
        node.set("Index", str(i))
        node.set("ObjectRef", oid)

    title = manifest.get("projectTitle") or "Imagine Export"
    seq.find("Name").text = f"{title} — Imagine"
    return max_end, missing


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Premiere .prproj from matched manifest")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--template", required=True, type=Path, help="Template .prproj with footage imported")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--win-base", required=True, help=r'Windows project root, e.g. E:\Videos\Capitolio')
    parser.add_argument("--audio", type=Path, help="Narration MP3 (WSL path). Default: manifest audioFile beside win-base/Audio")
    parser.add_argument("--videos-subdir", default="Videos", help="Subfolder under win-base for video relink")
    parser.add_argument("--audio-subdir", default="Audio", help="Subfolder under win-base for audio relink")
    parser.add_argument("--sequence", help="Template sequence name (default: first sequence)")
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    template = args.template.expanduser().resolve()
    output = args.output.expanduser().resolve()

    if not manifest_path.is_file():
        raise SystemExit(f"Manifest not found: {manifest_path}")
    if not template.is_file():
        raise SystemExit(f"Template not found: {template}")

    manifest = load_manifest(manifest_path)
    audio_name = manifest.get("audioFile") or "Narracao.mp3"
    audio_path = args.audio
    if audio_path is None:
        # Try common WSL mount from win-base
        guess = Path("/mnt/e") / args.win_base.replace("\\", "/").lstrip("E:/").lstrip("E:\\")
        audio_path = guess / args.audio_subdir / audio_name
    audio_path = audio_path.expanduser().resolve()
    narr_dur = manifest.get("totalDurationSec") or 0.0
    if audio_path.is_file():
        narr_dur = probe_duration(audio_path) or narr_dur
    elif narr_dur <= 0:
        narr_dur = 120.0
        print(f"WARN: audio not found at {audio_path}, using {narr_dur}s from manifest")

    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(template, output)
    root = load_root(output)
    relink_media(root, args.win_base, args.videos_subdir, args.audio_subdir)
    timeline_end, missing = apply_timeline_from_manifest(root, manifest, args.sequence)
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    seq = find_sequence(root, args.sequence)
    if audio_path.is_file():
        fix_narration(
            root,
            by_id,
            audio_path,
            args.win_base,
            args.audio_subdir,
            narr_dur,
            audio_name,
        )
    clear_extra_audio(by_id, {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}, seq)
    save_root(root, output)

    print(f"Project:  {output}")
    print(f"Sequence: {(manifest.get('projectTitle') or 'Imagine')} — Imagine")
    print(f"Video end: {timeline_end:.1f}s | Narration: {narr_dur:.1f}s | Clips: {len(manifest.get('timeline', []))}")
    if missing:
        print("Missing in template (import these clips first):")
        for name in sorted(set(missing))[:20]:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
