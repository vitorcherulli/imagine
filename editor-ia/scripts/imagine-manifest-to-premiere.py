#!/usr/bin/env python3
"""
Imagine manifest → Premiere pipeline (match footage + build .prproj).

Runs both steps in one command. Requires ffprobe and a template .prproj.

Example:
  python3 scripts/imagine-manifest-to-premiere.py \\
    --manifest ~/Downloads/capitolio-manifest.json \\
    --footage /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Videos \\
    --template /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Antigos/Capitólio\\ IA\\ 2026.prproj \\
    --output /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Capitólio\\ Imagine.prproj \\
    --win-base "E:\\Vídeos\\2017\\Capitólio Mar de Minas" \\
    --audio /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Audio/Narracao.mp3
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent


def run_step(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Match manifest + build Premiere project")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--footage", required=True, type=Path)
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--win-base", required=True)
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--scores", type=Path, default=ROOT / "data" / "capitolio-v2-scores.json")
    parser.add_argument("--matched", type=Path, help="Intermediate matched manifest path")
    parser.add_argument("--allow-reuse", action="store_true")
    parser.add_argument("--videos-subdir", default="Videos")
    parser.add_argument("--audio-subdir", default="Audio")
    parser.add_argument("--sequence")
    args = parser.parse_args()

    manifest = args.manifest.expanduser().resolve()
    matched = args.matched or manifest.with_name(manifest.stem + "-matched.json")

    match_cmd = [
        sys.executable,
        str(SCRIPTS / "imagine-match-manifest.py"),
        "--manifest",
        str(manifest),
        "--footage",
        str(args.footage.expanduser().resolve()),
        "--output",
        str(matched),
    ]
    if args.scores.is_file():
        match_cmd.extend(["--scores", str(args.scores)])
    if args.allow_reuse:
        match_cmd.append("--allow-reuse")

    build_cmd = [
        sys.executable,
        str(SCRIPTS / "imagine-build-prproj.py"),
        "--manifest",
        str(matched),
        "--template",
        str(args.template.expanduser().resolve()),
        "--output",
        str(args.output.expanduser().resolve()),
        "--win-base",
        args.win_base,
        "--videos-subdir",
        args.videos_subdir,
        "--audio-subdir",
        args.audio_subdir,
    ]
    if args.audio:
        build_cmd.extend(["--audio", str(args.audio.expanduser().resolve())])
    if args.sequence:
        build_cmd.extend(["--sequence", args.sequence])

    run_step(match_cmd)
    run_step(build_cmd)
    print(f"\nDone. Open in Premiere:\n  {args.output}")


if __name__ == "__main__":
    main()
