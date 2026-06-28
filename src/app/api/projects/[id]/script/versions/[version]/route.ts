import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  listScriptVersionMeta,
  restoreScriptVersion,
  scriptDraftPayload,
} from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; version: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versionNum = Number.parseInt(params.version, 10);
  if (!Number.isFinite(versionNum) || versionNum < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await restoreScriptVersion(project, versionNum);
    const versions = await listScriptVersionMeta(project.id, result.currentVersion);
    return NextResponse.json({
      ok: true,
      ...result,
      versions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restore failed" },
      { status: 400 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; version: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versionNum = Number.parseInt(params.version, 10);
  if (!Number.isFinite(versionNum) || versionNum < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { getScriptVersion } = await import("@/lib/script-versions-server");
  const row = await getScriptVersion(project.id, versionNum);
  if (!row) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  return NextResponse.json({
    version: row.version,
    script: row.script,
    source: row.source,
    summary: row.summary,
    wordCount: row.wordCount,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date((row.createdAt as number) * 1000).toISOString(),
    isCurrent: project.scriptDraftVersion === row.version,
  });
}
