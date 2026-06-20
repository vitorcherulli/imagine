import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import path from "node:path";
import fs from "node:fs";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { absoluteFromPublicUrl, ensureProjectDir, publicUrlFor } from "@/lib/storage";
import {
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_RESOLUTIONS,
  concatBlocksWithAudio,
  getMediaDurationSeconds,
  hasFfmpeg,
  isExportResolutionId,
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

function mediaFileExists(publicUrl: string | null | undefined): boolean {
  if (!publicUrl) return false;
  try {
    return fs.existsSync(absoluteFromPublicUrl(publicUrl));
  } catch {
    return false;
  }
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
  const resolution = EXPORT_RESOLUTIONS[resolutionId];

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
      missingAudio: !b.audioUrl,
    }))
    .filter((b) => b.missingVideo || b.missingAudio);

  if (incomplete.length > 0) {
    const summary = incomplete
      .slice(0, 5)
      .map((b) => {
        const parts: string[] = [];
        if (b.missingVideo) parts.push("video");
        if (b.missingAudio) parts.push("narration");
        return `block ${b.index} (${parts.join(" + ")})`;
      })
      .join(", ");
    const suffix = incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : "";
    return NextResponse.json(
      {
        error: `Every block needs video and narration before export. Missing: ${summary}${suffix}.`,
        incompleteBlocks: incomplete,
      },
      { status: 400 },
    );
  }

  const missingFiles: string[] = [];
  for (const [index, block] of blocks.entries()) {
    if (!mediaFileExists(block.videoUrl)) {
      missingFiles.push(`block ${index + 1} video file`);
    }
    if (!mediaFileExists(block.audioUrl)) {
      missingFiles.push(`block ${index + 1} narration file`);
    }
  }
  if (project.musicUrl && !mediaFileExists(project.musicUrl)) {
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

  const segments = await Promise.all(
    blocks.map(async (b) => {
      const videoPath = absoluteFromPublicUrl(b.videoUrl!);
      const audioPath = absoluteFromPublicUrl(b.audioUrl!);
      let durationSeconds = b.durationSeconds;
      try {
        const audioDuration = await getMediaDurationSeconds(audioPath);
        durationSeconds = Math.max(durationSeconds, audioDuration);
      } catch {
        // keep block duration from timeline
      }

      const scenePath =
        b.sceneAudioUrl && mediaFileExists(b.sceneAudioUrl)
          ? absoluteFromPublicUrl(b.sceneAudioUrl)
          : null;

      return {
        videoPath,
        audioPath,
        sceneAudioPath: scenePath,
        audioVolume: b.audioVolume ?? 100,
        sceneAudioVolume: b.sceneAudioVolume ?? 60,
        durationSeconds,
      };
    }),
  );

  const dir = await ensureProjectDir(project.id);
  const exportId = createId();
  const now = new Date();

  await db.insert(schema.exports).values({
    id: exportId,
    projectId: project.id,
    status: "running",
    createdAt: now,
  });

  try {
    const musicPath =
      project.musicUrl && mediaFileExists(project.musicUrl)
        ? absoluteFromPublicUrl(project.musicUrl)
        : null;

    const outputPath = path.join(dir, `final_${resolution.id}.mp4`);
    await concatBlocksWithAudio({
      segments,
      outputPath,
      musicPath,
      musicVolume: project.musicVolume ?? 30,
      narrationVolume: project.narrationVolume ?? 100,
      sceneVolume: project.sceneVolume ?? 60,
      masterVolume: project.masterVolume ?? 100,
      resolution: resolution.id,
    });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
      throw new Error("Export finished but the MP4 file is empty or missing.");
    }

    const url = publicUrlFor(outputPath);
    await db
      .update(schema.exports)
      .set({ status: "done", finalVideoUrl: url })
      .where(eq(schema.exports.id, exportId));
    await db
      .update(schema.projects)
      .set({ status: "exported", updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id));

    return NextResponse.json({
      ok: true,
      finalVideoUrl: url,
      mode: "video",
      resolution: resolution.id,
      resolutionLabel: resolution.label,
      downloadFilename: `${sanitizeFilename(project.title)}-${resolution.id}.mp4`,
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

function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "export";
}
