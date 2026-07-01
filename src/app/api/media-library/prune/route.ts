import { NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { pruneBrokenMediaLibraryAssets } from "@/lib/media-library-prune";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prunedCount = await pruneBrokenMediaLibraryAssets(userId);
  return NextResponse.json({ ok: true, prunedCount });
}
