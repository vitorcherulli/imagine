#!/usr/bin/env python3
"""Fix Capitólio V2 prproj: offline media, durations, timeline gaps, music on A2."""

from __future__ import annotations

import copy
import gzip
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = Path("/mnt/e/Vídeos/2017/Capitólio V2 Com IA")
PROJECT = BASE / "Capitólio V2 Com IA.prproj"
AUDIO = BASE / "Audio"
VIDEOS = BASE / "Videos"
WIN = r"E:\Vídeos\2017\Capitólio V2 Com IA"
TICKS = 254016000000
SEQ = "Capitólio V2 — Attenborough IA"

MUSIC_FILE = "Musica Capitólio V2.mp3"
NARR_FILE = "Narracao Attenborough IA 2026.mp3"

CUTS = [
    ("inicio (3).MP4", 3, 7),
    ("DJI_0001.MP4", 1, 9),
    ("DJI_0003.MP4", 8, 17),
    ("DJI_0005.MP4", 15, 25),
    ("DJI_0009.MP4", 6, 15),
    ("DJI_0014.MP4", 0, 6),
    ("DJI_0015.MP4", 5, 14),
    ("DJI_0018.MP4", 42, 52),
    ("DJI_0036.MP4", 11, 20),
    ("DJI_0038.MP4", 8, 17),
    ("DJI_0039.MP4", 36, 47),
    ("DJI_0046.MP4", 0, 11),
    ("DJI_0047.MP4", 73, 86),
    ("DJI_0048.MP4", 0, 9),
    ("DJI_0040.MP4", 8, 14),
    ("inicio (4).MP4", 5, 11),
]


def ticks(sec: float) -> str:
    return str(int(round(sec * TICKS)))


