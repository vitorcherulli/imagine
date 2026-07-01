import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  buildExportDownloadFilename,
  buildProjectExportItems,
} from "@/lib/export-history";
import { getExportProgressSnapshot } from "@/lib/export-progress-server";

export const dynamic = "force-dynamic";

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; exportId: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await getExportProgressSnapshot(params.exportId, project.id);
  if (!snapshot) return NextResponse.json({ error: "Export not found" }, { status: 404 });

  let version: number | null = null;
  let downloadFilename: string | null = null;
  if (snapshot.status === "done") {
    const rows = await db
      .select()
      .from(schema.exports)
      .where(eq(schema.exports.projectId, project.id));
    const items = buildProjectExportItems(rows, project.title, project.videoFormat);
    const item = items.find((row) => row.id === snapshot.exportId);
    if (item) {
      version = item.version;
      downloadFilename = item.downloadFilename;
    }
  }

  return NextResponse.json({
    ...snapshot,
    version,
    downloadFilename,
    downloadReady: snapshot.status === "done" && !!snapshot.finalVideoUrl,
    downloadFilenameResolved:
      downloadFilename ??
      (version != null
        ? buildExportDownloadFilename(project.title, version, snapshot.resolution as never)
        : null),
  });
}
