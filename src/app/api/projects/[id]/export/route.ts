import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { absoluteFromPublicUrl, ensureProjectDir, mediaFileExists, publicUrlFor, resolveMediaPath, saveBuffer, assertReadableMediaFile } from "@/lib/storage";
import { isS3Enabled } from "@/lib/s3";
import os from "node:os";
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
  concatBlocksWithAudio,
  createSilentWav,
  DEFAULT_EXPORT_RESOLUTION,
  getMediaDurationSeconds,
  hasFfmpeg,
  isExportResolutionId,
  resolveExportResolution,
} from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  try {
    const body = await req.json().catch(() => null);
    const candidate = body?.resolution ?? new URL(req.url).searchParams.get("resolution");
    if (isExportResolutionId(candidate)) resolutionId = candidate;
  } catch {
    // ignore malformed body / url parsing
  }
  const resolution = resolveExportResolution(resolutionId, project.videoFormat);

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  if (blocks.length === 0) {
    return NextResponse.json({ error: "Add at least one block before export." }, { status: 400 });
  }

  const incomplete = blocks
    .map((b, index) => ({
      index: index + 1,
      missingVideo: !b.videoUrl,
    }))
    .filter((b) => b.missingVideo);

  if (incomplete.length > 0) {
    const summary = incomplete
      .slice(0, 5)
      .map((b) => `block ${b.index}`)
      .join(", ");
    const suffix = incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : "";
    return NextResponse.json(
      {
        error: `Every block needs video before export. Missing video: ${summary}${suffix}.`,
        incompleteBlocks: incomplete,
      },
      { status: 400 },
    );
  }

  const missingFiles: string[] = [];
  for (const [index, block] of blocks.entries()) {
    if (!(await mediaFileExists(block.videoUrl))) {
      missingFiles.push(`block ${index + 1} video file`);
    }
    if (block.audioUrl && !(await mediaFileExists(block.audioUrl))) {
      missingFiles.push(`block ${index + 1} narration file`);
    }
  }
  if (project.musicUrl && !(await mediaFileExists(project.musicUrl))) {
    missingFiles.push("background music file");
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

  const dir = isS3Enabled()
    ? path.join(os.tmpdir(), "imagine-export", project.id)
    : await ensureProjectDir(project.id);
  await fs.mkdir(dir, { recursive: true });

  const segments = await Promise.all(
    blocks.map(async (b) => {
      const videoPath = await resolveMediaPath(b.videoUrl!);
      await assertReadableMediaFile(videoPath, `Block video (${b.position + 1})`);
      const audioPlan = planExportAudio(blocks, b);
      let durationSeconds = b.durationSeconds;

      let audioPath: string;
      let audioTrimStart = 0;

      if (audioPlan) {
        audioPath = await resolveMediaPath(audioPlan.audioPath);
        audioTrimStart = audioPlan.audioTrimStart;
        try {
          const audioDuration = await getMediaDurationSeconds(audioPath);
          const available = Math.max(0, audioDuration - audioPlan.audioTrimStart);
          durationSeconds = Math.max(durationSeconds, Math.min(available, durationSeconds));
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

      return {
        videoPath,
        audioPath,
        sceneAudioPath: scenePath,
        audioVolume: b.audioVolume ?? 100,
        sceneAudioVolume: b.sceneAudioVolume ?? 60,
        durationSeconds,
        audioTrimStart,
      };
    }),
  );

  const exportId = createId();
  const now = new Date();

  await db.insert(schema.exports).values({
    id: exportId,
    projectId: project.id,
    status: "running",
    resolution: resolution.id,
    createdAt: now,
  });

  try {
    const musicPath =
      project.musicUrl && (await mediaFileExists(project.musicUrl))
        ? await resolveMediaPath(project.musicUrl)
        : null;

    const exportFilename = exportStorageFilename(exportId);
    const outputPath = path.join(dir, exportFilename);
    const captionMode = normalizeCaptionMode(project.captionMode);
    const captionLayout = parseCaptionLayout(captionMode);
    let captionsAssPath: string | null = null;
    if (captionLayout.enabled) {
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

    await concatBlocksWithAudio({
      segments,
      outputPath,
      musicPath,
      musicVolume: project.musicVolume ?? 30,
      narrationVolume: project.narrationVolume ?? 100,
      sceneVolume: project.sceneVolume ?? 60,
      masterVolume: project.masterVolume ?? 100,
      resolution: resolution.id,
      videoFormat: project.videoFormat,
      captionsAssPath,
    });

    if (!fsSync.existsSync(outputPath) || fsSync.statSync(outputPath).size < 1024) {
      throw new Error("Export finished but the MP4 file is empty or missing.");
    }

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
      .set({ status: "done", finalVideoUrl: url, resolution: resolution.id })
      .where(eq(schema.exports.id, exportId));
    await db
      .update(schema.projects)
      .set({ status: "exported", updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id));

    const priorDone = await db
      .select({ id: schema.exports.id })
      .from(schema.exports)
      .where(
        and(
          eq(schema.exports.projectId, project.id),
          eq(schema.exports.status, "done"),
        ),
      );
    const version = priorDone.length + 1;

    return NextResponse.json({
      ok: true,
      exportId,
      finalVideoUrl: url,
      mode: "video",
      resolution: resolution.id,
      resolutionLabel: resolution.label,
      version,
      downloadFilename: buildExportDownloadFilename(project.title, version, resolution.id),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    await db
      .update(schema.exports)
      .set({ status: "error", errorMessage: msg })
      .where(eq(schema.exports.id, exportId));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
