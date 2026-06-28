#!/usr/bin/env python3
"""Apply Lumetri Color (McCurry look) to all V1 clips in Capitólio IA 2026.prproj."""

from __future__ import annotations

import copy
import gzip
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio IA 2026.prproj")
REF = Path(
    "/mnt/e/Vídeos/2017/- Postado/- Cachoeira das Irmãs - Araguarí/Cachoeira das Irmãs - Araguarí.prproj"
)
TICKS = 254016000000
SEQUENCE_NAMES = ("Capitólio — Attenborough IA 2026", "Capitólio")

# Lumetri template in reference project
LUMETRI_FILTER_ID = "69"
LUMETRI_PARAM_IDS = [str(i) for i in range(101, 162)]

# McCurry numeric grade — tuned for Capitólio drone (shadow detail + highlight roll-off)
MCCURRY_VALUES: dict[str, float] = {
    "Temperature": 13.0,
    "Tint": 2.0,
    "Exposure": 0.10,
    "Contrast": 26.0,
    "Highlights": -32.0,
    "Shadows": 20.0,
    "Whites": -18.0,
    "Blacks": 7.0,
    "Saturation": 106.0,
    "Faded Film": 11.0,
    "Sharpen": 12.0,
    "Vibrance": 22.0,
}

MCCURRY_BOOLS: dict[str, bool] = {
    "Basic Correction": True,
    "Creative": True,
    "Tone": True,
}


def load_root(path: Path) -> ET.Element:
    with gzip.open(path, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, path: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def max_object_id(root: ET.Element) -> int:
    m = 0
    for e in root.iter():
        oid = e.get("ObjectID")
        if oid and oid.isdigit():
            m = max(m, int(oid))
    return m


def by_id(root: ET.Element) -> dict[str, ET.Element]:
    return {e.get("ObjectID"): e for e in root.iter() if e.get("ObjectID")}


def by_uid(root: ET.Element) -> dict[str, ET.Element]:
    return {e.get("ObjectUID"): e for e in root.iter() if e.get("ObjectUID")}


def nested_start_end(item: ET.Element) -> tuple[int, int]:
    ti = item.find(".//TrackItem")
    return int(ti.find("Start").text), int(ti.find("End").text)


def set_param_value(param: ET.Element, value: float | bool) -> None:
    sk = param.find("StartKeyframe")
    if sk is not None and sk.text:
        parts = sk.text.split(",")
        if len(parts) >= 2:
            if isinstance(value, bool):
                parts[1] = "true" if value else "false"
            else:
                parts[1] = f"{value:g}."
            sk.text = ",".join(parts)


def clone_lumetri_block(ref_map: dict[str, ET.Element], next_id: int) -> tuple[list[ET.Element], str, int]:
    """Clone filter + params; return new elements, new filter id, next free id."""
    id_map: dict[str, str] = {}
    new_elements: list[ET.Element] = []
    template_ids = [LUMETRI_FILTER_ID] + LUMETRI_PARAM_IDS

    for old_id in template_ids:
        src = ref_map.get(old_id)
        if src is None:
            raise SystemExit(f"Missing template ObjectID {old_id} in reference prproj")
        new_id = str(next_id)
        next_id += 1
        id_map[old_id] = new_id
        elem = copy.deepcopy(src)
        elem.set("ObjectID", new_id)
        new_elements.append(elem)

    new_filter_id = id_map[LUMETRI_FILTER_ID]
    filter_elem = next(e for e in new_elements if e.get("ObjectID") == new_filter_id)

    for pref in filter_elem.findall(".//Param"):
        old_ref = pref.get("ObjectRef")
        if old_ref in id_map:
            pref.set("ObjectRef", id_map[old_ref])

    for elem in new_elements:
        if elem.tag.endswith("ComponentParam") or elem.tag == "ArbVideoComponentParam":
            name_el = elem.find("Name")
            name = name_el.text.strip() if name_el is not None and name_el.text else ""
            if name in MCCURRY_VALUES:
                set_param_value(elem, MCCURRY_VALUES[name])
            elif name in MCCURRY_BOOLS:
                set_param_value(elem, MCCURRY_BOOLS[name])

    return new_elements, new_filter_id, next_id


def attach_lumetri_to_chain(chain: ET.Element, filter_id: str) -> None:
    cc = chain.find("ComponentChain")
    if cc is None:
        cc = ET.SubElement(chain, "ComponentChain")
        cc.set("Version", "3")

    comps = cc.find("Components")
    if comps is None:
        comps = ET.SubElement(cc, "Components")
        comps.set("Version", "1")

    # Remove existing Lumetri refs if re-running
    for comp in list(comps.findall("Component")):
        comps.remove(comp)

    comp = ET.SubElement(comps, "Component")
    comp.set("Index", "0")
    comp.set("ObjectRef", filter_id)


def get_v1_track_items(root: ET.Element) -> list[str]:
    ids = by_id(root)
    uids = by_uid(root)
    for seq in root.iter("Sequence"):
        if seq.find("Name") is None or seq.find("Name").text not in SEQUENCE_NAMES:
            continue
        for tg in seq.findall(".//TrackGroup"):
            ref = tg.find("Second")
            if ref is None:
                continue
            grp = ids.get(ref.get("ObjectRef", ""))
            if grp is None or grp.tag != "VideoTrackGroup":
                continue
            for tr in grp.findall(".//Track"):
                if tr.get("Index") != "0":
                    continue
                uid = tr.get("ObjectURef")
                track = uids.get(uid or "")
                if track is None:
                    continue
                out: list[str] = []
                for ti in track.findall(".//ClipItems/TrackItems/TrackItem"):
                    oid = ti.get("ObjectRef")
                    if oid:
                        out.append(oid)
                return out
    return []


def main() -> None:
    if not PROJECT.is_file():
        raise SystemExit(f"Project not found: {PROJECT}")
    if not REF.is_file():
        raise SystemExit(f"Reference prproj not found: {REF}")

    backup = PROJECT.with_suffix(".prproj.pre-color.bak")
    if not backup.exists():
        shutil.copy2(PROJECT, backup)
        print(f"Backup: {backup}")

    target = load_root(PROJECT)
    reference = load_root(REF)
    ref_map = by_id(reference)
    tgt_map = by_id(target)

    track_items = get_v1_track_items(target)
    if not track_items:
        raise SystemExit("No V1 clips found on sequence")

    next_id = max_object_id(target) + 1
    graded = 0

    for item_id in track_items:
        item = tgt_map.get(item_id)
        if item is None or item.tag != "VideoClipTrackItem":
            continue
        co = item.find(".//ComponentOwner/Components")
        if co is None:
            continue
        chain_id = co.get("ObjectRef")
        chain = tgt_map.get(chain_id or "")
        if chain is None:
            continue

        new_elems, filter_id, next_id = clone_lumetri_block(ref_map, next_id)
        for elem in new_elems:
            target.append(elem)
        attach_lumetri_to_chain(chain, filter_id)
        graded += 1

    save_root(target, PROJECT)
    print(f"Applied Lumetri (McCurry) to {graded} clips → {PROJECT}")
    print("Open in Premiere — if prompted, click OK on any version warning.")


if __name__ == "__main__":
    main()
