import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export const SEEDANCE_MIN_DURATION = 4;
export const SEEDANCE_MAX_DURATION = 15;

export function pickSeedanceRequestDuration(targetSeconds: number): number {
  const rounded = Math.round(targetSeconds);
  return Math.min(
    SEEDANCE_MAX_DURATION,
    Math.max(SEEDANCE_MIN_DURATION, rounded),
  );
}

export function hasFfmpeg(): boolean {
  return !!resolveFfmpegBin();
}

/** Short silent stereo WAV for music-only / visual-only export segments. */
export async function createSilentWav(outPath: string, durationSeconds: number): Promise<string> {
  const ffmpegBin = resolveFfmpegBin();
  if (!ffmpegBin) throw new Error("ffmpeg is not installed or not on PATH");
  const dur = Math.max(0.1, durationSeconds);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-t",
        String(dur),
        "-c:a",
        "pcm_s16le",
        outPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`ffmpeg silent audio failed: ${stderr.slice(-500)}`));
    });
  });
}

function resolveFfmpegBin(): string | null {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && fsSync.existsSync(fromEnv)) return fromEnv;
  try {
    const which = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    if (which.status === 0) {
      const bin = which.stdout.trim();
      if (bin) return bin;
    }
  } catch {
    // ignore
  }
  for (const candidate of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  try {
    const res = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    if (res.status === 0) return "ffmpeg";
  } catch {
    // ignore
  }
  return null;
}

import {
  effectiveMusicGain,
  effectiveNarrationGain,
  effectiveSceneGain,
} from "./volume";
import { escapeFfmpegSubtitlesPath } from "./captions";
import { normalizeVideoFormat, type VideoFormat } from "./video-format";
import {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  isExportResolutionId,
  resolveExportResolution,
  type ExportResolution,
  type ExportResolutionId,
} from "./export-resolutions";

export type { ExportResolution, ExportResolutionId } from "./export-resolutions";
export {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  isExportResolutionId,
  resolveExportResolution,
} from "./export-resolutions";

