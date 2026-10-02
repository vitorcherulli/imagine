import { NextRequest, NextResponse } from "next/server";
import { readMediaBuffer } from "@/lib/storage";
import { creativeFileName } from "@/lib/creatives-server";
import { mediaResponse, resolveShare, sharedCreative } from "@/lib/creatives-share";

export const dynamic = "force-dynamic";

/** Public: one shared file (`?thumb=1` for its thumbnail, `?download=1` to save it with the standard name). */
export async function GET(req: NextRequest, { params }: { params: { token: string; id: string } }) {
  const share = await resolveShare(params.token);
  const creative = share ? await sharedCreative(share, params.id) : null;
  if (!creative) return NextResponse.json({ error: "This link has expired or was revoked" }, { status: 404 });

  const thumb = req.nextUrl.searchParams.get("thumb") === "1";
  if (thumb && !creative.thumbUrl) return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  try {
    const buf = await readMediaBuffer(thumb ? creative.thumbUrl! : creative.fileUrl);
    const download = !thumb && req.nextUrl.searchParams.get("download") === "1";
    const mime = thumb && /thumb\.jpg(\?|$)/.test(creative.thumbUrl!) ? "image/jpeg" : creative.mimeType;
    return mediaResponse(req, buf, mime, {
      "Cache-Control": "private, max-age=300",
      ...(download ? { "Content-Disposition": `attachment; filename="${creativeFileName(creative)}"` } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Could not read the file" }, { status: 404 });
  }
}
