#!/usr/bin/env python3
"""Organize Capitólio drone takes by shot type (hard links — originals stay in Phanton3)."""

from __future__ import annotations

import shutil
from pathlib import Path

PHANTOM = Path("/mnt/e/Vídeos/2017/Capitólio Mar de Minas/Arquivos/Phanton3")
ORG = PHANTOM / "_Organizados"

# Clips on timeline in Capitólio IA 2026.prproj (Attenborough cut)
IN_EDIT = {
    "inicio (3).MP4",
    "inicio (4).MP4",
    "DJI_0001.MP4",
    "DJI_0003.MP4",
    "DJI_0005.MP4",
    "DJI_0009.MP4",
    "DJI_0014.MP4",
    "DJI_0015.MP4",
    "DJI_0018.MP4",
    "DJI_0036.MP4",
    "DJI_0038.MP4",
    "DJI_0039.MP4",
    "DJI_0046.MP4",
    "DJI_0047.MP4",
    "DJI_0048.MP4",
    "DJI_0042.MP4",
}

# Category by flight order + documentary script beats (Capitólio Mar de Minas)
CATEGORIES: dict[str, list[str]] = {
    "01-intro-vinheta": [
        "inicio (1).MP4",
        "inicio (2).MP4",
        "inicio (3).MP4",
        "inicio (4).MP4",
        "inicio (5).MP4",
        "inicio (6).MP4",
    ],
    "02-estabelecimento-mar-de-minas": [
        "DJI_0001.MP4",
        "DJI_0002.MP4",
        "DJI_0003.MP4",
        "DJI_0004.MP4",
        "DJI_0005.MP4",
        "DJI_0006.MP4",
        "DJI_0007.MP4",
        "DJI_0008.MP4",
    ],
    "03-mirante-furnas": [
        "DJI_0009.MP4",
        "DJI_0010.MP4",
        "DJI_0011.MP4",
        "DJI_0012.MP4",
        "DJI_0013.MP4",
    ],
    "04-diquadinha-trilha": [
        "DJI_0014.MP4",
        "DJI_0015.MP4",
        "DJI_0016.MP4",
        "DJI_0017.MP4",
        "DJI_0018.MP4",
        "DJI_0019.MP4",
        "DJI_0020.MP4",
        "DJI_0021.MP4",
        "DJI_0022.MP4",
    ],
    "05-reservatorio-transicao": [
        "DJI_0023.MP4",
        "DJI_0024.MP4",
        "DJI_0025.MP4",
        "DJI_0026.MP4",
        "DJI_0027.MP4",
        "DJI_0028.MP4",
        "DJI_0029.MP4",
        "DJI_0030.MP4",
        "DJI_0033.MP4",
        "DJI_0034.MP4",
        "DJI_0035.MP4",
    ],
    "06-cascata-eco-parque": [
        "DJI_0036.MP4",
        "DJI_0037.MP4",
        "DJI_0038.MP4",
        "DJI_0039.MP4",
        "DJI_0040.MP4",
        "DJI_0041.MP4",
        "DJI_0042.MP4",
        "DJI_0043.MP4",
        "DJI_0044.MP4",
        "DJI_0045.MP4",
        "DJI_0046.MP4",
    ],
    "07-barco-canyon-lagoa-azul": [
        "DJI_0047.MP4",
        "DJI_0048.MP4",
    ],
}

README = """Capitólio Mar de Minas — takes organizados por tipo
=====================================================

Os arquivos ORIGINAIS continuam na pasta Phanton3\\ (raiz).
Esta pasta usa hard links — não duplica espaço em disco.

Legenda nos nomes:
  [EDIT]  = clip usado na sequência "Capitólio — Attenborough IA 2026"
  [TAKE]  = alternativa na mesma categoria

Pastas:
  01-intro-vinheta              Abertura / vinhetas
  02-estabelecimento-mar-de-minas   Vista aérea do reservatório
  03-mirante-furnas             Mirante dos Cânions de Furnas
  04-diquadinha-trilha          Trilha e Cachoeira Diquadinha
  05-reservatorio-transicao     Planos gerais / transição
  06-cascata-eco-parque         Cascata Eco Parque (cânions e piscinas)
  07-barco-canyon-lagoa-azul    Barco, Vale do Tucano, Lagoa Azul

Melhores takes (na edição IA 2026):
  01: inicio (3), inicio (4)
  02: DJI_0001, DJI_0003, DJI_0005
  03: DJI_0009
  04: DJI_0014, DJI_0015, DJI_0018
  06: DJI_0036, DJI_0038, DJI_0039, DJI_0046
  07: DJI_0047 (take longo ~2min30), DJI_0048
  Nota: DJI_0042 está na timeline mas é curto (8s) — considere trocar por trecho de DJI_0047

Projeto Premiere editado: Capitólio IA 2026.prproj (na pasta pai)
Gerado por editor-ia/scripts/organize-capitolio-takes.py
"""


def link_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    try:
        os_link = getattr(Path, "hardlink_to", None)
        if os_link:
            dest.hardlink_to(src)
        else:
            import os

            os.link(src, dest)
    except OSError:
        shutil.copy2(src, dest)


def main() -> None:
    if not PHANTOM.is_dir():
        raise SystemExit(f"Not found: {PHANTOM}")

    ORG.mkdir(exist_ok=True)
    (ORG / "LEIA-ME.txt").write_text(README, encoding="utf-8")

    seen: set[str] = set()
    linked = 0
    missing: list[str] = []

    for folder, files in CATEGORIES.items():
        dest_dir = ORG / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        for name in files:
            seen.add(name)
            src = PHANTOM / name
            if not src.is_file():
                missing.append(name)
                continue
            tag = "[EDIT]" if name in IN_EDIT else "[TAKE]"
            dest_name = f"{tag} {name}"
            link_file(src, dest_dir / dest_name)
            linked += 1

    # Anything in Phanton3 root not categorized
    extra_dir = ORG / "99-sem-categoria"
    for src in sorted(PHANTOM.glob("*.MP4")):
        if src.name in seen or src.name.startswith("."):
            continue
        tag = "[EDIT]" if src.name in IN_EDIT else "[TAKE]"
        link_file(src, extra_dir / f"{tag} {src.name}")
        linked += 1

    print(f"Organized {linked} files → {ORG}")
    if missing:
        print("Missing:", ", ".join(missing))


if __name__ == "__main__":
    main()
