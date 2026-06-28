#!/usr/bin/env python3
"""
Capitólio V2 Com IA — build from zero:
  1. Analyze all videos (stability scores)
  2. Timeline notes (TIMELINE-NOTAS.md + CSV)
  3. Narration + music (IA)
  4. Premiere project with V1 timeline + A1/A2
"""

from __future__ import annotations

import base64
import csv
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

try:
    import numpy as np
except ImportError:
    raise SystemExit("pip install numpy")

ROOT = Path(__file__).resolve().parent.parent
IMAGINE_ENV = ROOT.parent / ".env.local"

BASE = Path("/mnt/e/Vídeos/2017/Capitólio V2 Com IA")
VIDEOS = BASE / "Videos"
AUDIO = BASE / "Audio"
LUT = BASE / "LUT"
DOCS = BASE / "Docs"
PROJECT = BASE / "Capitólio V2 Com IA.prproj"

# Template with all 52 clips already imported
TEMPLATE_PRPROJ = Path(
    "/mnt/e/Vídeos/2017/- Postado/Capitólio Mar de Minas/Antigos/Capitólio IA 2026.prproj"
)
FALLBACK_NARR = Path(
    "/mnt/e/Vídeos/2017/- Postado/Capitólio Mar de Minas/Audio/Narracao Attenborough IA 2026.mp3"
)
FALLBACK_MUSIC = Path(
    "/mnt/e/Vídeos/2017/- Postado/Capitólio Mar de Minas/Audio/Musica Capitólio IA 2026.mp3"
)

WIN_BASE = r"E:\Vídeos\2017\Capitólio V2 Com IA"
TICKS = 254016000000
SEQ_NAME = "Capitólio V2 — Attenborough IA"

TTS_MODEL = "hexgrad/kokoro-82m"
TTS_VOICE = "bm_george"
TTS_SPEED = 0.86
MUSIC_MODEL = "google/lyria-3-pro-preview"

NARR_MP3 = AUDIO / "Narracao Attenborough IA 2026.mp3"
MUSIC_MP3 = AUDIO / "Musica Capitólio V2.mp3"

SCALE_W, SCALE_H, FPS = 160, 90, 4

SEGMENTS: list[tuple[str, float]] = [
    ("Six hundred kilometres from the nearest ocean, in the heart of Brazil, the landscape begins to change.", 1.4),
    (
        "Capitólio lies in southern Minas Gerais, on the edge of the Furnas Reservoir — "
        "a lake so vast that those who live here call it the Mar de Minas, the Sea of Minas. "
        "It is one of the largest artificial lakes in Brazil. "
        "Yet time and water have made it feel like something ancient. "
        "More than twenty waterfalls spill into its valleys. "
        "For a region six hundred kilometres from the coast, it is the closest thing to a shore.",
        1.2,
    ),
    (
        "The first glimpse comes from the Furnas Canyons Lookout, along Highway MG zero fifty. "
        "A short walk through the trees — no more than a hundred metres — and the land falls away. "
        "Below, the canyon walls rise in layers of rock, carved slowly over millennia. "
        "The view demands silence.",
        1.2,
    ),
    (
        "Higher on the trail, Diquadinha Waterfall pours through the light. "
        "The water is so clear that the riverbed seems to hang beneath the surface. "
        "With every step upward, the forest opens onto a view more striking than the last.",
        1.2,
    ),
    (
        "At Cascata Eco Parque, the landscape divides into two worlds. "
        "From above, the reservoir stretches to the horizon — small boats tracing lines across the water far below. "
        "From below, inside the canyon, a network of falls has worn smooth basins into the stone. "
        "The pools shift in colour — turquoise, emerald, deep blue — according to their depth. "
        "The water holds the warmth of the earth itself.",
        1.3,
    ),
    (
        "But the true scale of this place is only revealed from the water. "
        "A boat moves between canyon walls forty metres high — cliffs that tower above the forest path. "
        "Through Toucan Valley. Past Cascatinha Fall. Beneath the lower canyon. "
        "And finally, into the Blue Lagoon — a chamber of water so vivid it seems to glow from within.",
        1.5,
    ),
    (
        "Capitólio does not announce itself. "
        "It waits, inland, far from the sea — "
        "and offers, to those who find it, a beauty that needs no ocean to be complete.",
        0.0,
    ),
]

