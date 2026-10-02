import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { readMediaBuffer } from "@/lib/storage";
import { creativeFileName, getOwnedCreative } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creative = await getOwnedCreative(params.id, userId);
  if (!creative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = await readMediaBuffer(creative.fileUrl);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": creative.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename="${creativeFileName(creative)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
