import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { deleteMediaLibraryFolder } from "@/lib/media-library-server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteMediaLibraryFolder(params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete folder" },
      { status: 400 },
    );
  }
}
