import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { cleanupProjectPreviewVideos } from "@/lib/preview-cleanup-server";

export const dynamic = "force-dynamic";

/** Delete low-res `video_preview.mp4` files for this project. Full `video.mp4` export media is kept. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deletedCount = await cleanupProjectPreviewVideos(project.id);
  return NextResponse.json({ ok: true, deletedCount });
}
