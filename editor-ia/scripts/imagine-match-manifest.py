#!/usr/bin/env python3
"""
Match Imagine manifest.json to local footage (layer 2).

Fills segment.clip.file / inSec / outSec and writes manifest.timeline[].

Example:
  python3 scripts/imagine-match-manifest.py \\
    --manifest ~/Downloads/capitolio-manifest.json \\
    --footage /mnt/e/Vídeos/2017/Capitólio\\ Mar\\ de\\ Minas/Videos \\
    --scores data/capitolio-v2-scores.json \\
    --output manifest-matched.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from imagine_manifest_lib import load_manifest, match_manifest_footage, save_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Match Imagine manifest to local footage")
    parser.add_argument("--manifest", required=True, type=Path, help="Input manifest.json from Imagine")
    parser.add_argument("--footage", required=True, type=Path, help="Folder with .MP4 / .mov clips")
    parser.add_argument(
        "--scores",
        type=Path,
        default=ROOT / "data" / "capitolio-v2-scores.json",
        help="Optional stability scores JSON (from capitolio-v2-build analyze)",
    )
    parser.add_argument("--output", type=Path, help="Output path (default: <manifest>-matched.json)")
    parser.add_argument(
        "--allow-reuse",
        action="store_true",
        help="Allow reusing the same source file for multiple segments",
    )
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    if not manifest_path.is_file():
        raise SystemExit(f"Manifest not found: {manifest_path}")

    scores_path = args.scores if args.scores.is_file() else None
    if args.scores and not scores_path:
        print(f"Scores file not found (continuing without): {args.scores}")

    manifest = load_manifest(manifest_path)
    matched, timeline, stats = match_manifest_footage(
        manifest,
        args.footage.expanduser().resolve(),
        scores_path=scores_path,
        allow_reuse=args.allow_reuse,
    )

    out = args.output
    if out is None:
        out = manifest_path.with_name(manifest_path.stem + "-matched.json")
    out = out.expanduser().resolve()
    save_manifest(out, matched)

    print(f"Matched: {stats.matched} clips → {out}")
    print(f"Timeline cuts: {len(timeline)}")
    if stats.missing:
        print("Warnings:")
        for msg in stats.missing[:12]:
            print(f"  - {msg}")
        if len(stats.missing) > 12:
            print(f"  … and {len(stats.missing) - 12} more")


if __name__ == "__main__":
    main()
