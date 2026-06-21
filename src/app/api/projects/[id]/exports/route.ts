import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { buildProjectExportItems } from "@/lib/export-history";

export const dynamic = "force-dynamic";

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(schema.exports)
    .where(eq(schema.exports.projectId, project.id))
    .orderBy(asc(schema.exports.createdAt));

  const exports = buildProjectExportItems(rows, project.title, project.videoFormat);
  const downloadable = exports.filter((item) => item.status === "done" && item.finalVideoUrl);

  return NextResponse.json({
    exports,
    downloadableCount: downloadable.length,
  });
}