MUSIC_PROMPT = (
    "Emotional cinematic documentary underscore, Brazilian canyon lake Capitólio. "
    "Slow strings, gentle guitar, soft piano, awe and wonder, no vocals, no drums, "
    "warm golden hour feeling, builds softly to hopeful ending, 140 seconds feel."
)

# Documentary beats — (file, in, out, beat label)
TIMELINE_CUTS: list[tuple[str, float, float, str]] = [
    ("inicio (3).MP4", 3, 7, "01 Intro — paisagem"),
    ("DJI_0001.MP4", 1, 9, "02 Mar de Minas — estabelecimento"),
    ("DJI_0003.MP4", 8, 17, "03 Reservatório — vastidão"),
    ("DJI_0005.MP4", 15, 25, "04 Aéreo — caldeirão"),
    ("DJI_0009.MP4", 6, 15, "05 Mirante Furnas"),
    ("DJI_0014.MP4", 0, 6, "06 Trilha — entrada"),
    ("DJI_0015.MP4", 5, 14, "07 Diquadinha — cachoeira"),
    ("DJI_0018.MP4", 42, 52, "08 Trilha — vista superior"),
    ("DJI_0036.MP4", 11, 20, "09 Cascata — de cima"),
    ("DJI_0038.MP4", 8, 17, "10 Cânion — paredes"),
    ("DJI_0039.MP4", 36, 47, "11 Piscinas naturais"),
    ("DJI_0046.MP4", 0, 11, "12 Eco Parque — rede de quedas"),
    ("DJI_0047.MP4", 73, 86, "13 Barco — canyon 40m"),
    ("DJI_0048.MP4", 0, 9, "14 Vale / aproximação lagoa"),
    ("DJI_0040.MP4", 8, 14, "15 Lagoa Azul — glow"),
    ("inicio (4).MP4", 5, 11, "16 Encerramento"),
]

BEAT_NARRATION = [
    "Six hundred kilometres from the nearest ocean…",
    "Capitólio lies in southern Minas Gerais… Mar de Minas…",
    "The first glimpse comes from the Furnas Canyons Lookout…",
    "Higher on the trail, Diquadinha Waterfall…",
    "At Cascata Eco Parque, two worlds…",
    "But the true scale… from the water… Blue Lagoon…",
    "Capitólio does not announce itself…",
]


@dataclass
class TakeScore:
    name: str
    duration: float
    shake_mean: float
    shake_peak: float
    score: float
    best_window: str
    rank: str = "C"


@dataclass
class TrackRef:
    track_item_id: str
    subclip_id: str
    videoclip_id: str
    name: str


def load_env() -> None:
    for env_file in (ROOT / ".env", IMAGINE_ENV):
        if not env_file.is_file():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


def api_key() -> str:
    k = os.environ.get("OPENROUTER_API_KEY")
    if not k:
        raise SystemExit("OPENROUTER_API_KEY missing in imagine/.env.local")
    return k


def sec_to_ticks(seconds: float) -> str:
    return str(int(round(seconds * TICKS)))


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
    fb = SCALE_W * SCALE_H
    n = len(raw) // fb
    if n < 2:
        return []
    arr = np.frombuffer(raw[: n * fb], dtype=np.uint8).reshape(n, SCALE_H, SCALE_W)
    diffs = np.abs(arr[1:].astype(np.int16) - arr[:-1].astype(np.int16)).mean(axis=(1, 2))
    out: list[float] = []
    for i in range(0, len(diffs), FPS):
        c = diffs[i : i + FPS]
        if len(c):
            out.append(float(c.mean()))
    return out


def best_window(per_sec: list[float], window: int = 8) -> str:
    if not per_sec:
        return "0s–0s"
    w = min(window, len(per_sec))
    best = (999.0, 0)
    for s in range(len(per_sec) - w + 1):
        chunk = per_sec[s : s + w]
        val = float(np.mean(chunk)) + 0.5 * float(np.max(chunk))
        if val < best[0]:
            best = (val, s)
    s = best[1]
    return f"{s}s–{s + w}s"