export async function concatBlocksWithAudio(opts: {
  segments: Array<{
    videoPath: string;
    audioPath: string;
    sceneAudioPath?: string | null;
    audioVolume?: number;
    sceneAudioVolume?: number;
    /** Timeline block length — video is loop/trimmed and audio trimmed to match. */
    durationSeconds: number;
    /** Slice narration from this offset (continuous visual cuts). */
    audioTrimStart?: number;
  }>;
  outputPath: string;
  musicPath?: string | null;
  musicVolume?: number;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  resolution?: ExportResolutionId;
  videoFormat?: VideoFormat | unknown;
  /** Optional ASS subtitle file burned into the exported video. */
  captionsAssPath?: string | null;
  fps?: number;
}): Promise<void> {
  const {
    segments,
    outputPath,
    musicPath,
    musicVolume,
    narrationVolume,
    sceneVolume,
    masterVolume,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    videoFormat = "horizontal",
    captionsAssPath = null,
    fps = 30,
  } = opts;
  if (segments.length === 0) throw new Error("No segments to export");

  const res = resolveExportResolution(resolution, videoFormat);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Each segment uses 2 inputs (video + narration). Scene audio is added as an extra
  // input only for segments that actually have one.
  const args: string[] = ["-y"];
  const sceneInputIndex = new Map<number, number>();

  for (const seg of segments) {
    args.push("-i", seg.videoPath);
    args.push("-i", seg.audioPath);
  }
  let nextInput = segments.length * 2;
  segments.forEach((seg, i) => {
    if (seg.sceneAudioPath) {
      args.push("-i", seg.sceneAudioPath);
      sceneInputIndex.set(i, nextInput);
      nextInput += 1;
    }
  });

  const hasMusic = !!musicPath;
  let musicInputIdx = -1;
  if (hasMusic) {
    musicInputIdx = nextInput;
    args.push("-stream_loop", "-1", "-i", musicPath!);
    nextInput += 1;
  }

  const scaleFilter =
    `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${fps},format=yuv420p`;

  const filterParts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const vIdx = i * 2;
    const aIdx = vIdx + 1;
    const seg = segments[i];
    const dur = Math.max(0.5, seg.durationSeconds);
    const narrationGain = effectiveNarrationGain({
      blockVolume: seg.audioVolume,
      trackVolume: narrationVolume,
      masterVolume,
    });
    const audioStart = Math.max(0, seg.audioTrimStart ?? 0);
    // Loop/trim video and trim narration to the same block duration so concat is stable.
    filterParts.push(
      `[${vIdx}:v]${scaleFilter},loop=loop=-1:size=32767:start=0,trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`,
    );
    filterParts.push(
      `[${aIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${narrationGain.toFixed(4)},atrim=start=${audioStart}:duration=${dur},asetpts=PTS-STARTPTS[narr${i}]`,
    );
    const sceneIdx = sceneInputIndex.get(i);
    if (sceneIdx !== undefined) {
      const gain = effectiveSceneGain({
        blockVolume: seg.sceneAudioVolume,
        trackVolume: sceneVolume,
        masterVolume,
      });
      filterParts.push(
        `[${sceneIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${gain.toFixed(4)},atrim=duration=${dur},asetpts=PTS-STARTPTS[scene${i}]`,
      );
      filterParts.push(
        `[narr${i}][scene${i}]amix=inputs=2:duration=first:dropout_transition=0,aresample=44100[a${i}]`,
      );
    }
  }

  const concatInputs = segments
    .map((_, i) => {
      const audioLabel = sceneInputIndex.has(i) ? `a${i}` : `narr${i}`;
      return `[v${i}][${audioLabel}]`;
    })
    .join("");
  filterParts.push(
    `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][narration]`,
  );

  let videoMapLabel = "outv";
  if (captionsAssPath) {
    const escaped = escapeFfmpegSubtitlesPath(captionsAssPath);
    filterParts.push(`[outv]subtitles='${escaped}'[outvc]`);
    videoMapLabel = "outvc";
  }

  if (hasMusic) {
    const vol = effectiveMusicGain({ musicVolume, masterVolume });
    filterParts.push(
      `[${musicInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${vol.toFixed(4)}[bg]`,
    );
    filterParts.push(`[narration][bg]amix=inputs=2:duration=first:dropout_transition=0[outa]`);
  }

  const filterComplex = filterParts.join(";");

  args.push("-filter_complex", filterComplex);
  args.push("-map", `[${videoMapLabel}]`);
  if (hasMusic) {
    args.push("-map", "[outa]");
  } else {
    args.push("-map", "[narration]");
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    res.preset,
    "-crf",
    String(res.crf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  );

  return new Promise<void>((resolve, reject) => {
    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin) {
      reject(new Error("ffmpeg is not installed or not on PATH"));
      return;
    }
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function readWavDurationSeconds(filePath: string): number | null {
  try {
    const buf = fsSync.readFileSync(filePath);
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bitsPerSample = buf.readUInt16LE(34);
    const dataSize = buf.readUInt32LE(40);
    if (!sampleRate || !channels || !bitsPerSample || !dataSize) return null;
    const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
    const seconds = dataSize / bytesPerSecond;
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

function readMp4DurationSeconds(filePath: string): number | null {
  try {
    const buf = fsSync.readFileSync(filePath);
    let offset = 0;
    while (offset < buf.length - 8) {
      const size = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      if (size < 8) break;
      if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
        offset += 8;
        continue;
      }
      if (type === "mvhd") {
        const version = buf.readUInt8(offset + 8);
        if (version === 0) {
          const timescale = buf.readUInt32BE(offset + 20);
          const duration = buf.readUInt32BE(offset + 24);
          if (!timescale || !duration) return null;
          return duration / timescale;
        }
        const timescale = buf.readUInt32BE(offset + 28);
        const duration = Number(buf.readBigUInt64BE(offset + 32));
        if (!timescale || !duration) return null;
        return duration / timescale;
      }
      offset += size;
    }
    return null;
  } catch {
    return null;
  }
}

function readMediaDurationFallback(filePath: string): number | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return readWavDurationSeconds(filePath);
  if (ext === ".mp4") return readMp4DurationSeconds(filePath);
  return null;
}

function getMediaDurationViaFfprobe(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    proc.stderr.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      const value = parseFloat(out.trim());
      if (Number.isFinite(value) && value > 0) resolve(value);
      else reject(new Error(`ffprobe returned invalid duration for ${filePath}`));
    });
  });
}

