import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import type { Project } from "@/lib/db/schema";
import {
  ensureProjectDir,
  mediaFileExists,
  publicUrlFor,
  resolveMediaPath,
  saveBuffer,
} from "@/lib/storage";
import { isS3Enabled } from "@/lib/s3";
import {
  buildAssSubtitleContent,
  buildCaptionSegments,
  buildKaraokeCaptionSegments,
  normalizeCaptionMode,
  parseCaptionLayout,
} from "@/lib/captions";
import { writeAssSubtitleFile } from "@/lib/captions-server";
import {
  buildExportDownloadFilename,
  exportStorageFilename,
} from "@/lib/export-history";
import {
  buildCaptionTimelineBlocks,
  planExportAudio,
} from "@/lib/cut-pace";
import {
  resolveExportSegmentVideoPath,
  resolveExportVisualBlock,
} from "@/lib/export-visual-segment";
import { isStoryBlockPause } from "@/lib/script-pause";
import {
  concatBlocksWithAudio,
  createSilentWav,
  DEFAULT_EXPORT_RESOLUTION,
  getMediaDurationSeconds,
  hasFfmpeg,
  isExportQualityId,
  isExportResolutionId,
  resolveExportEncoding,
  resolveExportResolution,
  safeSegmentDurationSeconds,
} from "@/lib/ffmpeg";
import { DEFAULT_EXPORT_QUALITY } from "@/lib/export-quality";
import { updateExportProgress } from "@/lib/export-progress-server";
import type { ExportQualityId } from "@/lib/export-quality";
import type { ExportResolutionId } from "@/lib/export-resolutions";
import type { StoryBlock } from "@/lib/db/schema";

