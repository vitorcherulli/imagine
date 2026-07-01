#!/usr/bin/env python3
"""Shared helpers for Imagine manifest → Premiere pipeline."""

from __future__ import annotations

import json
import re
import subprocess
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".mxf", ".avi", ".mkv", ".MP4", ".MOV"}
TICKS_PER_SECOND = 254016000000

# Common Portuguese/English documentary terms → filename hints
KEYWORD_ALIASES: dict[str, tuple[str, ...]] = {
    "capitolio": ("capitolio", "capitólio", "dji"),
    "capitólio": ("capitolio", "capitólio", "dji"),
    "canyon": ("canyon", "canion", "cânion", "furnas"),
    "cânion": ("canyon", "canion", "cânion", "furnas"),
    "waterfall": ("cascata", "queda", "diquadinha", "cachoeira"),
    "cachoeira": ("cascata", "queda", "diquadinha", "cachoeira"),
    "drone": ("dji", "aerial", "aereo", "aéreo"),
    "aerial": ("dji", "aerial", "aereo", "aéreo"),
    "boat": ("barco", "lagoa", "lago"),
    "barco": ("barco", "lagoa", "lago"),
    "lagoon": ("lagoa", "azul", "blue"),
    "lagoa": ("lagoa", "azul", "blue"),
    "intro": ("inicio", "intro", "opening"),
    "opening": ("inicio", "intro", "opening"),
}


def sec_to_ticks(seconds: float) -> str:
    return str(int(round(seconds * TICKS_PER_SECOND)))


def normalize_token(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def keyword_tokens(keywords: list[str] | None, visual_intent: str | None) -> list[str]:
    raw: list[str] = []
    if keywords:
        raw.extend(keywords)
    if visual_intent:
        raw.extend(re.findall(r"[A-Za-zÀ-ÿ0-9]+", visual_intent))
    tokens: list[str] = []
    seen: set[str] = set()
    for word in raw:
        base = normalize_token(word)
        if len(base) < 2:
            continue
        for part in base.split():
            if part in seen:
                continue
            seen.add(part)
            tokens.append(part)
            for alias in KEYWORD_ALIASES.get(part, ()):
                if alias not in seen:
                    seen.add(alias)
                    tokens.append(alias)
    return tokens


def parse_best_window(text: str) -> tuple[float, float] | None:
    m = re.match(r"(\d+(?:\.\d+)?)s?\s*[–-]\s*(\d+(?:\.\d+)?)s?", text.strip())
    if not m:
        return None
    a, b = float(m.group(1)), float(m.group(2))
    if b <= a:
        return None
    return a, b


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


@dataclass
class FootageFile:
    path: Path
    name: str
    duration: float
    score_rank: float = 999.0
    best_window: tuple[float, float] | None = None


@dataclass
class TakeScoreRecord:
    name: str
    duration: float
    score: float
    best_window: str | None = None
    rank: str | None = None


@dataclass
class TimelineCut:
    segment_id: str
    file: str
    in_sec: float
    out_sec: float
    start_sec: float
    end_sec: float
    label: str = ""


@dataclass
class MatchStats:
    matched: int = 0
    skipped: int = 0
    missing: list[str] = field(default_factory=list)


def load_scores_json(path: Path | None) -> dict[str, TakeScoreRecord]:
    if path is None or not path.is_file():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, TakeScoreRecord] = {}
    for row in raw:
        name = row.get("name")
        if not isinstance(name, str):
            continue
        out[name] = TakeScoreRecord(
            name=name,
            duration=float(row.get("duration", 0)),
            score=float(row.get("score", 999)),
            best_window=row.get("best_window"),
            rank=row.get("rank"),
        )
    return out


def index_footage(folder: Path, scores: dict[str, TakeScoreRecord]) -> list[FootageFile]:
    files: list[FootageFile] = []
    if not folder.is_dir():
        raise FileNotFoundError(f"Footage folder not found: {folder}")

    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.suffix not in VIDEO_EXTS:
            continue
        name = path.name
        rec = scores.get(name)
        duration = rec.duration if rec and rec.duration > 0 else probe_duration(path)
        window = parse_best_window(rec.best_window) if rec and rec.best_window else None
        rank_score = rec.score if rec else 999.0
        files.append(
            FootageFile(
                path=path,
                name=name,
                duration=duration,
                score_rank=rank_score,
                best_window=window,
            )
        )
    return files


