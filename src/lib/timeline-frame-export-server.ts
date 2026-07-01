import path from "node:path";
import fs from "node:fs/promises";
import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  DEFAULT_EXPORT_RESOLUTION,
  exportTimelineFramePng,
  getMediaDurationSeconds,
  hasFfmpeg,
  resolveExportResolution,
  type ExportResolutionId,
  type TimelineFrameSource,
} from "@/lib/ffmpeg";
import { sanitizeExportFilename } from "@/lib/export-history";
import { resolveExportVisualBlock } from "@/lib/export-visual-segment";
import { resolveTimelineVisualAtTime } from "@/lib/timeline-preview-media";
import {
  isValidImageMediaUrl,
  isValidVideoMediaUrl,
  mediaFileExists,
  resolveMediaPath,
} from "@/lib/storage";

export interface TimelineFrameExportResult {
  outputPath: string;
  downloadFilename: string;
  blockPosition: number;
  timeSeconds: number;
  source: TimelineFrameSource["kind"];
  resolution: ExportResolutionId;
  resolutionLabel: string;
}

function formatFrameTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const frac = Math.round((seconds - Math.floor(seconds)) * 100);
  const base = `${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`;
  return frac > 0 ? `${base}-${frac.toString().padStart(2, "0")}` : base;
}

export function buildFrameExportDownloadFilename(
  projectTitle: string,
  blockPosition: number,
  timeSeconds: number,
  resolution: ExportResolutionId,
): string {
  const base = sanitizeExportFilename(projectTitle);
  const tc = formatFrameTimecode(timeSeconds);
  return `${base}-frame-b${blockPosition + 1}-${tc}-${resolution}.png`;
}

async function resolveLoopedSeekSeconds(videoPath: string, localOffset: number): Promise<number> {
  const offset = Math.max(0, localOffset);
  try {
    const duration = await getMediaDurationSeconds(videoPath);
    if (Number.isFinite(duration) && duration > 0.05) {
      return offset % duration;
    }
  } catch {
    // keep raw offset
  }
  return offset;
}

export async function exportTimelineFrameAtTime(input: {
  project: Project;
  blocks: StoryBlock[];
  timeSeconds: number;
  resolutionId?: ExportResolutionId;
  workDir: string;
}): Promise<TimelineFrameExportResult> {
  if (!hasFfmpeg()) {
    throw new Error(
      "ffmpeg is required to export frames. Install ffmpeg on the server and restart the app.",
    );
  }

  const { project, blocks, timeSeconds, workDir } = input;
  const resolutionId = input.resolutionId ?? DEFAULT_EXPORT_RESOLUTION;
  const resolution = resolveExportResolution(resolutionId, project.videoFormat);
  const clampedTime = Math.max(0, timeSeconds);

  const hit = resolveTimelineVisualAtTime(blocks, clampedTime);
  if (!hit) {
    throw new Error("Move the playhead onto the timeline before exporting a frame.");
  }

  const visual = resolveExportVisualBlock(blocks, hit.block);
  const outputPath = path.join(
    workDir,
    `frame_${hit.block.id}_${Math.round(clampedTime * 1000)}.png`,
  );

  let source: TimelineFrameSource = { kind: "black" };
  const videoUrl = visual.videoUrl?.trim();
  if (videoUrl && (await mediaFileExists(videoUrl)) && (await isValidVideoMediaUrl(videoUrl))) {
    const videoPath = await resolveMediaPath(videoUrl);
    const seekSeconds = await resolveLoopedSeekSeconds(videoPath, hit.localOffset);
    source = { kind: "video", path: videoPath, seekSeconds };
  } else {
    const keyframeUrl = visual.keyframeUrl?.trim();
    if (
      keyframeUrl &&
      (await mediaFileExists(keyframeUrl)) &&
      (await isValidImageMediaUrl(keyframeUrl))
    ) {
      source = { kind: "image", path: await resolveMediaPath(keyframeUrl) };
    }
  }

  await exportTimelineFramePng({
    outputPath,
    resolution: resolutionId,
    videoFormat: project.videoFormat,
    fitMode: visual.keyframeFitMode,
    source,
  });

  const stat = await fs.stat(outputPath);
  if (stat.size < 64) {
    throw new Error("Frame export finished but the PNG file is empty.");
  }

  return {
    outputPath,
    downloadFilename: buildFrameExportDownloadFilename(
      project.title,
      hit.block.position,
      clampedTime,
      resolutionId,
    ),
    blockPosition: hit.block.position,
    timeSeconds: clampedTime,
    source: source.kind,
    resolution: resolutionId,
    resolutionLabel: resolution.label,
  };
}