async function getOwnedProject(projectId: string, userId: string): Promise<Project | null> {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

interface ExportJobContext {
  exportId: string;
  project: Project;
  blocks: StoryBlock[];
  resolutionId: ExportResolutionId;
  qualityId: ExportQualityId;
}

async function executeProjectMp4Export(ctx: ExportJobContext): Promise<void> {
  const { exportId, project, blocks, resolutionId, qualityId } = ctx;
  const resolution = resolveExportResolution(resolutionId, project.videoFormat);
  const encoding = resolveExportEncoding(resolutionId, qualityId, project.videoFormat);
  const exportWarnings: string[] = [];

  const report = async (
    progressPercent: number,
    progressStage: Parameters<typeof updateExportProgress>[1]["progressStage"],
    progressMessage: string,
  ) => updateExportProgress(exportId, { progressPercent, progressStage, progressMessage });

  const dir = isS3Enabled()
    ? path.join(os.tmpdir(), "imagine-export", project.id)
    : await ensureProjectDir(project.id);
  await fs.mkdir(dir, { recursive: true });

  try {
    await report(2, "preparing", "Preparando exportação…");

    const segments = [];
    const blockTotal = blocks.length;
    for (let i = 0; i < blockTotal; i++) {
      const b = blocks[i]!;
      await report(
        5 + Math.round((i / blockTotal) * 38),
        "segments",
        `Montando bloco ${i + 1} de ${blockTotal}…`,
      );

      const videoPath = await resolveExportSegmentVideoPath({
        blocks,
        block: b,
        dir,
        resolution,
        videoFormat: project.videoFormat,
        warnings: exportWarnings,
      });
      const audioPlan = planExportAudio(blocks, b);
      let durationSeconds = safeSegmentDurationSeconds(b.durationSeconds);

      let audioPath: string;
      let audioTrimStart = 0;

      if (audioPlan) {
        audioPath = await resolveMediaPath(audioPlan.audioPath);
        audioTrimStart = audioPlan.audioTrimStart;
        try {
          const audioDuration = await getMediaDurationSeconds(audioPath);
          const available = Math.max(0, audioDuration - audioPlan.audioTrimStart);
          if (Number.isFinite(available) && available > 0) {
            durationSeconds = Math.max(
              durationSeconds,
              Math.min(available, durationSeconds),
            );
          }
        } catch {
          // keep block duration from timeline
        }
      } else {
        audioPath = await createSilentWav(
          path.join(dir, `silent_${b.id}.wav`),
          durationSeconds,
        );
      }

      const scenePath =
        b.sceneAudioUrl && (await mediaFileExists(b.sceneAudioUrl))
          ? await resolveMediaPath(b.sceneAudioUrl)
          : null;

      segments.push({
        videoPath,
        audioPath,
        sceneAudioPath: scenePath,
        audioVolume: b.audioVolume ?? 100,
        sceneAudioVolume: b.sceneAudioVolume ?? 60,
        durationSeconds,
        audioTrimStart,
        musicSwell: isStoryBlockPause(b),
      });
    }

    await report(46, "preparing", "Carregando trilhas de áudio…");

    const musicPath =
      project.musicUrl && (await mediaFileExists(project.musicUrl))
        ? await resolveMediaPath(project.musicUrl)
        : null;
    const music2Path =
      project.music2Url && (await mediaFileExists(project.music2Url))
        ? await resolveMediaPath(project.music2Url)
        : null;
    let music1DurationSeconds: number | null = null;
    let music2DurationSeconds: number | null = null;
    if (musicPath) {
      try {
        music1DurationSeconds = await getMediaDurationSeconds(musicPath);
      } catch {
        music1DurationSeconds = null;
      }
    }
    if (music2Path) {
      try {
        music2DurationSeconds = await getMediaDurationSeconds(music2Path);
      } catch {
        music2DurationSeconds = null;
      }
    }

    const exportFilename = exportStorageFilename(exportId);
    const outputPath = path.join(dir, exportFilename);
    const captionMode = normalizeCaptionMode(project.captionMode);
    const captionLayout = parseCaptionLayout(captionMode);
    let captionsAssPath: string | null = null;
    if (captionLayout.enabled) {
      await report(48, "captions", "Gerando legendas…");
      const blockInputs = buildCaptionTimelineBlocks(
        blocks,
        segments.map((s) => s.durationSeconds),
      );
      const captionSegments = captionLayout.karaoke
        ? buildKaraokeCaptionSegments(blockInputs)
        : buildCaptionSegments(blockInputs);
      if (captionSegments.length > 0) {
        const assContent = buildAssSubtitleContent({
          segments: captionSegments,
          width: resolution.width,
          height: resolution.height,
          position: captionLayout.position,
          videoFormat: project.videoFormat,
        });
        captionsAssPath = await writeAssSubtitleFile(
          path.join(dir, `captions_${resolution.id}.ass`),
          assContent,
        );
      }
    }

    await report(52, "encoding", "Codificando vídeo final…");
    await concatBlocksWithAudio({
      segments,
      outputPath,
      musicPath,
      music2Path,
      musicVolume: project.musicVolume ?? 30,
      musicStartSeconds: project.musicStartSeconds ?? 0,
      musicSpanSeconds: project.musicSpanSeconds ?? null,
      music2TimelineStartSeconds: project.music2TimelineStartSeconds ?? null,
      music2FileStartSeconds: project.music2FileStartSeconds ?? 0,
      music1DurationSeconds,
      music2DurationSeconds,
      narrationVolume: project.narrationVolume ?? 100,
      sceneVolume: project.sceneVolume ?? 60,
      masterVolume: project.masterVolume ?? 100,
      resolution: resolution.id,
      quality: qualityId,
      videoFormat: project.videoFormat,
      captionsAssPath,
      timelineBlocks: blocks,
      onProgress: (fraction, message) => {
        void report(52 + Math.round(fraction * 38), "encoding", message);
      },
    });

    if (!fsSync.existsSync(outputPath) || fsSync.statSync(outputPath).size < 1024) {
      throw new Error("Export finished but the MP4 file is empty or missing.");
    }

    await report(93, "upload", "Salvando arquivo…");
    const url = isS3Enabled()
      ? await saveBuffer(
          project.id,
          null,
          exportFilename,
          await fs.readFile(outputPath),
        )
      : publicUrlFor(outputPath);

    await db
      .update(schema.exports)
      .set({
        status: "done",
        finalVideoUrl: url,
        resolution: resolution.id,
        quality: qualityId,
        progressPercent: 100,
        progressStage: "done",
        progressMessage: "Exportação concluída",
        errorMessage: exportWarnings.length > 0 ? exportWarnings.join("; ") : null,
      })
      .where(eq(schema.exports.id, exportId));
    await db
      .update(schema.projects)
      .set({ status: "exported", updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    console.error(`[export] project=${project.id} exportId=${exportId} failed:`, msg);
    await db
      .update(schema.exports)
      .set({
        status: "error",
        errorMessage: msg,
        progressMessage: "Exportação falhou",
      })
      .where(eq(schema.exports.id, exportId))
      .catch(() => {});
  }
}

export async function runProjectMp4Export(
  req: NextRequest,
  projectId: string,
): Promise<NextResponse> {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trimmedId = projectId?.trim();
  if (!trimmedId) {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  const project = await getOwnedProject(trimmedId, userId);
  if (!project) {
    return NextResponse.json(
      {
        error: "Project not found or you do not have access.",
        projectId: trimmedId,
      },
      { status: 404 },
    );
  }

  if (!hasFfmpeg()) {
    return NextResponse.json(
      {
        error:
          "ffmpeg is required to export MP4. Install ffmpeg on the server (e.g. apt install ffmpeg) and restart the app.",
      },
      { status: 503 },
    );
  }

  let resolutionId = DEFAULT_EXPORT_RESOLUTION;
  let qualityId = DEFAULT_EXPORT_QUALITY;
  try {
    const body = await req.json().catch(() => null);
    const candidate = body?.resolution ?? new URL(req.url).searchParams.get("resolution");
    if (isExportResolutionId(candidate)) resolutionId = candidate;
    const qualityCandidate = body?.quality ?? new URL(req.url).searchParams.get("quality");
    if (isExportQualityId(qualityCandidate)) qualityId = qualityCandidate;
  } catch {
    // ignore malformed body / url parsing
  }
  const resolution = resolveExportResolution(resolutionId, project.videoFormat);
  const encoding = resolveExportEncoding(resolutionId, qualityId, project.videoFormat);

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  if (blocks.length === 0) {
    return NextResponse.json({ error: "Add at least one block before export." }, { status: 400 });
  }

  const missingFiles: string[] = [];
  for (const [index, block] of blocks.entries()) {
    const visual = resolveExportVisualBlock(blocks, block);
    if (visual.videoUrl?.trim() && !(await mediaFileExists(visual.videoUrl))) {
      missingFiles.push(`block ${index + 1} video file`);
    } else if (
      !visual.videoUrl?.trim() &&
      visual.keyframeUrl?.trim() &&
      !(await mediaFileExists(visual.keyframeUrl))
    ) {
      missingFiles.push(`block ${index + 1} keyframe file`);
    }
    if (block.audioUrl && !(await mediaFileExists(block.audioUrl))) {
      missingFiles.push(`block ${index + 1} narration file`);
    }
  }
  if (project.musicUrl && !(await mediaFileExists(project.musicUrl))) {
    missingFiles.push("background music file");
  }
  if (project.music2Url && !(await mediaFileExists(project.music2Url))) {
    missingFiles.push("second background music file");
  }

  if (missingFiles.length > 0) {
    return NextResponse.json(
      {
        error: `Media files missing on disk: ${missingFiles.slice(0, 6).join(", ")}${
          missingFiles.length > 6 ? ` (+${missingFiles.length - 6} more)` : ""
        }. Regenerate the affected blocks and try again.`,
        missingFiles,
      },
      { status: 400 },
    );
  }

  const exportId = createId();
  const now = new Date();

  await db.insert(schema.exports).values({
    id: exportId,
    projectId: project.id,
    status: "running",
    resolution: resolution.id,
    quality: qualityId,
    progressPercent: 0,
    progressStage: "preparing",
    progressMessage: "Iniciando exportação…",
    createdAt: now,
  });

  void executeProjectMp4Export({
    exportId,
    project,
    blocks,
    resolutionId,
    qualityId,
  });

  return NextResponse.json({
    ok: true,
    async: true,
    exportId,
    status: "running",
    resolution: resolution.id,
    resolutionLabel: `${resolution.label} · ${encoding.qualityLabel}`,
    quality: qualityId,
    qualityLabel: encoding.qualityLabel,
  });
}
