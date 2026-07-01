import path from "node:path";
import type { Project, StoryBlock } from "@/lib/db/schema";
import {
  createBlackSegmentVideo,
  createStillSegmentVideo,
  safeSegmentDurationSeconds,
  type ExportResolution,
} from "@/lib/ffmpeg";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "@/lib/script-pause";
import {
  assertReadableMediaFile,
  describeMediaUrlIssue,
  isValidImageMediaUrl,
  isValidVideoMediaUrl,
  mediaFileExists,
  resolveMediaPath,
} from "@/lib/storage";

export function resolveExportVisualBlock(blocks: StoryBlock[], block: StoryBlock): StoryBlock {
  return isStoryBlockPause(block) ? resolveNeighborVisualBlock(blocks, block) : block;
}

function blockLabel(block: StoryBlock): string {
  return `block ${block.position + 1}`;
}

function mediaBasename(url: string): string {
  const pathOnly = url.split("?")[0].split("#")[0] ?? "";
  return pathOnly.split("/").pop() ?? url;
}

export async function resolveExportSegmentVideoPath(input: {
  blocks: StoryBlock[];
  block: StoryBlock;
  dir: string;
  resolution: ExportResolution;
  videoFormat: Project["videoFormat"];
  warnings?: string[];
}): Promise<string> {
  const { blocks, block, dir, resolution, videoFormat, warnings } = input;
  const visual = resolveExportVisualBlock(blocks, block);
  const durationSeconds = safeSegmentDurationSeconds(block.durationSeconds);
  const label = blockLabel(block);

  const videoUrl = visual.videoUrl?.trim();
  if (videoUrl && (await mediaFileExists(videoUrl))) {
    if (await isValidVideoMediaUrl(videoUrl)) {
      const videoPath = await resolveMediaPath(videoUrl);
      await assertReadableMediaFile(videoPath, `Block video (${label})`);
      return videoPath;
    }
    const issue = (await describeMediaUrlIssue(videoUrl)) ?? "invalid";
    warnings?.push(
      `${label}: skipped corrupt video (${mediaBasename(videoUrl)}: ${issue})`,
    );
  }

  const keyframeUrl = visual.keyframeUrl?.trim();
  if (keyframeUrl && (await mediaFileExists(keyframeUrl))) {
    if (await isValidImageMediaUrl(keyframeUrl)) {
      const imagePath = await resolveMediaPath(keyframeUrl);
      await assertReadableMediaFile(imagePath, `Block keyframe (${label})`);
      try {
        return await createStillSegmentVideo({
          imagePath,
          outputPath: path.join(dir, `still_${block.id}.mp4`),
          durationSeconds,
          resolution: resolution.id,
          videoFormat,
          fitMode: visual.keyframeFitMode,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        warnings?.push(
          `${label}: keyframe ${mediaBasename(keyframeUrl)} failed to encode (${detail})`,
        );
      }
    } else {
      const issue = (await describeMediaUrlIssue(keyframeUrl)) ?? "invalid";
      warnings?.push(
        `${label}: skipped corrupt keyframe (${mediaBasename(keyframeUrl)}: ${issue})`,
      );
    }
  }

  warnings?.push(`${label}: using black frame (no usable video or keyframe)`);
  return createBlackSegmentVideo({
    outputPath: path.join(dir, `black_${block.id}.mp4`),
    durationSeconds,
    resolution: resolution.id,
    videoFormat,
  });
}
