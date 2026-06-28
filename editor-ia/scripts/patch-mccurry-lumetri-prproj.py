#!/usr/bin/env python3
"""Update Lumetri params on an already-graded Capitólio prproj (no duplicate effects)."""

from __future__ import annotations

import gzip
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Capitólio IA 2026.prproj")
# Refined McCurry — priority: shadow detail + highlight roll-off (drone/water)
MCCURRY_VALUES: dict[str, float] = {
    "Temperature": 22.0,
    "Tint": 5.0,
    "Exposure": 0.05,
    "Contrast": 18.0,
    "Highlights": -28.0,
    "Shadows": 16.0,
    "Whites": -14.0,
    "Blacks": 5.0,
    "Saturation": 96.0,
    "Faded Film": 8.0,
    "Sharpen": 8.0,
    "Vibrance": 14.0,
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


def set_param_value(param: ET.Element, value: float | bool) -> None:
    sk = param.find("StartKeyframe")
    if sk is None or not sk.text:
        return
    parts = sk.text.split(",")
    if len(parts) < 2:
        return
    if isinstance(value, bool):
        parts[1] = "true" if value else "false"
    else:
        parts[1] = f"{value:g}."
    sk.text = ",".join(parts)


def main() -> None:
    if not PROJECT.is_file():
        raise SystemExit(f"Not found: {PROJECT}")

    root = load_root(PROJECT)
    updated = 0
    lumetri_count = sum(
        1
        for e in root.iter("VideoFilterComponent")
        if e.find("MatchName") is not None and "Lumetri" in (e.find("MatchName").text or "")
    )

    for param in root.iter("VideoComponentParam"):
        name_el = param.find("Name")
        if name_el is None or not name_el.text:
            continue
        name = name_el.text.strip()
        if name in MCCURRY_VALUES:
            set_param_value(param, MCCURRY_VALUES[name])
            updated += 1
        elif name in MCCURRY_BOOLS:
            set_param_value(param, MCCURRY_BOOLS[name])
            updated += 1

    if lumetri_count == 0:
        raise SystemExit("No Lumetri found — run apply-mccurry-lumetri-prproj.py first")

    save_root(root, PROJECT)
    print(f"Patched {updated} params across {lumetri_count} Lumetri instances")
    print("Warm earth: Temp +22 | Tint +5 | Contrast +18 | Saturation 96")


if __name__ == "__main__":
    main()
