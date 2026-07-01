import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import path from "node:path";
import fs from "node:fs/promises";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  assertReadableMediaFile,
  ensureProjectDir,
  mediaFileExists,
  publicUrlFor,
  resolveMediaPath,
  saveBuffer,
} from "@/lib/storage";
import { isS3Enabled } from "@/lib/s3";
import os from "node:os";
import {
  buildPremierePackPlan,
  createPremierePackZip,
  probePremiereAssets,
} from "@/lib/premiere-pack-export";
import { premierePackReadiness } from "@/lib/premiere-pack-readiness";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getOwnedProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, project.id))
    .orderBy(asc(schema.storyBlocks.position));

  const readiness = premierePackReadiness(blocks, project.musicUrl);
  if (!readiness.ok) {
    return NextResponse.json({ error: readiness.reason }, { status: 400 });
  }

  const resolveAssetPath = async (mediaUrl: string) => {
    const filePath = await resolveMediaPath(mediaUrl);
    await assertReadableMediaFile(filePath, path.basename(mediaUrl));
    return filePath;
  };

  const draftPlan = buildPremierePackPlan({ project, blocks });

  const missing: string[] = [];
  for (const asset of draftPlan.assets) {
    if (!(await mediaFileExists(asset.mediaUrl))) {
      missing.push(asset.zipPath);
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Some media files are missing on disk (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}). Regenerate affected blocks and try again.`,
      },
      { status: 400 },
    );
  }

  const assetMetaByZipPath = await probePremiereAssets(draftPlan.assets, resolveAssetPath);
  const plan = buildPremierePackPlan({ project, blocks, assetMetaByZipPath });

  try {
    const zipBuffer = await createPremierePackZip({
      plan,
      scriptDraft: project.scriptDraft,
      resolveAssetPath,
    });

    const exportId = createId();
    const dir = isS3Enabled()
      ? path.join(os.tmpdir(), "imagine-export", project.id)
      : await ensureProjectDir(project.id);
    await fs.mkdir(dir, { recursive: true });

    const localFilename = `${exportId}-premiere.zip`;
    const url = isS3Enabled()
      ? await saveBuffer(project.id, null, `exports/${localFilename}`, zipBuffer)
      : publicUrlFor(path.join(dir, localFilename));

    if (!isS3Enabled()) {
      await fs.writeFile(path.join(dir, localFilename), zipBuffer);
    }

    return NextResponse.json({
      ok: true,
      downloadUrl: url,
      downloadFilename: plan.downloadFilename,
      assetCount: plan.assets.length,
      blockCount: blocks.length,
      totalDurationSec: plan.manifest.totalDurationSec,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Premiere export failed" },
      { status: 500 },
    );
  }
}