def analyze_all() -> dict[str, TakeScore]:
    scores: dict[str, TakeScore] = {}
    for f in sorted(VIDEOS.glob("*.MP4")):
        print(f"  analyze {f.name}")
        per = motion_per_second(f)
        dur = probe_duration(f)
        if not per:
            scores[f.name] = TakeScore(f.name, dur, 999, 999, 999, "0s–0s")
            continue
        mean = float(np.mean(per))
        peak = float(np.percentile(per, 92))
        sc = mean + 0.5 * peak - min(dur, 30) * 0.002
        scores[f.name] = TakeScore(
            f.name, round(dur, 1), round(mean, 3), round(peak, 3),
            round(sc, 3), best_window(per),
        )
    return scores


def rank_scores(scores: dict[str, TakeScore]) -> None:
    used = {c[0] for c in TIMELINE_CUTS}
    by_cat: dict[str, list[TakeScore]] = {}
    cat_map = {
        "inicio": "intro",
        "DJI_000": "estab",
        "DJI_001": "mirante/trilha",
        "DJI_002": "transicao",
        "DJI_003": "cascata",
        "DJI_004": "barco/lagoa",
    }

    def cat(name: str) -> str:
        for k, v in cat_map.items():
            if name.startswith(k) or name.startswith("inicio"):
                return v
        return "outros"

    for name, ts in scores.items():
        by_cat.setdefault(cat(name), []).append(ts)

    for items in by_cat.values():
        items.sort(key=lambda t: t.score)
        labels = ["A+", "A", "B", "C", "C", "C"]
        for i, t in enumerate(items):
            if t.name in used:
                t.rank = "EDIT"
            else:
                t.rank = labels[min(i, len(labels) - 1)]


def write_timeline_docs(scores: dict[str, TakeScore], video_dur: float, narr_dur: float, music_dur: float) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    t = 0.0
    rows = []
    md = [
        "# Capitólio V2 — Timeline com notas",
        "",
        f"**Vídeo:** {video_dur:.1f}s | **Narração:** {narr_dur:.1f}s | **Música:** {music_dur:.1f}s",
        "",
        "## Sequência Premiere: `" + SEQ_NAME + "`",
        "",
        "| TC In | TC Out | Nota | Arquivo | Trecho source | Beat / narração | Shake |",
        "|-------|--------|------|---------|---------------|-----------------|-------|",
    ]
    narr_i = 0
    for name, ins, outs, beat in TIMELINE_CUTS:
        dur = outs - ins
        tc_in = f"{int(t // 60)}:{int(t % 60):02d}"
        tc_out = f"{int((t + dur) // 60)}:{int((t + dur) % 60):02d}"
        sc = scores.get(name)
        rank = sc.rank if sc else "?"
        shake = sc.shake_mean if sc else "?"
        bw = f"{ins:.0f}s–{outs:.0f}s"
        narr_hint = ""
        if "Intro" in beat or "Mar de Minas" in beat or t < 25:
            narr_hint = BEAT_NARRATION[min(narr_i, len(BEAT_NARRATION) - 1)]
            if "Mar de Minas" in beat:
                narr_i = 1
        elif "Mirante" in beat:
            narr_hint = BEAT_NARRATION[2]
        elif "Diquadinha" in beat or "Trilha" in beat:
            narr_hint = BEAT_NARRATION[3]
        elif "Cascata" in beat or "Eco" in beat or "Piscinas" in beat:
            narr_hint = BEAT_NARRATION[4]
        elif "Barco" in beat or "Lagoa" in beat:
            narr_hint = BEAT_NARRATION[5]
        elif "Encerramento" in beat:
            narr_hint = BEAT_NARRATION[6]

        md.append(
            f"| {tc_in} | {tc_out} | **{rank}** | {name} | {bw} | {beat} | {shake} |"
        )
        rows.append({
            "tc_in": tc_in, "tc_out": tc_out, "nota": rank, "arquivo": name,
            "source_in": ins, "source_out": outs, "duracao": dur, "beat": beat,
            "shake": shake, "rank_global": rank,
        })
        t += dur

    md.extend(["", "## Todos os takes (ranking estabilidade)", ""])
    md.append("| Nota | Arquivo | Duração | Melhor trecho | Score |")
    md.append("|------|---------|---------|---------------|-------|")
    for ts in sorted(scores.values(), key=lambda x: x.score):
        md.append(f"| {ts.rank} | {ts.name} | {ts.duration}s | {ts.best_window} | {ts.score} |")

    (DOCS / "TIMELINE-NOTAS.md").write_text("\n".join(md), encoding="utf-8")

    with (DOCS / "timeline-v2.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    with (DOCS / "todos-takes.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["arquivo", "nota", "duracao_s", "shake", "score", "melhor_trecho"])
        for ts in sorted(scores.values(), key=lambda x: x.score):
            w.writerow([ts.name, ts.rank, ts.duration, ts.shake_mean, ts.score, ts.best_window])

    print(f"Docs: {DOCS / 'TIMELINE-NOTAS.md'}")


