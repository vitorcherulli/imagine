import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
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

export type ExportResolutionId = "720p" | "1080p" | "1440p" | "2160p";

export interface ExportResolution {
  id: ExportResolutionId;
  width: number;
  height: number;
  label: string;
  /** Constant Rate Factor — lower = better quality, larger files. */
  crf: number;
  preset: string;
}

export const EXPORT_RESOLUTIONS: Record<ExportResolutionId, ExportResolution> = {
  "720p": { id: "720p", width: 1280, height: 720, label: "HD 720p", crf: 22, preset: "veryfast" },
  "1080p": { id: "1080p", width: 1920, height: 1080, label: "Full HD 1080p", crf: 20, preset: "veryfast" },
  "1440p": { id: "1440p", width: 2560, height: 1440, label: "QHD 1440p", crf: 19, preset: "medium" },
  "2160p": { id: "2160p", width: 3840, height: 2160, label: "4K 2160p", crf: 18, preset: "medium" },
};

export const DEFAULT_EXPORT_RESOLUTION: ExportResolutionId = "1080p";

export function isExportResolutionId(id: string | null | undefined): id is ExportResolutionId {
  return !!id && id in EXPORT_RESOLUTIONS;
}

export async function concatBlocksWithAudio(opts: {
  segments: Array<{
    videoPath: string;
    audioPath: string;
    sceneAudioPath?: string | null;
    audioVolume?: number;
    sceneAudioVolume?: number;
    /** Timeline block length — video is loop/trimmed and audio trimmed to match. */
    durationSeconds: number;
  }>;
  outputPath: string;
  musicPath?: string | null;
  musicVolume?: number;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  resolution?: ExportResolutionId;
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
    fps = 30,
  } = opts;
  if (segments.length === 0) throw new Error("No segments to export");

  const res = EXPORT_RESOLUTIONS[resolution];
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
    // Loop/trim video and trim narration to the same block duration so concat is stable.
    filterParts.push(
      `[${vIdx}:v]${scaleFilter},loop=loop=-1:size=32767:start=0,trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`,
    );
    filterParts.push(
      `[${aIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${narrationGain.toFixed(4)},atrim=duration=${dur},asetpts=PTS-STARTPTS[narr${i}]`,
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

  if (hasMusic) {
    const vol = effectiveMusicGain({ musicVolume, masterVolume });
    filterParts.push(
      `[${musicInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${vol.toFixed(4)}[bg]`,
    );
    filterParts.push(`[narration][bg]amix=inputs=2:duration=first:dropout_transition=0[outa]`);
  }

  const filterComplex = filterParts.join(";");

  args.push("-filter_complex", filterComplex);
  args.push("-map", "[outv]");
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
