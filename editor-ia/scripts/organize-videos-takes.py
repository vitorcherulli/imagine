#!/usr/bin/env python3
"""
Organize Capitólio Videos/ by take type + rank stability (best takes).

Creates hard links in subfolders — originals stay in Videos/ root (Premiere-safe).
Outputs LEIA-ME.txt, relatorio-takes.csv, MELHORES-TAKES.md
"""

from __future__ import annotations

import csv
import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

try:
    import numpy as np
except ImportError:
    raise SystemExit("numpy required: pip install numpy")

VIDEO_DIR = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Videos")
ORG = VIDEO_DIR / "_PorTipo"
DATA = Path(__file__).resolve().parent.parent / "data"

# Used in Capitólio IA 2026 Attenborough timeline
IN_EDIT = {
    "inicio (3).MP4", "inicio (4).MP4",
    "DJI_0001.MP4", "DJI_0003.MP4", "DJI_0005.MP4", "DJI_0009.MP4",
    "DJI_0014.MP4", "DJI_0015.MP4", "DJI_0018.MP4",
    "DJI_0036.MP4", "DJI_0038.MP4", "DJI_0039.MP4", "DJI_0046.MP4",
    "DJI_0047.MP4", "DJI_0048.MP4", "DJI_0042.MP4",
}

CATEGORIES: dict[str, tuple[str, list[str]]] = {
    "01-intro-vinheta": (
        "Abertura e vinhetas",
        ["inicio (1).MP4", "inicio (2).MP4", "inicio (3).MP4", "inicio (4).MP4",
         "inicio (5).MP4", "inicio (6).MP4"],
    ),
    "02-estabelecimento-mar-de-minas": (
        "Vista aérea do reservatório / Mar de Minas",
        ["DJI_0001.MP4", "DJI_0002.MP4", "DJI_0003.MP4", "DJI_0004.MP4",
         "DJI_0005.MP4", "DJI_0006.MP4", "DJI_0007.MP4", "DJI_0008.MP4"],
    ),
    "03-mirante-furnas": (
        "Mirante dos Cânions de Furnas",
        ["DJI_0009.MP4", "DJI_0010.MP4", "DJI_0011.MP4", "DJI_0012.MP4", "DJI_0013.MP4"],
    ),
    "04-diquadinha-trilha": (
        "Trilha e Cachoeira Diquadinha",
        ["DJI_0014.MP4", "DJI_0015.MP4", "DJI_0016.MP4", "DJI_0017.MP4", "DJI_0018.MP4",
         "DJI_0019.MP4", "DJI_0020.MP4", "DJI_0021.MP4", "DJI_0022.MP4"],
    ),
    "05-reservatorio-transicao": (
        "Planos gerais / transição",
        ["DJI_0023.MP4", "DJI_0024.MP4", "DJI_0025.MP4", "DJI_0026.MP4", "DJI_0027.MP4",
         "DJI_0028.MP4", "DJI_0029.MP4", "DJI_0030.MP4", "DJI_0033.MP4", "DJI_0034.MP4",
         "DJI_0035.MP4"],
    ),
    "06-cascata-eco-parque": (
        "Cascata Eco Parque — cânions e piscinas",
        ["DJI_0036.MP4", "DJI_0037.MP4", "DJI_0038.MP4", "DJI_0039.MP4", "DJI_0040.MP4",
         "DJI_0041.MP4", "DJI_0042.MP4", "DJI_0043.MP4", "DJI_0044.MP4", "DJI_0045.MP4",
         "DJI_0046.MP4"],
    ),
    "07-barco-canyon-lagoa-azul": (
        "Barco, canyon, Lagoa Azul",
        ["DJI_0047.MP4", "DJI_0048.MP4"],
    ),
}

SCALE_W, SCALE_H, FPS = 160, 90, 4


@dataclass
class TakeScore:
    name: str
    category: str
    category_label: str
    duration: float
    shake_mean: float
    shake_peak: float
    score: float  # lower = smoother
    in_edit: bool
    rank: str = ""
    best_window: str = ""


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def motion_per_second(path: Path) -> list[float]:
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vf", f"fps={FPS},scale={SCALE_W}:{SCALE_H},format=gray",
        "-f", "rawvideo", "pipe:1",
    ]
    raw = subprocess.run(cmd, capture_output=True).stdout
    frame_bytes = SCALE_W * SCALE_H
    n = len(raw) // frame_bytes
    if n < 2:
        return []
    arr = np.frombuffer(raw[: n * frame_bytes], dtype=np.uint8).reshape(n, SCALE_H, SCALE_W)
    diffs = np.abs(arr[1:].astype(np.int16) - arr[:-1].astype(np.int16)).mean(axis=(1, 2))
    per_sec: list[float] = []
    for i in range(0, len(diffs), FPS):
        chunk = diffs[i : i + FPS]
        if len(chunk):
            per_sec.append(float(chunk.mean()))
    return per_sec


def best_stable_window(per_sec: list[float], window_sec: int = 8) -> tuple[int, int, float]:
    if len(per_sec) < window_sec:
        return 0, len(per_sec), float(np.mean(per_sec)) if per_sec else 999.0
    best = (999.0, 0)
    for s in range(len(per_sec) - window_sec + 1):
        w = per_sec[s : s + window_sec]
        val = float(np.mean(w)) + 0.6 * float(np.max(w))
        if val < best[0]:
            best = (val, s)
    s = best[1]
    return s, s + window_sec, best[0]


