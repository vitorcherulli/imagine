import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export const SEEDANCE_MIN_DURATION = 4;
export const SEEDANCE_MAX_DURATION = 15;
export const VEO_MIN_DURATION = 4;
export const VEO_MAX_DURATION = 8;

export function pickSeedanceRequestDuration(targetSeconds: number): number {
  const rounded = Math.round(targetSeconds);
  return Math.min(
    SEEDANCE_MAX_DURATION,
    Math.max(SEEDANCE_MIN_DURATION, rounded),
  );
}

export function pickVideoRequestDuration(targetSeconds: number, model?: string): number {
  const rounded = Math.round(targetSeconds);
  if (model?.includes("veo")) {
    return Math.min(VEO_MAX_DURATION, Math.max(VEO_MIN_DURATION, rounded));
  }
  return pickSeedanceRequestDuration(targetSeconds);
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
  sanitizeGain,
} from "./volume";
import { type MusicSwellTimelineBlock, listMusicSwellZones, MUSIC_SWELL_VOLUME_MULTIPLIER } from "./music-swell";
import { defaultMusic2TimelineStartSeconds } from "./music-duration-mismatch";
import { normalizeMusicSpanSeconds } from "./music-timeline";
import { escapeFfmpegSubtitlesPath } from "./captions";
import { normalizeVideoFormat, type VideoFormat } from "./video-format";
import { getSocialAspectRatioSpec, type SocialAspectRatio } from "./social-aspect-ratio";
import type { KeyframeFitMode } from "./keyframe-fit";
import { normalizeKeyframeFitMode } from "./keyframe-fit";
import {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  isExportResolutionId,
  resolveExportResolution,
  type ExportResolution,
  type ExportResolutionId,
} from "./export-resolutions";
import { KEYFRAME_CANVAS_RESOLUTION, isImageSizeBelowProviderMinimum, minDimensionsForAspectRatio } from "./openrouter/image-resolution";
import {
  DEFAULT_EXPORT_QUALITY,
  isExportQualityId,
  resolveExportEncoding,
  type ExportEncodingSettings,
  type ExportQualityId,
} from "./export-quality";

export type { ExportResolution, ExportResolutionId } from "./export-resolutions";
export type { ExportEncodingSettings, ExportQualityId } from "./export-quality";
export {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  isExportResolutionId,
  resolveExportResolution,
} from "./export-resolutions";
export {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  exportQualityOptionLabel,
  isExportQualityId,
  resolveExportEncoding,
} from "./export-quality";

export function safeSegmentDurationSeconds(durationSeconds: number): number {
  const n = Number(durationSeconds);
  if (!Number.isFinite(n) || n <= 0) return 0.5;
  return Math.max(0.5, n);
}

function ffmpegAudioBaseFilter(): string {
  return "aresample=44100,aformat=channel_layouts=stereo";
}

/** Piecewise gain expression for music swell zones on a single background bed. */
function ffmpegMusicSwellGainExpression(
  baseGain: number,
  zones: ReturnType<typeof listMusicSwellZones>,
): string {
  const base = sanitizeGain(baseGain);
  if (zones.length === 0) return base.toFixed(6);

  const peak = sanitizeGain(baseGain * MUSIC_SWELL_VOLUME_MULTIPLIER);
  const b = base.toFixed(6);
  const p = peak.toFixed(6);
  let expr = b;
  for (const z of [...zones].reverse()) {
    const fadeIn = Math.max(0.001, z.pauseStartSeconds - z.fadeStartSeconds);
    const fadeOut = Math.max(0.001, z.fadeEndSeconds - z.pauseEndSeconds);
    expr =
      `if(between(t,${z.pauseStartSeconds},${z.pauseEndSeconds}),${p},` +
      `if(between(t,${z.fadeStartSeconds},${z.pauseStartSeconds}),${b}+(${p}-${b})*(t-${z.fadeStartSeconds})/${fadeIn},` +
      `if(between(t,${z.pauseEndSeconds},${z.fadeEndSeconds}),${p}-(${p}-${b})*(t-${z.pauseEndSeconds})/${fadeOut},${expr})))`;
  }
  return expr;
}

function appendExportFinalMusicMix(opts: {
  filterParts: string[];
  hasMusic: boolean;
  musicInputIdx: number;
  music2InputIdx: number;
  hasMusic2: boolean;
  musicFileStart: number;
  music2FileStart: number;
  music2TimelineStart: number | null;
  music1DurationSeconds: number | null;
  music2DurationSeconds: number | null;
  mixDurationSeconds: number;
  musicVolume?: number | null;
  masterVolume?: number | null;
  timelineBlocks: MusicSwellTimelineBlock[];
}): string {
  const {
    filterParts,
    hasMusic,
    musicInputIdx,
    music2InputIdx,
    hasMusic2,
    musicFileStart,
    music2FileStart,
    music2TimelineStart,
    music1DurationSeconds,
    music2DurationSeconds,
    mixDurationSeconds,
    musicVolume,
    masterVolume,
    timelineBlocks,
  } = opts;

  if (!hasMusic || musicInputIdx < 0 || mixDurationSeconds <= 0.05) return "outa";

  const baseGain = effectiveMusicGain({ musicVolume, masterVolume });
  const zones = listMusicSwellZones(timelineBlocks);
  const volumeFilter =
    zones.length > 0
      ? `volume=volume='${ffmpegMusicSwellGainExpression(baseGain, zones)}'`
      : `volume=${sanitizeGain(baseGain).toFixed(4)}`;
  const base = ffmpegAudioBaseFilter();
  const musicLabel = "musicbed";

  if (hasMusic2 && music2TimelineStart != null && music2TimelineStart < mixDurationSeconds - 0.05) {
    const part1Dur = Math.min(music2TimelineStart, mixDurationSeconds);
    const part2Dur = mixDurationSeconds - part1Dur;
    const offset1 = musicFileStart;
    const maxPart1 =
      music1DurationSeconds != null
        ? Math.min(part1Dur, Math.max(0, music1DurationSeconds - offset1))
        : part1Dur;
    const actualPart1 = Math.max(0, maxPart1);
    const actualPart2 = Math.max(0, Math.min(part2Dur, mixDurationSeconds - actualPart1));

    if (actualPart1 > 0.05 && actualPart2 > 0.05) {
      filterParts.push(
        `[${musicInputIdx}:a]${base},atrim=start=${offset1}:duration=${actualPart1},asetpts=PTS-STARTPTS[m1final]`,
      );
      filterParts.push(
        `[${music2InputIdx}:a]${base},atrim=start=${music2FileStart}:duration=${actualPart2},asetpts=PTS-STARTPTS[m2final]`,
      );
      filterParts.push(`[m1final][m2final]concat=n=2:v=0:a=1[musicraw]`);
      filterParts.push(`[musicraw]${volumeFilter}[${musicLabel}]`);
    } else if (actualPart1 > 0.05) {
      filterParts.push(
        `[${musicInputIdx}:a]${base},atrim=start=${offset1}:duration=${actualPart1},asetpts=PTS-STARTPTS,${volumeFilter}[${musicLabel}]`,
      );
    } else if (actualPart2 > 0.05) {
      const local = part1Dur;
      const offset2 =
        music2DurationSeconds != null && music2DurationSeconds > 0
          ? music2FileStart + (local % music2DurationSeconds)
          : music2FileStart;
      filterParts.push(
        `[${music2InputIdx}:a]${base},atrim=start=${offset2}:duration=${actualPart2},asetpts=PTS-STARTPTS,${volumeFilter}[${musicLabel}]`,
      );
    } else {
      return "outa";
    }
  } else {
    filterParts.push(
      `[${musicInputIdx}:a]${base},atrim=start=${musicFileStart}:duration=${mixDurationSeconds},asetpts=PTS-STARTPTS,${volumeFilter}[${musicLabel}]`,
    );
  }

  filterParts.push(
    `[outa][${musicLabel}]amix=inputs=2:duration=first:dropout_transition=0,aresample=44100[outafinal]`,
  );
  return "outafinal";
}