def score_file_for_tokens(file: FootageFile, tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    hay = normalize_token(file.path.stem + " " + str(file.path.parent.name))
    hits = sum(1 for t in tokens if t in hay)
    if hits == 0:
        return 0.0
    stability_bonus = max(0.0, 3.0 - file.score_rank / 10.0)
    return hits * 10.0 + stability_bonus


def pick_in_out(file: FootageFile, need_duration: float) -> tuple[float, float]:
    need = max(0.5, need_duration)
    dur = file.duration or need
    if file.best_window:
        ins, outs = file.best_window
        window = outs - ins
        if window >= need * 0.85:
            return ins, min(ins + need, outs, dur)
        if window >= need * 0.5:
            return ins, outs

    if dur <= need + 0.25:
        return 0.0, dur

    # Stable middle section
    margin = max(0.0, (dur - need) / 2)
    return margin, min(margin + need, dur)


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict) -> None:
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def match_manifest_footage(
    manifest: dict,
    footage_folder: Path,
    scores_path: Path | None = None,
    allow_reuse: bool = False,
) -> tuple[dict, list[TimelineCut], MatchStats]:
    scores = load_scores_json(scores_path)
    pool = index_footage(footage_folder, scores)
    if not pool:
        raise RuntimeError(f"No video files found under {footage_folder}")

    used: set[str] = set()
    timeline: list[TimelineCut] = []
    stats = MatchStats()

    for segment in manifest.get("segments", []):
        if segment.get("kind") != "speech":
            continue

        seg_id = str(segment.get("id", "?"))
        start_sec = float(segment.get("startSec", 0))
        end_sec = float(segment.get("endSec", start_sec))
        seg_dur = float(segment.get("durationSec", end_sec - start_sec))
        tokens = keyword_tokens(segment.get("keywords"), segment.get("visualIntent"))
        shots = segment.get("shots")

        targets: list[tuple[str, float, float]] = []
        if isinstance(shots, list) and shots:
            cursor = start_sec
            for shot in shots:
                if not isinstance(shot, dict):
                    continue
                sd = float(shot.get("durationSec", 0))
                if sd < 0.5:
                    continue
                shot_tokens = keyword_tokens(shot.get("keywords"), shot.get("visualIntent"))
                merged = shot_tokens or tokens
                label = str(shot.get("visualIntent") or shot.get("id") or "")[:80]
                targets.append((label, cursor, cursor + sd))
                cursor += sd
        else:
            label = str(segment.get("visualIntent") or segment.get("text") or seg_id)[:80]
            targets.append((label, start_sec, end_sec))

        clip_slot = segment.setdefault("clip", {})
        first_match: dict | None = None

        for i, (label, t_start, t_end) in enumerate(targets):
            need = max(0.5, t_end - t_start)
            shot_tokens = tokens
            if isinstance(shots, list) and i < len(shots) and isinstance(shots[i], dict):
                shot_tokens = keyword_tokens(shots[i].get("keywords"), shots[i].get("visualIntent")) or tokens

            ranked = sorted(
                pool,
                key=lambda f: (
                    -score_file_for_tokens(f, shot_tokens),
                    f.score_rank,
                    f.name,
                ),
            )
            chosen: FootageFile | None = None
            for candidate in ranked:
                if score_file_for_tokens(candidate, shot_tokens) <= 0 and chosen is None:
                    # No keyword hit — fall back to best stability later
                    continue
                if not allow_reuse and candidate.name in used:
                    continue
                chosen = candidate
                break
            if chosen is None:
                for candidate in ranked:
                    if not allow_reuse and candidate.name in used:
                        continue
                    chosen = candidate
                    break

            if chosen is None:
                stats.skipped += 1
                stats.missing.append(f"{seg_id}: no unused footage")
                continue

            ins, outs = pick_in_out(chosen, need)
            actual_dur = outs - ins
            cut = TimelineCut(
                segment_id=seg_id,
                file=chosen.name,
                in_sec=round(ins, 2),
                out_sec=round(outs, 2),
                start_sec=round(t_start, 2),
                end_sec=round(t_start + actual_dur, 2),
                label=label,
            )
            timeline.append(cut)
            used.add(chosen.name)
            stats.matched += 1

            slot = {
                "file": str(chosen.path),
                "inSec": cut.in_sec,
                "outSec": cut.out_sec,
            }
            if i == 0:
                clip_slot.update(slot)
                first_match = slot
            if isinstance(shots, list) and i < len(shots) and isinstance(shots[i], dict):
                shots[i]["clip"] = slot

        if first_match is None and segment.get("kind") == "speech":
            stats.skipped += 1
            stats.missing.append(f"{seg_id}: unmatched")

    manifest["timeline"] = [
        {
            "segmentId": c.segment_id,
            "file": c.file,
            "inSec": c.in_sec,
            "outSec": c.out_sec,
            "startSec": c.start_sec,
            "endSec": c.end_sec,
            "label": c.label,
        }
        for c in sorted(timeline, key=lambda x: x.start_sec)
    ]
    manifest.setdefault("matchMeta", {})
    manifest["matchMeta"].update(
        {
            "footageFolder": str(footage_folder),
            "scoresFile": str(scores_path) if scores_path else None,
            "matchedClips": stats.matched,
            "skippedSegments": stats.skipped,
            "missing": stats.missing,
        }
    )
    return manifest, timeline, stats