def analyze_take(path: Path, category: str, label: str) -> TakeScore:
    dur = probe_duration(path)
    per_sec = motion_per_second(path)
    if not per_sec:
        return TakeScore(path.name, category, label, dur, 999, 999, 999, path.name in IN_EDIT)

    mean = float(np.mean(per_sec))
    peak = float(np.percentile(per_sec, 92))
    # Combined score: smooth + slight bonus for usable length
    score = mean + 0.5 * peak - min(dur, 30) * 0.002

    ws, we, _ = best_stable_window(per_sec, min(10, max(3, int(dur // 3))))
    window = f"{ws}s–{we}s" if dur > 3 else f"0–{int(dur)}s"

    return TakeScore(
        name=path.name,
        category=category,
        category_label=label,
        duration=round(dur, 1),
        shake_mean=round(mean, 3),
        shake_peak=round(peak, 3),
        score=round(score, 3),
        in_edit=path.name in IN_EDIT,
        best_window=window,
    )


def rank_label(rank: int, in_edit: bool) -> str:
    if in_edit:
        return "EDIT"
    if rank == 1:
        return "A+"
    if rank == 2:
        return "A"
    if rank == 3:
        return "B"
    return "C"


def hardlink(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    try:
        os.link(src, dest)
    except OSError:
        import shutil
        shutil.copy2(src, dest)


def main() -> None:
    if not VIDEO_DIR.is_dir():
        raise SystemExit(f"Not found: {VIDEO_DIR}")

    all_scores: list[TakeScore] = []
    by_cat: dict[str, list[TakeScore]] = {}

    for folder, (label, files) in CATEGORIES.items():
        for name in files:
            src = VIDEO_DIR / name
            if not src.is_file():
                print(f"Missing: {name}")
                continue
            print(f"Analyzing {name}...")
            ts = analyze_take(src, folder, label)
            all_scores.append(ts)
            by_cat.setdefault(folder, []).append(ts)

    # Rank within each category (lower score = better)
    for folder, items in by_cat.items():
        items.sort(key=lambda t: (t.in_edit is False, t.score))
        for i, t in enumerate(items):
            t.rank = rank_label(i + 1 if not t.in_edit else 0, t.in_edit)
            if t.in_edit and t.rank == "EDIT":
                pass
            elif t.in_edit:
                t.rank = "EDIT"

    # Re-sort: EDIT first, then A+, A, B...
    rank_order = {"EDIT": 0, "A+": 1, "A": 2, "B": 3, "C": 4}
    for folder, items in by_cat.items():
        dest_dir = ORG / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        items.sort(key=lambda t: (rank_order.get(t.rank, 9), t.score))
        for t in items:
            prefix = f"[{t.rank}]" if t.rank else "[C]"
            hardlink(VIDEO_DIR / t.name, dest_dir / f"{prefix} {t.name}")

    # CSV report
    csv_path = ORG / "relatorio-takes.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["arquivo", "pasta", "tipo", "nota", "duracao_s", "shake_medio", "shake_pico",
                    "score", "melhor_trecho", "na_edicao"])
        for t in sorted(all_scores, key=lambda x: (x.category, x.score)):
            w.writerow([t.name, t.category, t.category_label, t.rank, t.duration,
                        t.shake_mean, t.shake_peak, t.score, t.best_window, t.in_edit])

    # Markdown summary
    md_lines = [
        "# Melhores takes — Capitólio Mar de Minas",
        "",
        "Notas: **EDIT** = na timeline IA 2026 | **A+** = mais estável da categoria | score menor = menos tremida",
        "",
    ]
    for folder, (label, _) in CATEGORIES.items():
        items = by_cat.get(folder, [])
        if not items:
            continue
        md_lines.append(f"## {folder} — {label}")
        md_lines.append("")
        md_lines.append("| Nota | Arquivo | Duração | Melhor trecho | Shake |")
        md_lines.append("|------|---------|---------|---------------|-------|")
        for t in sorted(items, key=lambda x: (rank_order.get(x.rank, 9), x.score)):
            md_lines.append(
                f"| **{t.rank}** | {t.name} | {t.duration}s | {t.best_window} | {t.shake_mean} |"
            )
        md_lines.append("")

    (ORG / "MELHORES-TAKES.md").write_text("\n".join(md_lines), encoding="utf-8")

    readme = f"""Capitólio — Videos organizados por tipo de take
============================================

Pasta: Videos\\_PorTipo\\

Os arquivos originais continuam em Videos\\ (raiz).
Subpastas usam hard links — não duplicam disco.

LEGENDA no nome do arquivo:
  [EDIT]  = já usado na edição Attenborough IA 2026
  [A+]    = melhor take da categoria (menos tremida)
  [A]     = segundo melhor
  [B]     = terceiro / reserva
  [C]     = alternativa ou clip muito curto

RELATÓRIOS:
  relatorio-takes.csv   — planilha completa (abra no Excel)
  MELHORES-TAKES.md     — resumo por pasta

SHAKE (score): quanto MENOR, mais estável.
Melhor trecho: janela sugerida para cortar no Premiere (in/out).

Pastas:
"""
    for folder, (label, _) in CATEGORIES.items():
        readme += f"  {folder}\\  — {label}\n"

    (ORG / "LEIA-ME.txt").write_text(readme, encoding="utf-8")

    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "capitolio-take-scores.json").write_text(
        json.dumps([t.__dict__ for t in all_scores], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\nDone: {ORG}")
    print(f"  {len(all_scores)} takes analyzed")
    print(f"  relatorio-takes.csv")
    print(f"  MELHORES-TAKES.md")


if __name__ == "__main__":
    main()
