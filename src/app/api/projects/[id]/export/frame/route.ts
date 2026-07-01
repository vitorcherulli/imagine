import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isExportResolutionId } from "@/lib/ffmpeg";
import { exportTimelineFrameAtTime } from "@/lib/timeline-frame-export-server";
import { isS3Enabled } from "@/lib/s3";
import { ensureProjectDir, publicUrlFor, saveBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  timeSeconds: z.number().min(0),
  resolution: z.string().optional(),
});

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const resolutionId = isExportResolutionId(parsed.data.resolution)
    ? parsed.data.resolution
    : undefined;

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  if (blocks.length === 0) {
    return NextResponse.json({ error: "Add blocks to the timeline first." }, { status: 400 });
  }

  const workDir = isS3Enabled()
    ? path.join(os.tmpdir(), "imagine-frame-export", project.id)
    : path.join(await ensureProjectDir(project.id), "frames");
  await fs.mkdir(workDir, { recursive: true });

  try {
    const result = await exportTimelineFrameAtTime({
      project,
      blocks,
      timeSeconds: parsed.data.timeSeconds,
      resolutionId,
      workDir,
    });

    const png = await fs.readFile(result.outputPath);
    const downloadUrl = isS3Enabled()
      ? await saveBuffer(project.id, null, `frames/${result.downloadFilename}`, png)
      : publicUrlFor(result.outputPath);

    if (!isS3Enabled()) {
      const stablePath = path.join(workDir, result.downloadFilename);
      if (stablePath !== result.outputPath) {
        await fs.copyFile(result.outputPath, stablePath).catch(() => {});
      }
    }

    return NextResponse.json({
      ok: true,
      downloadUrl,
      downloadFilename: result.downloadFilename,
      blockPosition: result.blockPosition,
      timeSeconds: result.timeSeconds,
      source: result.source,
      resolution: result.resolution,
      resolutionLabel: result.resolutionLabel,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not export frame" },
      { status: 500 },
    );
  }
}
