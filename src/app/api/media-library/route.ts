import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import {
  buildMediaFolderTree,
  listMediaLibraryAssets,
  listMediaLibraryFolders,
  searchMediaLibraryAssets,
} from "@/lib/media-library-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folderParam = req.nextUrl.searchParams.get("folderId");
  const folderId = folderParam === "root" || !folderParam ? null : folderParam;
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";

  const [folders, assets] = await Promise.all([
    listMediaLibraryFolders(userId),
    search
      ? searchMediaLibraryAssets(userId, search)
      : listMediaLibraryAssets(userId, folderId),
  ]);

  return NextResponse.json({
    folders,
    tree: buildMediaFolderTree(folders),
    assets,
    folderId,
    search: search || null,
  });
}