def generate_narration() -> float:
    AUDIO.mkdir(parents=True, exist_ok=True)
    if FALLBACK_NARR.is_file():
        shutil.copy2(FALLBACK_NARR, NARR_MP3)
        d = probe_duration(NARR_MP3)
        print(f"Narration: {NARR_MP3} ({d:.1f}s)")
        return d

    load_env()
    tmp = Path(tempfile.mkdtemp())
    parts: list[Path] = []
    try:
        for i, (text, pause) in enumerate(SEGMENTS):
            payload = json.dumps({
                "model": TTS_MODEL, "input": text, "voice": TTS_VOICE,
                "response_format": "mp3", "speed": TTS_SPEED,
            }).encode()
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/audio/speech", data=payload,
                headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
                method="POST",
            )
            seg = tmp / f"s{i}.mp3"
            seg.write_bytes(urllib.request.urlopen(req, timeout=120).read())
            parts.append(seg)
            if pause > 0:
                sil = tmp / f"p{i}.mp3"
                subprocess.run(
                    ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                     "-t", str(pause), "-c:a", "libmp3lame", str(sil)],
                    check=True, capture_output=True,
                )
                parts.append(sil)
        lst = tmp / "list.txt"
        lst.write_text("\n".join(f"file '{p}'" for p in parts))
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-c:a", "libmp3lame", "-b:a", "256k", str(NARR_MP3)],
            check=True, capture_output=True,
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    d = probe_duration(NARR_MP3)
    print(f"Narration generated: {d:.1f}s")
    return d


def generate_music(target_dur: float) -> float:
    load_env()
    AUDIO.mkdir(parents=True, exist_ok=True)
    body = json.dumps({
        "model": MUSIC_MODEL,
        "messages": [{"role": "user", "content": MUSIC_PROMPT}],
        "modalities": ["text", "audio"],
        "audio": {"format": "wav"},
        "stream": True,
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    chunks: list[str] = []
    with urllib.request.urlopen(req, timeout=300) as res:
        buf = ""
        while True:
            chunk = res.read(8192)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    continue
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                for choice in data.get("choices", []):
                    audio = choice.get("delta", {}).get("audio") or choice.get("message", {}).get("audio")
                    if audio and audio.get("data"):
                        chunks.append(audio["data"])
    if not chunks:
        if FALLBACK_MUSIC.is_file():
            shutil.copy2(FALLBACK_MUSIC, MUSIC_MP3)
            dur = probe_duration(MUSIC_MP3)
            print(f"Music fallback copy: {dur:.1f}s")
        else:
            raise SystemExit("Music generation failed and no fallback")
    else:
        wav = AUDIO / "Musica Capitólio V2.wav"
        wav.write_bytes(base64.b64decode("".join(chunks)))
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(MUSIC_MP3)],
            check=True, capture_output=True,
        )
        dur = probe_duration(MUSIC_MP3)
        print(f"Music generated: {dur:.1f}s")
    if dur < target_dur - 1:
        tmp = AUDIO / "_loop.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-stream_loop", "2", "-i", str(MUSIC_MP3),
             "-t", str(target_dur), "-c:a", "libmp3lame", "-b:a", "192k", str(tmp)],
            check=True, capture_output=True,
        )
        tmp.replace(MUSIC_MP3)
        dur = probe_duration(MUSIC_MP3)
    print(f"Music: {MUSIC_MP3} ({dur:.1f}s)")
    return dur