def probe(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def load_root() -> ET.Element:
    with gzip.open(PROJECT, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(PROJECT, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def fix_all_media_paths(root: ET.Element) -> None:
    for m in root.iter("Media"):
        fp = m.find("FilePath")
        if fp is None or not fp.text:
            continue
        name = Path(fp.text.replace("\\", "/")).name
        if name.lower().endswith(".mp4"):
            win = rf"{WIN}\Videos\{name}"
            rel = rf".\Videos\{name}"
        elif name.lower().endswith(".mp3"):
            if "Musica" in name:
                name = MUSIC_FILE
            win = rf"{WIN}\Audio\{name}"
            rel = rf".\Audio\{name}"
        else:
            continue
        fp.text = win
        act = m.find("ActualMediaFilePath")
        if act is not None:
            act.text = win
        rel_el = m.find("RelativePath")
        if rel_el is not None:
            rel_el.text = rel
        title = m.find("Title")
        if title is not None and name.endswith(".mp3"):
            title.text = name
        off = m.find("OfflineReason")
        if off is not None:
            off.text = "0"
        # drop stale cache hashes — Premiere re-scans media
        for tag in ("ModificationState", "ContentAndMetadataState"):
            node = m.find(tag)
            if node is not None:
                m.remove(node)


def fix_narration_duration(root: ET.Element, narr_dur: float) -> None:
    nt = ticks(narr_dur)
    for ams in root.iter("AudioMediaSource"):
        od = ams.find("OriginalDuration")
        if od is not None:
            od.text = nt
    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        if sc is None:
            continue
        for sub in root.iter("SubClip"):
            if sub.get("ObjectID") != sc.get("ObjectRef"):
                continue
            nm = sub.find("Name")
            if nm is None or NARR_FILE not in (nm.text or ""):
                continue
            ti = item.find(".//TrackItem")
            if ti is not None:
                ti.find("Start").text = "0"
                ti.find("End").text = nt
            clip_ref = sub.find("Clip")
            if clip_ref is None:
                continue
            for ac in root.iter("AudioClip"):
                if ac.get("ObjectID") != clip_ref.get("ObjectRef"):
                    continue
                inner = ac.find("Clip")
                if inner is not None:
                    ip, op = inner.find("InPoint"), inner.find("OutPoint")
                    if ip is not None:
                        ip.text = "0"
                    if op is not None:
                        op.text = nt


def rebuild_video_timeline(root: ET.Element) -> float:
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

    seq = next(s for s in root.iter("Sequence") if s.find("Name") is not None and "V2" in s.find("Name").text)
    vtrack = None
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef"))
        if grp is not None and grp.tag == "VideoTrackGroup":
            vtrack = by_uid.get(grp.findall(".//Track")[0].get("ObjectURef"))

    selected: list[str] = []
    t = 0.0
    for name, ins, outs in CUTS:
        pool = refs.get(name, [])
        if not pool:
            print(f"WARN missing clip {name}")
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
    seq.find("Name").text = SEQ
    return t


def next_object_id(root: ET.Element) -> str:
    mx = max(int(e.get("ObjectID")) for e in root.iter() if e.get("ObjectID", "").isdigit())
    return str(mx + 1)


def clone_music_on_a2(root: ET.Element, music_dur: float) -> None:
    """Clone narration audio chain → music on track A2."""
    by_id = {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}
    by_uid = {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}

    # Find A1 narration item
    seq = next(s for s in root.iter("Sequence") if s.find("Name") is not None and "V2" in s.find("Name").text)
    a1_item = None
    a2_track = None
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef"))
        if grp is None or grp.tag != "AudioTrackGroup":
            continue
        tracks = grp.findall(".//Track")
        a1_uid = tracks[0].get("ObjectURef")
        a1_track = by_uid[a1_uid]
        a2_track = by_uid[tracks[1].get("ObjectURef")] if len(tracks) > 1 else None
        for ti_ref in a1_track.findall(".//ClipItems/TrackItems/TrackItem"):
            item = by_id[ti_ref.get("ObjectRef")]
            sub = by_id[item.find(".//SubClip").get("ObjectRef")]
            if NARR_FILE in (sub.find("Name").text or ""):
                a1_item = item
                break

    if a1_item is None or a2_track is None:
        print("WARN could not clone music — add manually")
        return

    id_map: dict[str, str] = {}

    def remap(elem: ET.Element) -> ET.Element:
        e = copy.deepcopy(elem)
        oid = e.get("ObjectID")
        if oid:
            nid = next_object_id(root)
            while nid in id_map.values() or nid in by_id:
                nid = str(int(nid) + 1)
            id_map[oid] = nid
            e.set("ObjectID", nid)
            by_id[nid] = e
        ouid = e.get("ObjectUID")
        if ouid:
            e.set("ObjectUID", str(uuid.uuid4()))
        for child in e.iter():
            ref = child.get("ObjectRef")
            if ref and ref in id_map:
                child.set("ObjectRef", id_map[ref])
            uref = child.get("ObjectURef")
            if uref and uref in uid_map:
                child.set("ObjectURef", uid_map[uref])
        return e

    uid_map: dict[str, str] = {}

    # Collect narration media template
    narr_media = None
    for m in root.iter("Media"):
        fp = m.find("FilePath")
        if fp is not None and NARR_FILE in fp.text:
            narr_media = m
            break

    sub_id = a1_item.find(".//SubClip").get("ObjectRef")
    sub = by_id[sub_id]
    clip_id = sub.find("Clip").get("ObjectRef")
    clip = by_id[clip_id]
    src_id = clip.find("Clip").find("Source").get("ObjectRef")
    src = by_id[src_id]
    mc_uid = sub.find("MasterClip").get("ObjectURef")

    mc = next(m for m in root.iter("MasterClip") if m.get("ObjectUID") == mc_uid)
    co_id = a1_item.find(".//Components").get("ObjectRef")
    co = by_id[co_id]

    # New media from narration media
    if narr_media is not None:
        new_media = copy.deepcopy(narr_media)
        new_uid = str(uuid.uuid4())
        uid_map[narr_media.get("ObjectUID")] = new_uid
        new_media.set("ObjectUID", new_uid)
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
    if new_mc.find("Name") is not None:
        new_mc.find("Name").text = MUSIC_FILE

    new_co = remap(co)
    new_src = remap(src)
    od = new_src.find("OriginalDuration")
    if od is not None:
        od.text = ticks(music_dur)

    new_clip = remap(clip)
    inner = new_clip.find("Clip")
    if inner is not None:
        inner.find("InPoint").text = "0"
        inner.find("OutPoint").text = ticks(music_dur)

    new_sub = remap(sub)
    new_sub.find("Name").text = MUSIC_FILE
    new_sub.find("MasterClip").set("ObjectURef", new_mc.get("ObjectUID"))

    new_item = remap(a1_item)
    ti = new_item.find(".//TrackItem")
    ti.find("Start").text = "0"
    ti.find("End").text = ticks(music_dur)

    for elem in (new_co, new_src, new_clip, new_sub, new_mc, new_item):
        root.append(elem)

    a2_items = a2_track.find(".//ClipItems/TrackItems")
    if a2_items is None:
        ci = a2_track.find(".//ClipItems") or ET.SubElement(
            a2_track.find("ClipTrack") or a2_track, "ClipItems"
        )
        a2_items = ET.SubElement(ci, "TrackItems")
        a2_items.set("Version", "1")
    a2_items.clear()
    node = ET.SubElement(a2_items, "TrackItem")
    node.set("Index", "0")
    node.set("ObjectRef", new_item.get("ObjectID"))
    print(f"Music on A2: {MUSIC_FILE} ({music_dur:.1f}s)")


def write_edl(music_dur: float) -> None:
    """Backup: EDL to import music if XML clone fails in Premiere."""
    docs = BASE / "Docs"
    docs.mkdir(exist_ok=True)
    def tc(sec: float) -> str:
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        f = 0
        return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"

    edl = f"""TITLE: Capitólio V2 Música
001  AX       AA     C        {tc(0)} {tc(music_dur)} {tc(0)} {tc(music_dur)}
* FROM CLIP NAME: {MUSIC_FILE}
"""
    (docs / "importar-musica-A2.edl").write_text(edl, encoding="utf-8")


def main() -> None:
    if not PROJECT.is_file():
        raise SystemExit(f"Missing {PROJECT}")
    if not (AUDIO / MUSIC_FILE).is_file():
        raise SystemExit(f"Missing {AUDIO / MUSIC_FILE}")

    backup = PROJECT.with_suffix(".prproj.pre-fix.bak")
    shutil.copy2(PROJECT, backup)

    narr_dur = probe(AUDIO / NARR_FILE)
    music_dur = probe(AUDIO / MUSIC_FILE)
    target = max(narr_dur, music_dur)

    root = load_root()
    fix_all_media_paths(root)
    fix_narration_duration(root, narr_dur)
    video_dur = rebuild_video_timeline(root)
    clone_music_on_a2(root, target)
    save_root(root)
    write_edl(target)

    print(f"Fixed: {PROJECT}")
    print(f"Video {video_dur:.1f}s | Narr {narr_dur:.1f}s | Music {target:.1f}s on A2")
    print("Close Premiere completely, reopen the project.")


if __name__ == "__main__":
    main()
