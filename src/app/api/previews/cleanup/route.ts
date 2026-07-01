import { NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { cleanupUserPreviewVideos } from "@/lib/preview-cleanup-server";

export const dynamic = "force-dynamic";

/** Delete all preview proxy files across the signed-in user's projects. */
export async function POST() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await cleanupUserPreviewVideos(userId);
  return NextResponse.json({ ok: true, ...result });
}
