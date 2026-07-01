import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import {
  DEFAULT_VIDEO_SEARCH_LIMIT,
  MAX_VIDEO_SEARCH_LIMIT,
  orientationForVideoFormat,
  searchVideosWithFallback,
  videoSearchProviderLabel,
} from "@/lib/video-search";
import { listProjectStockVideoUsage } from "@/lib/stock-video-usage-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(MAX_VIDEO_SEARCH_LIMIT).optional(),
  videoFormat: z.string().optional(),
  projectId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, parsed.data.projectId), eq(schema.projects.userId, userId)),
      )
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  try {
    const orientation = orientationForVideoFormat(parsed.data.videoFormat);
    const results = await searchVideosWithFallback(
      parsed.data.query,
      parsed.data.limit ?? DEFAULT_VIDEO_SEARCH_LIMIT,
      orientation,
    );
    const usage = parsed.data.projectId
      ? await listProjectStockVideoUsage(parsed.data.projectId)
      : undefined;
    return NextResponse.json({
      ok: true,
      results,
      providerLabel: videoSearchProviderLabel(),
      usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video search failed" },
      { status: 500 },
    );
  }
}