def duck_music(narr: Path, music: Path, out: Path, total: float) -> None:
    """Sidechain music under narration."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(music), "-i", str(narr),
            "-filter_complex",
            "[0:a]volume=0.85[m];[m][1:a]sidechaincompress="
            "threshold=0.02:ratio=6:attack=250:release=1500:makeup=1[out]",
            "-map", "[out]", "-t", str(total),
            "-c:a", "libmp3lame", "-b:a", "192k", str(out),
        ],
        check=True, capture_output=True,
    )


def load_root(p: Path) -> ET.Element:
    with gzip.open(p, "rb") as f:
        return ET.fromstring(f.read().decode("utf-8"))


def save_root(root: ET.Element, p: Path) -> None:
    xml = '<?xml version="1.0" encoding="UTF-8" ?>\n' + ET.tostring(root, encoding="unicode")
    with gzip.open(p, "wb", compresslevel=9) as f:
        f.write(xml.encode("utf-8"))


def relink_paths(root: ET.Element) -> None:
    win_v = rf"{WIN_BASE}\Videos"
    win_a = rf"{WIN_BASE}\Audio"
    for el in root.iter():
        if el.text is None or not isinstance(el.text, str):
            continue
        t = el.text
        if el.tag in ("FilePath", "ActualMediaFilePath", "MediaFileHistory0", "RelativePath"):
            if any(x in t for x in (".MP4", ".mp4", "Phanton3", "DJI_", "inicio (")):
                fname = Path(t.replace("\\", "/")).name
                if el.tag == "RelativePath":
                    el.text = rf".\Videos\{fname}"
                else:
                    el.text = rf"{win_v}\{fname}"
            elif ".mp3" in t.lower():
                fname = Path(t.replace("\\", "/")).name
                if "Musica" in fname:
                    fname = "Musica Capitólio V2.mp3"
                if el.tag == "RelativePath":
                    el.text = rf".\Audio\{fname}"
                elif el.tag == "Title":
                    el.text = fname
                else:
                    el.text = rf"{win_a}\{fname}"
        if el.tag == "OfflineReason":
            el.text = "0"


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


def apply_premiere_timeline(root: ET.Element, narr_dur: float, music_dur: float) -> float:
    by_id, by_uid, refs = build_maps(root)
    seq = None
    for s in root.iter("Sequence"):
        n = s.find("Name")
        if n is not None:
            seq = s
            break
    if seq is None:
        raise SystemExit("No sequence in template")

    vtrack = None
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is not None and grp.tag == "VideoTrackGroup":
            for tr in grp.findall(".//Track"):
                vtrack = by_uid.get(tr.get("ObjectURef", ""))
                break

    by_name: dict[str, list[TrackRef]] = {}
    for r in refs:
        by_name.setdefault(r.name, []).append(r)

    selected: list[str] = []
    t = 0.0
    for name, ins, outs, _ in TIMELINE_CUTS:
        pool = by_name.get(name, [])
        if not pool:
            print(f"WARN missing {name}")
            continue
        ref = pool.pop(0)
        item = by_id[ref.track_item_id]
        dur = outs - ins
        vc = by_id.get(ref.videoclip_id)
        if vc is not None:
            clip = vc.find("Clip")
            if clip is not None:
                for tag, val in (("InPoint", ins), ("OutPoint", outs)):
                    node = clip.find(tag) or ET.SubElement(clip, tag)
                    node.text = sec_to_ticks(val)
        ti = item.find(".//TrackItem")
        for tag, val in (("Start", t), ("End", t + dur)):
            node = ti.find(tag) or ET.SubElement(ti, tag)
            node.text = sec_to_ticks(val)
        selected.append(ref.track_item_id)
        t += dur

    items = vtrack.find(".//ClipItems/TrackItems")
    items.clear()
    for i, oid in enumerate(selected):
        n = ET.SubElement(items, "TrackItem")
        n.set("Index", str(i))
        n.set("ObjectRef", oid)

    seq.find("Name").text = SEQ_NAME
    narr_ticks = sec_to_ticks(narr_dur)
    music_ticks = sec_to_ticks(max(music_dur, t))

    # Narration A1
    for media in root.iter("Media"):
        fp = media.find("FilePath")
        if fp is None or "Narracao" not in (fp.text or ""):
            continue
        for tag in ("FilePath", "ActualMediaFilePath", "Title"):
            el = media.find(tag)
            if el is not None:
                el.text = (
                    rf"{WIN_BASE}\Audio\Narracao Attenborough IA 2026.mp3"
                    if tag != "Title" else "Narracao Attenborough IA 2026.mp3"
                )

    for ams in root.iter("AudioMediaSource"):
        od = ams.find("OriginalDuration")
        if od is not None:
            od.text = narr_ticks

    a_items = []
    for item in root.iter("AudioClipTrackItem"):
        sc = item.find(".//SubClip")
        sub = by_id.get(sc.get("ObjectRef", ""))
        if sub is None:
            continue
        nm = sub.find("Name")
        if nm is not None and "Narracao" in (nm.text or ""):
            a_items.append(("narr", item))
        elif nm is not None and "Musica" in (nm.text or ""):
            a_items.append(("music", item))

    # Fix narration on first audio track item found
    for kind, item in a_items:
        if kind != "narr":
            continue
        ti = item.find(".//TrackItem")
        ti.find("Start").text = "0"
        ti.find("End").text = narr_ticks

    # Audio tracks: clear A2+ broken clones
    for tg in seq.findall(".//TrackGroup"):
        ref = tg.find("Second")
        grp = by_id.get(ref.get("ObjectRef", ""))
        if grp is None or grp.tag != "AudioTrackGroup":
            continue
        tracks = grp.findall(".//Track")
        for tr in tracks[1:]:
            track = by_uid.get(tr.get("ObjectURef", ""))
            cont = track.find(".//ClipItems/TrackItems")
            if cont is not None:
                cont.clear()

    return t


def main() -> None:
    if not VIDEOS.is_dir():
        raise SystemExit(f"Videos folder missing: {VIDEOS}")
    if not TEMPLATE_PRPROJ.is_file():
        raise SystemExit(f"Template prproj missing: {TEMPLATE_PRPROJ}")

    scores_path = ROOT / "data" / "capitolio-v2-scores.json"
    if os.environ.get("SKIP_ANALYZE") and scores_path.is_file():
        raw = json.loads(scores_path.read_text())
        scores = {
            r["name"]: TakeScore(
                r["name"], r["duration"], r["shake_mean"], r["shake_peak"],
                r["score"], r.get("best_window", "?"), r.get("rank", "C"),
            )
            for r in raw
        }
        rank_scores(scores)
        print("=== 1/5 Scores loaded (skip analyze) ===")
    else:
        print("=== 1/5 Analyze videos ===")
        scores = analyze_all()
        rank_scores(scores)
        scores_path.parent.mkdir(exist_ok=True)
        scores_path.write_text(
            json.dumps([s.__dict__ for s in scores.values()], indent=2), encoding="utf-8"
        )

    print("=== 2/5 Audio (narration + music) ===")
    load_env()
    narr_dur = generate_narration()
    video_dur = sum(c[2] - c[1] for c in TIMELINE_CUTS)
    target = max(narr_dur, video_dur)
    music_dur = generate_music(target)
    ducked = AUDIO / "Musica Capitólio V2 ducked.mp3"
    try:
        duck_music(NARR_MP3, MUSIC_MP3, ducked, target)
        shutil.copy2(ducked, MUSIC_MP3)
        print(f"Ducked music → {MUSIC_MP3}")
    except subprocess.CalledProcessError:
        print("Duck skipped — using raw music")

    print("=== 3/5 Timeline notes ===")
    write_timeline_docs(scores, video_dur, narr_dur, music_dur)

    print("=== 4/5 Premiere project ===")
    shutil.copy2(TEMPLATE_PRPROJ, PROJECT)
    root = load_root(PROJECT)
    relink_paths(root)
    timeline = apply_premiere_timeline(root, narr_dur, music_dur)
    save_root(root, PROJECT)

    # LUT copy
    src_lut = ROOT / "color" / "steve-mccurry-capitolio.cube"
    if src_lut.is_file():
        LUT.mkdir(exist_ok=True)
        shutil.copy2(src_lut, LUT / "steve-mccurry-capitolio.cube")

    print("=== 5/5 Done ===")
    print(f"Project:  {WIN_BASE}\\Capitólio V2 Com IA.prproj")
    print(f"Sequence: {SEQ_NAME}")
    print(f"Video {timeline:.1f}s | Narr {narr_dur:.1f}s | Music {music_dur:.1f}s")
    print(f"Notes:    {WIN_BASE}\\Docs\\TIMELINE-NOTAS.md")


if __name__ == "__main__":
    main()
