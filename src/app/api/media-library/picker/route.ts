import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { listMediaLibraryPickerAssets } from "@/lib/media-library-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = req.nextUrl.searchParams.get("scope");
  const projectId = req.nextUrl.searchParams.get("projectId");
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam === "video" ? "video" : "image";

  const assets = await listMediaLibraryPickerAssets(userId, {
    projectId: scope === "project" && projectId ? projectId : null,
    kind,
  });

  return NextResponse.json({ assets, scope: scope === "project" ? "project" : "all" });
}
