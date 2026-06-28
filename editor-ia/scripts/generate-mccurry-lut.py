#!/usr/bin/env python3
"""Generate a Steve McCurry / Kodachrome-inspired .cube LUT for Premiere Lumetri."""

from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "color" / "steve-mccurry-capitolio.cube"
SIZE = 33


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 == edge1:
        return 0.0 if x < edge0 else 1.0
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)


def luminance(r: float, g: float, b: float) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def mccurry_transform(r: float, g: float, b: float) -> tuple[float, float, float]:
    """
    Kodachrome-era travel documentary look:
    warm mids, rich reds/oranges, deep natural blues, gentle S-curve,
    subtle teal in deep shadows, amber highlights.
    """
    # Gentle S-curve contrast (film shoulder/toe)
    def curve(c: float) -> float:
        return clamp(math.pow(c, 0.92) * (1.04 - 0.04 * c))

    r, g, b = curve(r), curve(g), curve(b)

    lum = luminance(r, g, b)
    shadow_w = 1.0 - smoothstep(0.08, 0.38, lum)
    highlight_w = smoothstep(0.55, 0.95, lum)
    mid_w = 1.0 - shadow_w - highlight_w

    # Shadow: warm brown earth (no teal — avoids cyan water/canyon cast)
    r += shadow_w * (+0.012)
    g += shadow_w * (+0.004)
    b += shadow_w * (-0.010)

    # Midtones: rich umber / Minas rock and cerrado
    r += mid_w * (+0.055)
    g += mid_w * (+0.032)
    b += mid_w * (-0.018)

    # Highlights: golden amber, soft roll-off
    r += highlight_w * (+0.040)
    g += highlight_w * (+0.026)
    b += highlight_w * (-0.014)

    # Per-channel saturation boost (Kodachrome punch)
    avg = (r + g + b) / 3.0
    sat = 1.08
    r = avg + (r - avg) * sat
    g = avg + (g - avg) * sat
    b = avg + (b - avg) * sat

    # Selective hue emphasis: strengthen orange/red and natural aqua/blue
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    chroma = max_c - min_c
    if chroma > 0.02:
        if r >= g and g >= b:  # orange/red zone
            r *= 1.06
            g *= 1.02
        elif b >= g and g >= r:  # water — restrained, stays natural not neon
            b *= 1.02
            g *= 1.01

    # Soft highlight compression
    peak = max(r, g, b)
    if peak > 0.88:
        roll = (peak - 0.88) * 0.35
        r -= roll
        g -= roll
        b -= roll

    return clamp(r), clamp(g), clamp(b)


def write_cube(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Steve McCurry / Kodachrome-inspired — Capitólio Mar de Minas",
        "# editor-ia — import in Lumetri Color > Basic > Input LUT",
        f"LUT_3D_SIZE {SIZE}",
        "",
    ]
    for bi in range(SIZE):
        b = bi / (SIZE - 1)
        for gi in range(SIZE):
            g = gi / (SIZE - 1)
            for ri in range(SIZE):
                r = ri / (SIZE - 1)
                ro, go, bo = mccurry_transform(r, g, b)
                lines.append(f"{ro:.6f} {go:.6f} {bo:.6f}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {path} ({len(lines)} lines)")


if __name__ == "__main__":
    write_cube(OUT)