export async function getMediaDurationSeconds(filePath: string): Promise<number> {
  try {
    return await getMediaDurationViaFfprobe(filePath);
  } catch {
    const fallback = readMediaDurationFallback(filePath);
    if (fallback !== null) return fallback;
    throw new Error(`Could not read media duration for ${filePath}`);
  }
}

/** Speed up or slow down narration (0.75–1.35). Uses atempo; chains filters beyond 0.5–2.0. */
export async function adjustSpeechSpeed(
  inputBuffer: Buffer,
  inputFilename: string,
  speed: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const target = normalizeAtempoSpeed(speed);
  if (Math.abs(target - 1) < 0.02 || !hasFfmpeg()) {
    return { buffer: inputBuffer, filename: inputFilename };
  }

  const ext = path.extname(inputFilename).toLowerCase() || ".wav";
  const outExt = ext === ".mp3" ? ".mp3" : ".wav";
  const outName = inputFilename.replace(/\.[^.]+$/, "") + `_spd${outExt}`;
  const tmpDir = path.join(os.tmpdir(), "imagine-tts-speed");
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in_${Date.now()}${ext}`);
  const outPath = path.join(tmpDir, `out_${Date.now()}${outExt}`);
  await fs.writeFile(inPath, inputBuffer);

  const filter = buildAtempoFilterChain(target);
  const encodeArgs =
    outExt === ".mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "192k"]
      : ["-c:a", "pcm_s16le"];

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-filter:a",
      filter,
      ...encodeArgs,
      outPath,
    ]);
    const buffer = await fs.readFile(outPath);
    return { buffer, filename: outName };
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

function normalizeAtempoSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(1.35, Math.max(0.75, speed));
}

function buildAtempoFilterChain(speed: number): string {
  const parts: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    parts.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(",");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin) {
      reject(new Error("ffmpeg is not installed or not on PATH"));
      return;
    }
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/** Returns true if the file has at least one audio stream. */
export function videoHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(out.trim().length > 0));
  });
}

/** Extract audio track from a video file as a standalone .m4a (AAC). */
export async function extractAudioFromVideo(
  videoPath: string,
  outputPath: string,
): Promise<boolean> {
  if (!hasFfmpeg()) return false;
  if (!(await videoHasAudioStream(videoPath))) return false;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Trim or loop a silent video clip to an exact target duration (seconds). */
export async function fitVideoToDuration(
  inputPath: string,
  outputPath: string,
  targetSeconds: number,
): Promise<void> {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to match video length to narration");
  }

  const target = Math.max(0.5, targetSeconds);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (!fsSync.existsSync(inputPath)) {
    throw new Error(`Input video not found: ${inputPath}`);
  }

  let sourceDuration = 0;
  try {
    sourceDuration = await getMediaDurationSeconds(inputPath);
  } catch {
    sourceDuration = 0;
  }

  if (sourceDuration > 0 && Math.abs(sourceDuration - target) < 0.12) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  const encodeArgs = [
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  ];

  if (sourceDuration > target + 0.05) {
    await runFfmpeg(["-y", "-i", inputPath, "-t", target.toFixed(3), ...encodeArgs, outputPath]);
    return;
  }

  await runFfmpeg([
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    inputPath,
    "-t",
    target.toFixed(3),
    ...encodeArgs,
    outputPath,
  ]);
}