/** Pixel canvas for keyframes / script imports — 1440p meets Kling/OpenRouter first-frame minimums. */
export function keyframeCanvasSize(videoFormat: VideoFormat | unknown = "horizontal"): {
  width: number;
  height: number;
} {
  const res = resolveExportResolution(KEYFRAME_CANVAS_RESOLUTION, videoFormat);
  return { width: res.width, height: res.height };
}

/** Build ffmpeg scale+pad filter — preserves photo aspect ratio inside project frame. */
export function buildContainImageFilter(width: number, height: number): string {
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
  );
}

/** Scale up and center-crop — fills the project frame with no letterboxing. */
export function buildCoverImageFilter(width: number, height: number): string {
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2`
  );
}

function buildKeyframeFitFilter(
  width: number,
  height: number,
  fitMode: KeyframeFitMode,
): string {
  return fitMode === "cover"
    ? buildCoverImageFilter(width, height)
    : buildContainImageFilter(width, height);
}

/** Solid black MP4 segment for blocks without video or keyframe. */
export async function createBlackSegmentVideo(opts: {
  outputPath: string;
  durationSeconds: number;
  resolution?: ExportResolutionId;
  videoFormat?: VideoFormat | unknown;
  fps?: number;
}): Promise<string> {
  const {
    outputPath,
    durationSeconds,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    videoFormat = "horizontal",
    fps = 30,
  } = opts;
  const res = resolveExportResolution(resolution, videoFormat);
  const dur = safeSegmentDurationSeconds(durationSeconds);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${res.width}x${res.height}:r=${fps}`,
    "-t",
    String(dur),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return outputPath;
}

/** Hold a keyframe still for the block duration (image-only export segments). */
export async function createStillSegmentVideo(opts: {
  imagePath: string;
  outputPath: string;
  durationSeconds: number;
  resolution?: ExportResolutionId;
  videoFormat?: VideoFormat | unknown;
  fitMode?: KeyframeFitMode | unknown;
  fps?: number;
}): Promise<string> {
  const {
    imagePath,
    outputPath,
    durationSeconds,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    videoFormat = "horizontal",
    fitMode = "cover",
    fps = 30,
  } = opts;
  const res = resolveExportResolution(resolution, videoFormat);
  const dur = safeSegmentDurationSeconds(durationSeconds);
  const mode = normalizeKeyframeFitMode(fitMode);
  const vf = `${buildKeyframeFitFilter(res.width, res.height, mode)},setsar=1,fps=${fps},format=yuv420p`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    String(dur),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return outputPath;
}

export type TimelineFrameSource = { kind: "video"; path: string; seekSeconds: number } | { kind: "image"; path: string } | { kind: "black" };

/** Single PNG still at export resolution — matches preview/export framing. */
export async function exportTimelineFramePng(opts: {
  outputPath: string;
  resolution?: ExportResolutionId;
  videoFormat?: VideoFormat | unknown;
  fitMode?: KeyframeFitMode | unknown;
  source: TimelineFrameSource;
}): Promise<string> {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to export frames. Install ffmpeg on the server.");
  }

  const {
    outputPath,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    videoFormat = "horizontal",
    fitMode = "cover",
    source,
  } = opts;
  const res = resolveExportResolution(resolution, videoFormat);
  const mode = normalizeKeyframeFitMode(fitMode);
  const vf =
    source.kind === "image"
      ? buildKeyframeFitFilter(res.width, res.height, mode)
      : `${buildContainImageFilter(res.width, res.height)},setsar=1`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (source.kind === "black") {
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${res.width}x${res.height}`,
      "-frames:v",
      "1",
      "-c:v",
      "png",
      outputPath,
    ]);
    return outputPath;
  }

  if (source.kind === "image") {
    await runFfmpeg([
      "-y",
      "-i",
      source.path,
      "-frames:v",
      "1",
      "-vf",
      vf,
      "-c:v",
      "png",
      outputPath,
    ]);
    return outputPath;
  }

  const seek = Math.max(0, source.seekSeconds);
  await runFfmpeg([
    "-y",
    "-ss",
    String(seek),
    "-i",
    source.path,
    "-frames:v",
    "1",
    "-vf",
    vf,
    "-c:v",
    "png",
    outputPath,
  ]);
  return outputPath;
}

/**
 * Letterbox or pillarbox a photo into the project's video format (16:9 or 9:16).
 * A square image stays square inside the frame — never stretched.
 * Returns the original buffer when ffmpeg is unavailable.
 */
export async function fitImageBufferToVideoFormat(
  input: { buffer: Buffer; ext: string },
  videoFormat: VideoFormat | unknown = "horizontal",
  fitMode: KeyframeFitMode | unknown = "cover",
): Promise<Buffer> {
  if (!hasFfmpeg() || input.buffer.length === 0) return input.buffer;

  if (isVideoMp4Buffer(input.buffer)) {
    throw new Error("Cannot use a video file as a keyframe. Choose a photo (JPG/PNG).");
  }

  const detectedExt = detectImageExt(input.buffer);
  const hintedExt = input.ext.toLowerCase().startsWith(".")
    ? input.ext.toLowerCase()
    : `.${input.ext.toLowerCase()}`;
  const ext = detectedExt ?? hintedExt;
  const { width, height } = keyframeCanvasSize(videoFormat);
  const mode = normalizeKeyframeFitMode(fitMode);
  const outExt = ext === ".png" ? ".png" : ".jpg";
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-image-frame",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in${ext}`);
  const outPath = path.join(tmpDir, `out${outExt}`);

  try {
    await fs.writeFile(inPath, input.buffer);
    const encodeArgs =
      outExt === ".png"
        ? ["-frames:v", "1", "-c:v", "png"]
        : ["-frames:v", "1", "-q:v", "2"];
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-vf",
      buildKeyframeFitFilter(width, height, mode),
      ...encodeArgs,
      outPath,
    ]);
    return await fs.readFile(outPath);
  } catch (err) {
    const ext = input.ext.toLowerCase().startsWith(".")
      ? input.ext.toLowerCase()
      : `.${input.ext.toLowerCase()}`;
    if (ext === ".webp" || ext === ".gif") {
      throw new Error(
        `Could not process this image (${ext}). Try JPG or PNG, or check that ffmpeg is installed correctly.`,
      );
    }
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Read pixel dimensions from PNG/JPEG headers (fast path; no ffprobe). */
export function readImagePixelSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  if (isPngBuffer(buffer)) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  if (isJpegBuffer(buffer)) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd8) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      if (marker === 0xc0 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Upscale (if needed) so image-to-video providers receive at least MIN_VIDEO_PROVIDER_FRAME_PIXELS.
 * Uses cover fit into the target aspect ratio canvas.
 */
export async function prepareImageBufferForVideoFrame(
  input: { buffer: Buffer; ext?: string },
  aspectRatio: string = "16:9",
): Promise<Buffer> {
  const jpeg = await convertImageBufferToJpeg(input);
  const dims = readImagePixelSize(jpeg);
  const target = minDimensionsForAspectRatio(aspectRatio);

  if (dims && !isImageSizeBelowProviderMinimum(dims.width, dims.height)) {
    return jpeg;
  }

  if (!hasFfmpeg()) {
    const label = `${target.width}×${target.height}`;
    throw new Error(
      `Keyframe image is too small for video generation (needs at least ${label} for ${aspectRatio}). ` +
        "Regenerate the keyframe or install ffmpeg on the server.",
    );
  }

  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-video-frame-upscale",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, "in.jpg");
  const outPath = path.join(tmpDir, "out.jpg");

  try {
    await fs.writeFile(inPath, jpeg);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-vf",
      buildCoverImageFilter(target.width, target.height),
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ]);
    const upscaled = await fs.readFile(outPath);
    if (!isJpegBuffer(upscaled)) {
      throw new Error(invalidKeyframeMessage(input.buffer));
    }
    return upscaled;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Crop/letterbox a photo into a social feed aspect ratio (4:5 or 1:1). */
export async function fitImageBufferToSocialAspect(
  input: { buffer: Buffer; ext: string },
  aspectRatio: SocialAspectRatio | unknown = "4:5",
): Promise<Buffer> {
  if (!hasFfmpeg() || input.buffer.length === 0) return input.buffer;

  if (isVideoMp4Buffer(input.buffer)) {
    throw new Error("Cannot use a video file as a slide image. Choose a photo (JPG/PNG).");
  }

  const spec = getSocialAspectRatioSpec(aspectRatio);
  const detectedExt = detectImageExt(input.buffer);
  const hintedExt = input.ext.toLowerCase().startsWith(".")
    ? input.ext.toLowerCase()
    : `.${input.ext.toLowerCase()}`;
  const ext = detectedExt ?? hintedExt;
  const outExt = ext === ".png" ? ".png" : ".jpg";
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-social-frame",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in${ext}`);
  const outPath = path.join(tmpDir, `out${outExt}`);

  try {
    await fs.writeFile(inPath, input.buffer);
    const encodeArgs =
      outExt === ".png"
        ? ["-frames:v", "1", "-c:v", "png"]
        : ["-frames:v", "1", "-q:v", "2"];
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-vf",
      buildCoverImageFilter(spec.width, spec.height),
      ...encodeArgs,
      outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** ISO BMFF major brand at bytes 8–12 when `ftyp` is at 4–8 (AVIF, HEIC, MP4, …). */
function isoBmffBrand(buffer: Buffer): string | null {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return null;
  return buffer.toString("ascii", 8, 12).toLowerCase();
}

/** Detect image format from magic bytes — returns null when unrecognized. */
export function detectImageExt(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }
  if (
    buffer.toString("ascii", 0, 6) === "GIF87a" ||
    buffer.toString("ascii", 0, 6) === "GIF89a"
  ) {
    return ".gif";
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return ".png";

  const brand = isoBmffBrand(buffer);
  if (brand) {
    if (brand.startsWith("avif") || brand === "avis") return ".avif";
    if (
      brand.startsWith("heic") ||
      brand.startsWith("heif") ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return ".heic";
    }
    return null;
  }

  return null;
}

export function isJpegBuffer(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

export function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50;
}

/** True for MP4/MOV video containers — not AVIF/HEIC still images (also use `ftyp`). */
export function isVideoMp4Buffer(buffer: Buffer): boolean {
  const brand = isoBmffBrand(buffer);
  if (!brand) return false;
  if (
    brand.startsWith("avif") ||
    brand === "avis" ||
    brand.startsWith("heic") ||
    brand.startsWith("heif") ||
    brand === "mif1" ||
    brand === "msf1"
  ) {
    return false;
  }
  return true;
}

/** @deprecated Prefer {@link isVideoMp4Buffer} — excludes AVIF/HEIC image containers. */
export function isMp4Buffer(buffer: Buffer): boolean {
  return isVideoMp4Buffer(buffer);
}

/** Grab the first frame from a video buffer as JPEG (image-to-video fallback). */
export async function extractFirstFrameFromVideoBuffer(buffer: Buffer): Promise<Buffer> {
  if (!isVideoMp4Buffer(buffer)) {
    throw new Error("Video buffer is not a valid MP4 file.");
  }
  if (!hasFfmpeg()) {
    throw new Error(
      "ffmpeg is required to extract a still from video. Install ffmpeg or upload a JPG/PNG keyframe.",
    );
  }

  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-video-frame-extract",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, "in.mp4");
  const outPath = path.join(tmpDir, "out.jpg");

  try {
    await fs.writeFile(inPath, buffer);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ]);
    const jpeg = await fs.readFile(outPath);
    if (!isJpegBuffer(jpeg)) {
      throw new Error("Could not extract a still frame from the video.");
    }
    return jpeg;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function resolveImageInputExt(buffer: Buffer, hintExt?: string): string {
  const fromMagic = detectImageExt(buffer);
  if (fromMagic) return fromMagic;

  const hint = hintExt?.toLowerCase();
  if (hint === ".jpeg") return ".jpg";
  if (hint && [".jpg", ".png", ".webp", ".gif", ".avif", ".heic"].includes(hint)) return hint;

  return ".bin";
}

function invalidKeyframeMessage(buffer: Buffer): string {
  return (
    "Keyframe image is invalid or corrupted. Regenerate the keyframe or upload a JPG/PNG file."
  );
}

/**
 * Kling (via OpenRouter) accepts JPEG/PNG for first-frame video generation.
 * WebP, GIF, and mislabeled files are converted to JPEG when ffmpeg is available.
 */
export async function convertImageBufferToJpeg(input: {
  buffer: Buffer;
  ext?: string;
}): Promise<Buffer> {
  if (input.buffer.length < 64) {
    throw new Error(invalidKeyframeMessage(input.buffer));
  }

  if (isJpegBuffer(input.buffer)) {
    return input.buffer;
  }

  if (isPngBuffer(input.buffer) && !hasFfmpeg()) {
    return input.buffer;
  }

  if (!hasFfmpeg()) {
    if (isPngBuffer(input.buffer)) return input.buffer;
    throw new Error(
      "This keyframe format is not supported for video generation. " +
        "Use JPG or PNG, or install ffmpeg on the server.",
    );
  }

  const normalizedExt = resolveImageInputExt(input.buffer, input.ext);
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-video-frame",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in${normalizedExt}`);
  const outPath = path.join(tmpDir, "out.jpg");

  try {
    await fs.writeFile(inPath, input.buffer);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ]);
    const jpeg = await fs.readFile(outPath);
    if (!isJpegBuffer(jpeg)) {
      throw new Error(invalidKeyframeMessage(input.buffer));
    }
    return jpeg;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Keyframe")) throw err;
    throw new Error(invalidKeyframeMessage(input.buffer));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Above this ffmpeg input count, mux each block first then concat (large timelines). */
const EXPORT_STAGED_INPUT_THRESHOLD = 32;

type ExportAudioSegment = {
  videoPath: string;
  audioPath: string;
  sceneAudioPath?: string | null;
  audioVolume?: number;
  sceneAudioVolume?: number;
  durationSeconds: number;
  audioTrimStart?: number;
  musicSwell?: boolean;
};

function countExportFfmpegInputs(
  segments: ExportAudioSegment[],
  hasMusic: boolean,
  hasMusic2: boolean,
): number {
  const sceneCount = segments.filter((s) => s.sceneAudioPath).length;
  return segments.length * 2 + sceneCount + (hasMusic ? 1 : 0) + (hasMusic2 ? 1 : 0);
}

function buildExportScaleFilter(res: ExportResolution, fps: number): string {
  return (
    `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${fps},format=yuv420p`
  );
}

function buildExportVideoEncodeArgs(encoding: ExportEncodingSettings): string[] {
  const args = [
    "-c:v",
    "libx264",
    "-preset",
    encoding.preset,
    "-crf",
    String(encoding.crf),
  ];
  if (encoding.maxVideoBitrateKbps != null && encoding.maxVideoBitrateKbps > 0) {
    const k = encoding.maxVideoBitrateKbps;
    args.push("-maxrate", `${k}k`, "-bufsize", `${k * 2}k`);
  }
  args.push("-pix_fmt", "yuv420p");
  return args;
}

function buildExportAudioEncodeArgs(encoding: ExportEncodingSettings): string[] {
  return ["-c:a", "aac", "-b:a", `${encoding.audioBitrateKbps}k`];
}

async function muxExportSegmentToFile(opts: {
  segment: ExportAudioSegment;
  outputPath: string;
  encoding: ExportEncodingSettings;
  fps: number;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
}): Promise<void> {
  const { segment, outputPath, encoding, fps, narrationVolume, sceneVolume, masterVolume } = opts;
  const dur = safeSegmentDurationSeconds(segment.durationSeconds);
  const scaleFilter = buildExportScaleFilter(encoding, fps);
  const args = ["-y", "-i", segment.videoPath, "-i", segment.audioPath];
  const filterParts: string[] = [];
  let sceneInputIdx: number | undefined;
  if (segment.sceneAudioPath) {
    args.push("-i", segment.sceneAudioPath);
    sceneInputIdx = 2;
  }

  const narrationGain = sanitizeGain(
    effectiveNarrationGain({
      blockVolume: segment.audioVolume,
      trackVolume: narrationVolume,
      masterVolume,
    }),
  );
  const audioStart = Math.max(0, segment.audioTrimStart ?? 0);
  filterParts.push(
    `[0:v]${scaleFilter},loop=loop=-1:size=32767:start=0,trim=duration=${dur},setpts=PTS-STARTPTS[vout]`,
  );
  filterParts.push(
    `[1:a]${ffmpegAudioBaseFilter()},volume=${narrationGain.toFixed(4)},atrim=start=${audioStart}:duration=${dur},asetpts=PTS-STARTPTS[narr]`,
  );

  let audioMap = "narr";
  if (sceneInputIdx !== undefined) {
    const sceneGain = sanitizeGain(
      effectiveSceneGain({
        blockVolume: segment.sceneAudioVolume,
        trackVolume: sceneVolume,
        masterVolume,
      }),
    );
    filterParts.push(
      `[${sceneInputIdx}:a]${ffmpegAudioBaseFilter()},volume=${sceneGain.toFixed(4)},atrim=duration=${dur},asetpts=PTS-STARTPTS[scene]`,
    );
    filterParts.push(
      `[narr][scene]amix=inputs=2:duration=first:dropout_transition=0,aresample=44100[aout]`,
    );
    audioMap = "aout";
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", "[vout]");
  args.push("-map", `[${audioMap}]`);
  args.push(...buildExportVideoEncodeArgs(encoding));
  args.push(...buildExportAudioEncodeArgs(encoding));
  args.push("-movflags", "+faststart", outputPath);
  await runFfmpeg(args);
}

async function concatBlocksWithAudioStaged(opts: {
  segments: ExportAudioSegment[];
  outputPath: string;
  musicPath?: string | null;
  music2Path?: string | null;
  musicVolume?: number;
  musicStartSeconds?: number;
  musicSpanSeconds?: number | null;
  music2TimelineStartSeconds?: number | null;
  music2FileStartSeconds?: number;
  music1DurationSeconds?: number | null;
  music2DurationSeconds?: number | null;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  resolution?: ExportResolutionId;
  quality?: ExportQualityId;
  videoFormat?: VideoFormat | unknown;
  captionsAssPath?: string | null;
  fps?: number;
  timelineBlocks?: MusicSwellTimelineBlock[];
  onProgress?: (fraction: number, message: string) => void;
}): Promise<void> {
  const {
    segments,
    outputPath,
    musicPath,
    music2Path = null,
    musicVolume,
    musicStartSeconds = 0,
    musicSpanSeconds = null,
    music2TimelineStartSeconds = null,
    music2FileStartSeconds = 0,
    music1DurationSeconds = null,
    music2DurationSeconds = null,
    narrationVolume,
    sceneVolume,
    masterVolume,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    quality = DEFAULT_EXPORT_QUALITY,
    videoFormat = "horizontal",
    captionsAssPath = null,
    fps = 30,
    timelineBlocks = [],
    onProgress,
  } = opts;
  if (segments.length === 0) throw new Error("No segments to export");

  const encoding = resolveExportEncoding(resolution, quality, videoFormat);
  const workDir = path.dirname(outputPath);
  await fs.mkdir(workDir, { recursive: true });

  const muxedPaths: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    onProgress?.(
      segments.length > 0 ? (i / segments.length) * 0.85 : 0,
      `Codificando bloco ${i + 1} de ${segments.length}…`,
    );
    const muxedPath = path.join(workDir, `export_mux_${i}.mp4`);
    await muxExportSegmentToFile({
      segment: segments[i]!,
      outputPath: muxedPath,
      encoding,
      fps,
      narrationVolume,
      sceneVolume,
      masterVolume,
    });
    muxedPaths.push(muxedPath);
  }

  onProgress?.(0.9, "Concatenando blocos e mixando áudio…");

  const args: string[] = ["-y"];
  for (const p of muxedPaths) args.push("-i", p);

  const hasMusic = !!musicPath;
  const hasMusic2 = Boolean(music2Path);
  let musicInputIdx = -1;
  let music2InputIdx = -1;
  let nextInput = muxedPaths.length;
  if (hasMusic) {
    musicInputIdx = nextInput;
    if (hasMusic2) {
      args.push("-i", musicPath!);
    } else {
      args.push("-stream_loop", "-1", "-i", musicPath!);
    }
    nextInput += 1;
  }
  if (hasMusic2) {
    music2InputIdx = nextInput;
    args.push("-stream_loop", "-1", "-i", music2Path!);
  }

  const totalVideoDuration = segments.reduce(
    (sum, seg) => sum + safeSegmentDurationSeconds(seg.durationSeconds),
    0,
  );
  const effectiveMusicSpan =
    normalizeMusicSpanSeconds(musicSpanSeconds) ?? totalVideoDuration;
  const musicFileStart = Math.max(0, musicStartSeconds);
  const music2FileStart = Math.max(0, music2FileStartSeconds);
  const music2TimelineStart = hasMusic2
    ? music2TimelineStartSeconds ??
      defaultMusic2TimelineStartSeconds(music1DurationSeconds ?? 0, musicFileStart)
    : null;

  const filterParts: string[] = [];
  const concatInputs = muxedPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
  filterParts.push(
    `${concatInputs}concat=n=${muxedPaths.length}:v=1:a=1[outv][outa]`,
  );

  const finalAudioLabel = appendExportFinalMusicMix({
    filterParts,
    hasMusic,
    musicInputIdx,
    music2InputIdx,
    hasMusic2,
    musicFileStart,
    music2FileStart,
    music2TimelineStart,
    music1DurationSeconds,
    music2DurationSeconds,
    mixDurationSeconds: Math.min(effectiveMusicSpan, totalVideoDuration),
    musicVolume,
    masterVolume,
    timelineBlocks,
  });

  let videoMapLabel = "outv";
  if (captionsAssPath) {
    const escaped = escapeFfmpegSubtitlesPath(captionsAssPath);
    filterParts.push(`[outv]subtitles='${escaped}'[outvc]`);
    videoMapLabel = "outvc";
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${videoMapLabel}]`);
  args.push("-map", `[${finalAudioLabel}]`);
  args.push(...buildExportVideoEncodeArgs(encoding));
  args.push(...buildExportAudioEncodeArgs(encoding));
  args.push("-shortest", "-movflags", "+faststart", outputPath);
  await runFfmpeg(args);
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
    /** Slice narration from this offset (continuous visual cuts). */
    audioTrimStart?: number;
    /** @deprecated use timeline swell ramp via timelineBlocks */
    musicSwell?: boolean;
  }>;
  /** Timeline blocks for smooth music swell ramps on export. */
  timelineBlocks?: MusicSwellTimelineBlock[];
  outputPath: string;
  musicPath?: string | null;
  music2Path?: string | null;
  musicVolume?: number;
  musicStartSeconds?: number;
  /** Null = use full video duration. */
  musicSpanSeconds?: number | null;
  music2TimelineStartSeconds?: number | null;
  music2FileStartSeconds?: number;
  music1DurationSeconds?: number | null;
  music2DurationSeconds?: number | null;
  narrationVolume?: number;
  sceneVolume?: number;
  masterVolume?: number;
  resolution?: ExportResolutionId;
  quality?: ExportQualityId;
  videoFormat?: VideoFormat | unknown;
  /** Optional ASS subtitle file burned into the exported video. */
  captionsAssPath?: string | null;
  fps?: number;
  onProgress?: (fraction: number, message: string) => void;
}): Promise<void> {
  const {
    segments,
    outputPath,
    musicPath,
    music2Path = null,
    musicVolume,
    musicStartSeconds = 0,
    musicSpanSeconds = null,
    music2TimelineStartSeconds = null,
    music2FileStartSeconds = 0,
    music1DurationSeconds = null,
    music2DurationSeconds = null,
    narrationVolume,
    sceneVolume,
    masterVolume,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    quality = DEFAULT_EXPORT_QUALITY,
    videoFormat = "horizontal",
    captionsAssPath = null,
    fps = 30,
    timelineBlocks = [],
    onProgress,
  } = opts;
  if (segments.length === 0) throw new Error("No segments to export");

  const inputCount = countExportFfmpegInputs(segments, !!musicPath, Boolean(music2Path));
  if (inputCount > EXPORT_STAGED_INPUT_THRESHOLD) {
    return concatBlocksWithAudioStaged(opts);
  }

  const encoding = resolveExportEncoding(resolution, quality, videoFormat);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  onProgress?.(0.05, "Preparando encode do vídeo…");

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
  const hasMusic2 = Boolean(music2Path);
  let musicInputIdx = -1;
  let music2InputIdx = -1;
  if (hasMusic) {
    musicInputIdx = nextInput;
    if (hasMusic2) {
      args.push("-i", musicPath!);
    } else {
      args.push("-stream_loop", "-1", "-i", musicPath!);
    }
    nextInput += 1;
  }
  if (hasMusic2) {
    music2InputIdx = nextInput;
    args.push("-stream_loop", "-1", "-i", music2Path!);
    nextInput += 1;
  }

  const scaleFilter = buildExportScaleFilter(encoding, fps);

  const filterParts: string[] = [];
  const totalVideoDuration = segments.reduce(
    (sum, seg) => sum + safeSegmentDurationSeconds(seg.durationSeconds),
    0,
  );
  const effectiveMusicSpan =
    normalizeMusicSpanSeconds(musicSpanSeconds) ?? totalVideoDuration;
  const musicFileStart = Math.max(0, musicStartSeconds);
  const music2FileStart = Math.max(0, music2FileStartSeconds);
  const music2TimelineStart = hasMusic2
    ? music2TimelineStartSeconds ??
      defaultMusic2TimelineStartSeconds(music1DurationSeconds ?? 0, musicFileStart)
    : null;
  for (let i = 0; i < segments.length; i++) {
    const vIdx = i * 2;
    const aIdx = vIdx + 1;
    const seg = segments[i];
    const dur = safeSegmentDurationSeconds(seg.durationSeconds);
    const narrationGain = sanitizeGain(
      effectiveNarrationGain({
        blockVolume: seg.audioVolume,
        trackVolume: narrationVolume,
        masterVolume,
      }),
    );
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
      const gain = sanitizeGain(
        effectiveSceneGain({
          blockVolume: seg.sceneAudioVolume,
          trackVolume: sceneVolume,
          masterVolume,
        }),
      );
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
    `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  );

  const finalAudioLabel = appendExportFinalMusicMix({
    filterParts,
    hasMusic,
    musicInputIdx,
    music2InputIdx,
    hasMusic2,
    musicFileStart,
    music2FileStart,
    music2TimelineStart,
    music1DurationSeconds,
    music2DurationSeconds,
    mixDurationSeconds: Math.min(effectiveMusicSpan, totalVideoDuration),
    musicVolume,
    masterVolume,
    timelineBlocks,
  });

  let videoMapLabel = "outv";
  if (captionsAssPath) {
    const escaped = escapeFfmpegSubtitlesPath(captionsAssPath);
    filterParts.push(`[outv]subtitles='${escaped}'[outvc]`);
    videoMapLabel = "outvc";
  }

  const filterComplex = filterParts.join(";");

  onProgress?.(0.85, "Finalizando encode…");

  args.push("-filter_complex", filterComplex);
  args.push("-map", `[${videoMapLabel}]`);
  args.push("-map", `[${finalAudioLabel}]`);
  args.push(...buildExportVideoEncodeArgs(encoding));
  args.push(...buildExportAudioEncodeArgs(encoding));
  args.push("-shortest", "-movflags", "+faststart", outputPath);

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

/** Transcode any supported in-memory clip to MP3 (browser-friendly for dub preview). */
export async function transcodeAudioBufferToMp3(input: {
  buffer: Buffer;
  filename: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const ext = path.extname(input.filename).toLowerCase() || ".mp3";
  const outName = input.filename.replace(/\.[^.]+$/, "") + ".mp3";
  if (ext === ".mp3" || input.buffer.length === 0) {
    return { buffer: input.buffer, filename: outName };
  }
  if (!hasFfmpeg()) {
    return { buffer: input.buffer, filename: input.filename };
  }

  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-audio-mp3",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in${ext}`);
  const outPath = path.join(tmpDir, "out.mp3");
  try {
    await fs.writeFile(inPath, input.buffer);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outPath,
    ]);
    const buffer = await fs.readFile(outPath);
    return { buffer, filename: outName };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Measure duration of an in-memory audio clip (requires ffprobe). */
export async function probeAudioBufferDurationSeconds(
  input: { buffer: Buffer; filename: string },
): Promise<number | null> {
  if (!hasFfmpeg() || input.buffer.length === 0) return null;
  const ext = path.extname(input.filename).toLowerCase() || ".mp3";
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-audio-probe",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `probe${ext}`);
  try {
    await fs.writeFile(inPath, input.buffer);
    const seconds = await getMediaDurationSeconds(inPath);
    return seconds > 0.05 ? seconds : null;
  } catch {
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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

/** Slow down (or speed up) audio to match a new duration — for scene audio paired with slow-mo video. */
export async function stretchAudioToDuration(
  inputPath: string,
  outputPath: string,
  sourceSeconds: number,
  targetSeconds: number,
): Promise<void> {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to stretch audio");
  }
  const tempo = sourceSeconds / Math.max(0.5, targetSeconds);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-filter:a",
    buildAtempoFilterChain(tempo),
    "-t",
    Math.max(0.5, targetSeconds).toFixed(3),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ]);
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

/**
 * Concatenate audio clips and silence gaps into one MP3. Requires ffmpeg.
 */
export type AudioConcatPiece =
  | { kind: "clip"; buffer: Buffer; filename: string }
  | { kind: "silence"; seconds: number };

export async function concatAudioPiecesToMp3(
  pieces: AudioConcatPiece[],
  opts: { bitrateKbps?: number } = {},
): Promise<Buffer> {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to concatenate audio");
  }
  if (pieces.length === 0) throw new Error("No audio parts to concatenate");

  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-script-mp3",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const filePaths: string[] = [];
    let clipIndex = 0;
    let silenceIndex = 0;

    for (const piece of pieces) {
      if (piece.kind === "silence") {
        const silenceSeconds = Math.max(0, piece.seconds);
        if (silenceSeconds <= 0) continue;
        const silencePath = path.join(tmpDir, `silence_${silenceIndex++}.mp3`);
        await runFfmpeg([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo",
          "-t",
          silenceSeconds.toFixed(2),
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          silencePath,
        ]);
        filePaths.push(silencePath);
        continue;
      }

      const ext = path.extname(piece.filename).toLowerCase() || ".mp3";
      const filePath = path.join(tmpDir, `part_${clipIndex++}${ext}`);
      await fs.writeFile(filePath, piece.buffer);
      filePaths.push(filePath);
    }

    if (filePaths.length === 0) throw new Error("No audio parts to concatenate");

    const args: string[] = ["-y"];
    for (const p of filePaths) args.push("-i", p);
    const filter =
      filePaths
        .map(
          (_, i) =>
            `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`,
        )
        .join(";") +
      ";" +
      filePaths.map((_, i) => `[a${i}]`).join("") +
      `concat=n=${filePaths.length}:v=0:a=1[aout]`;

    const outPath = path.join(tmpDir, "out.mp3");
    args.push(
      "-filter_complex",
      filter,
      "-map",
      "[aout]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${opts.bitrateKbps ?? 192}k`,
      outPath,
    );

    await runFfmpeg(args);
    return fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Concatenate a list of audio buffers into one MP3 file with optional silence
 * between clips. Returns the encoded MP3 as a Buffer. Requires ffmpeg.
 */
export async function concatAudioBuffersToMp3(
  parts: Array<{ buffer: Buffer; filename: string }>,
  opts: { silenceBetweenSeconds?: number; bitrateKbps?: number } = {},
): Promise<Buffer> {
  if (parts.length === 0) throw new Error("No audio parts to concatenate");
  const silenceSeconds = Math.max(0, opts.silenceBetweenSeconds ?? 0.35);
  const pieces: AudioConcatPiece[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i > 0 && silenceSeconds > 0) {
      pieces.push({ kind: "silence", seconds: silenceSeconds });
    }
    pieces.push({ kind: "clip", buffer: part.buffer, filename: part.filename });
  }
  return concatAudioPiecesToMp3(pieces, opts);
}

/** Cap audio length (e.g. narrator preview). Returns original buffer if ffmpeg is unavailable. */
export async function trimAudioBufferToMaxSeconds(
  input: { buffer: Buffer; filename: string },
  maxSeconds: number,
): Promise<Buffer> {
  if (!hasFfmpeg() || maxSeconds <= 0) return input.buffer;

  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-audio-trim",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const inExt = path.extname(input.filename).toLowerCase() || ".mp3";
    const inPath = path.join(tmpDir, `in${inExt}`);
    await fs.writeFile(inPath, input.buffer);
    const outPath = path.join(tmpDir, "out.mp3");
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-t",
      maxSeconds.toFixed(2),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outPath,
    ]);
    return fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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

/** Low-res silent proxy for in-app preview — not used for export. */
export async function createPreviewVideoFromFile(
  inputPath: string,
  outputPath: string,
  opts: { maxHeight?: number; crf?: number } = {},
): Promise<void> {
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg is required to create preview video");
  }

  const maxHeight = Math.max(144, opts.maxHeight ?? 360);
  const crf = opts.crf ?? 34;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-an",
    "-vf",
    `scale=-2:min(${maxHeight},ih):flags=fast_bilinear`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

/** Trim or loop a silent video clip to an exact target duration (seconds). */
export async function fitVideoToDuration(
  inputPath: string,
  outputPath: string,
  targetSeconds: number,
  mode: "loop" | "slow" = "loop",
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

  if (mode === "slow" && sourceDuration > 0) {
    const stretch = target / sourceDuration;
    if (stretch > 2.001) {
      throw new Error(
        `Clip too short for slow motion (${sourceDuration.toFixed(1)}s → ${target.toFixed(1)}s). Use loop instead.`,
      );
    }
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vf",
      `setpts=${stretch.toFixed(6)}*PTS`,
      "-t",
      target.toFixed(3),
      ...encodeArgs,
      outputPath,
    ]);
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

// -------------------------------------------------------------------------
// Dubbing helpers
// -------------------------------------------------------------------------

/**
 * Time-stretch (change speed while preserving pitch) an in-memory audio
 * buffer to hit a target duration. Clamps stretch to [minRatio, maxRatio] to
 * avoid distortion; returns the effective ratio applied and the stretched
 * buffer.
 */
export async function stretchAudioBufferToTargetDuration(input: {
  buffer: Buffer;
  filename: string;
  currentSeconds: number;
  targetSeconds: number;
  minRatio?: number;
  maxRatio?: number;
}): Promise<{
  buffer: Buffer;
  filename: string;
  ratio: number;
  durationSeconds: number;
}> {
  if (!hasFfmpeg()) throw new Error("ffmpeg is required to stretch audio");
  const minRatio = input.minRatio ?? 0.98;
  const maxRatio = input.maxRatio ?? 1.1;
  const rawRatio =
    input.currentSeconds > 0.05 && input.targetSeconds > 0.05
      ? input.currentSeconds / input.targetSeconds
      : 1;
  const outName = input.filename.replace(/\.[^.]+$/, "") + ".mp3";

  // TTS shorter than the slot — keep natural pace; never slow down to fill silence.
  if (rawRatio < minRatio) {
    const mp3 = await transcodeAudioBufferToMp3({
      buffer: input.buffer,
      filename: input.filename,
    });
    return {
      buffer: mp3.buffer,
      filename: mp3.filename,
      ratio: 1,
      durationSeconds: input.currentSeconds,
    };
  }

  const ratio = Math.min(maxRatio, Math.max(minRatio, rawRatio));
  if (Math.abs(ratio - 1) < 0.025) {
    const mp3 = await transcodeAudioBufferToMp3({
      buffer: input.buffer,
      filename: input.filename,
    });
    return {
      buffer: mp3.buffer,
      filename: mp3.filename,
      ratio: 1,
      durationSeconds: input.currentSeconds,
    };
  }

  const ext = path.extname(input.filename).toLowerCase() || ".mp3";
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-dub-stretch",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in${ext}`);
  const outPath = path.join(tmpDir, "out.mp3");
  const audioCodec = "libmp3lame";
  const runStretch = async (filter: string) => {
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-filter:a",
      filter,
      "-c:a",
      audioCodec,
      "-b:a",
      "192k",
      outPath,
    ]);
  };
  try {
    await fs.writeFile(inPath, input.buffer);
    // rubberband preserves voice formants much better than atempo for dubbing.
    try {
      await runStretch(`rubberband=tempo=${ratio.toFixed(4)}`);
    } catch {
      await runStretch(buildAtempoFilterChain(ratio));
    }
    const buffer = await fs.readFile(outPath);
    const durationSeconds =
      (await getMediaDurationSeconds(outPath).catch(() => 0)) ||
      input.currentSeconds / ratio;
    return { buffer, filename: outName, ratio, durationSeconds };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Render the final dubbed audio track by placing each dubbed segment at its
 * `startSeconds` position on a silent timeline, optionally mixing the original
 * audio at reduced gain behind the voice.
 */
export async function renderDubbedAudioTrack(input: {
  totalDurationSeconds: number;
  segments: Array<{
    startSeconds: number;
    /** Actual synthesized duration — used to detect and prevent overlap. */
    durationSeconds?: number;
    buffer: Buffer;
    filename: string;
  }>;
  originalAudio?: { buffer: Buffer; filename: string; gain: number } | null;
  outputFormat?: "mp3" | "m4a";
  /** Minimum gap between consecutive dubs when anti-overlap kicks in. */
  minGapSeconds?: number;
}): Promise<{
  buffer: Buffer;
  filename: string;
  durationSeconds: number;
  /** Report which segments had to be pushed later to avoid overlapping. */
  driftedSegments: number;
}> {
  if (!hasFfmpeg()) throw new Error("ffmpeg is required to render dubbed audio");

  const outFormat = input.outputFormat ?? "mp3";
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-dub-render",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Sort by original start and compute effective (anti-overlap) starts.
    const minGap = input.minGapSeconds ?? 0.05;
    const orderedIndices = input.segments
      .map((_, i) => i)
      .sort(
        (a, b) => input.segments[a].startSeconds - input.segments[b].startSeconds,
      );

    const effectiveStart = new Map<number, number>();
    let cursor = 0;
    let drifted = 0;
    for (const idx of orderedIndices) {
      const seg = input.segments[idx];
      const desired = Math.max(0, seg.startSeconds);
      const start = Math.max(desired, cursor);
      if (start > desired + 0.02) drifted += 1;
      effectiveStart.set(idx, start);
      const duration = Math.max(0.1, seg.durationSeconds ?? 0.5);
      cursor = start + duration + minGap;
    }

    const segPaths: Array<{ path: string; startSeconds: number }> = [];
    for (let i = 0; i < input.segments.length; i += 1) {
      const seg = input.segments[i];
      const ext = path.extname(seg.filename).toLowerCase() || ".mp3";
      const segPath = path.join(tmpDir, `seg${i}${ext}`);
      await fs.writeFile(segPath, seg.buffer);
      segPaths.push({
        path: segPath,
        startSeconds: effectiveStart.get(i) ?? seg.startSeconds,
      });
    }

    const bgPath = input.originalAudio
      ? path.join(
          tmpDir,
          `bg${path.extname(input.originalAudio.filename).toLowerCase() || ".mp3"}`,
        )
      : null;
    if (bgPath && input.originalAudio) {
      await fs.writeFile(bgPath, input.originalAudio.buffer);
    }

    const args: string[] = ["-y"];
    const inputs: string[] = [];

    for (const seg of segPaths) {
      args.push("-i", seg.path);
      inputs.push(seg.path);
    }
    if (bgPath) {
      args.push("-i", bgPath);
      inputs.push(bgPath);
    }

    const filterParts: string[] = [];
    const streamsToMix: string[] = [];

    for (let i = 0; i < segPaths.length; i += 1) {
      const delayMs = Math.max(0, Math.round(segPaths[i].startSeconds * 1000));
      const outLabel = `s${i}`;
      filterParts.push(
        `[${i}:a]adelay=${delayMs}|${delayMs},apad[${outLabel}]`,
      );
      streamsToMix.push(`[${outLabel}]`);
    }

    if (bgPath) {
      const bgIndex = segPaths.length;
      const gain = Math.min(
        1,
        Math.max(0, input.originalAudio?.gain ?? 0),
      );
      if (gain > 0.001) {
        filterParts.push(`[${bgIndex}:a]volume=${gain.toFixed(3)}[bg]`);
        streamsToMix.push(`[bg]`);
      }
    }

    let outputLabel = "mix";
    if (streamsToMix.length === 0) {
      // No segments — output silence
      const silencePath = path.join(tmpDir, `silence.${outFormat}`);
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=cl=stereo:r=44100`,
        "-t",
        Math.max(1, input.totalDurationSeconds).toFixed(3),
        outFormat === "mp3" ? "-c:a" : "-c:a",
        outFormat === "mp3" ? "libmp3lame" : "aac",
        "-b:a",
        "192k",
        silencePath,
      ]);
      const buf = await fs.readFile(silencePath);
      return {
        buffer: buf,
        filename: `dub.${outFormat}`,
        durationSeconds: input.totalDurationSeconds,
        driftedSegments: 0,
      };
    }

    if (streamsToMix.length === 1) {
      outputLabel = streamsToMix[0].replace(/[\[\]]/g, "");
    } else {
      filterParts.push(
        `${streamsToMix.join("")}amix=inputs=${streamsToMix.length}:duration=longest:normalize=0[${outputLabel}]`,
      );
    }

    const outPath = path.join(tmpDir, `out.${outFormat}`);
    args.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      `[${outputLabel}]`,
      "-t",
      Math.max(0.5, input.totalDurationSeconds).toFixed(3),
      "-c:a",
      outFormat === "mp3" ? "libmp3lame" : "aac",
      "-b:a",
      "192k",
      outPath,
    );

    await runFfmpeg(args);
    const buffer = await fs.readFile(outPath);
    const durationSeconds =
      (await getMediaDurationSeconds(outPath).catch(() => 0)) ||
      input.totalDurationSeconds;
    return {
      buffer,
      filename: `dub.${outFormat}`,
      durationSeconds,
      driftedSegments: drifted,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Mux a dubbed audio track onto the source video (copy video codec, encode
 * audio). Returns the resulting MP4 buffer.
 */
export async function muxDubbedAudioOntoVideo(input: {
  video: { buffer: Buffer; filename: string };
  audio: { buffer: Buffer; filename: string };
}): Promise<{ buffer: Buffer; filename: string }> {
  if (!hasFfmpeg()) throw new Error("ffmpeg is required to mux dubbed video");
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-dub-mux",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const videoExt =
    path.extname(input.video.filename).toLowerCase() || ".mp4";
  const audioExt =
    path.extname(input.audio.filename).toLowerCase() || ".mp3";
  const videoPath = path.join(tmpDir, `video${videoExt}`);
  const audioPath = path.join(tmpDir, `audio${audioExt}`);
  const outPath = path.join(tmpDir, `out.mp4`);
  try {
    await fs.writeFile(videoPath, input.video.buffer);
    await fs.writeFile(audioPath, input.audio.buffer);
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    const buffer = await fs.readFile(outPath);
    return { buffer, filename: "dubbed.mp4" };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract audio from an in-memory video buffer as MP3 (mono, 44.1kHz), which is
 * the format expected by STT engines. Returns null if no audio stream.
 */
export async function extractAudioBufferFromVideoBuffer(input: {
  buffer: Buffer;
  filename: string;
}): Promise<{ buffer: Buffer; filename: string; durationSeconds: number } | null> {
  if (!hasFfmpeg()) return null;
  const tmpDir = path.join(
    os.tmpdir(),
    "imagine-dub-extract",
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const videoExt = path.extname(input.filename).toLowerCase() || ".mp4";
  const videoPath = path.join(tmpDir, `video${videoExt}`);
  const outPath = path.join(tmpDir, `audio.mp3`);
  try {
    await fs.writeFile(videoPath, input.buffer);
    if (!(await videoHasAudioStream(videoPath))) return null;
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outPath,
    ]);
    const buffer = await fs.readFile(outPath);
    const durationSeconds =
      (await getMediaDurationSeconds(outPath).catch(() => 0)) || 0;
    return { buffer, filename: "source.mp3", durationSeconds };
  } catch {
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

