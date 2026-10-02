import { NextRequest, NextResponse } from "next/server";
import { pickVersion, versionZipResponse } from "@/lib/creatives-zip";
import { resolveShare, sharedCreatives } from "@/lib/creatives-share";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Public: every size of one shared version as a ZIP (`?code=13&version=2`, latest version by default). */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const share = await resolveShare(params.token);
  if (!share) return NextResponse.json({ error: "This link has expired or was revoked" }, { status: 404 });
  const code = Number(req.nextUrl.searchParams.get("code"));
  const files = (await sharedCreatives(share)).filter((c) => c.code === code);
  const picked = pickVersion(files, req.nextUrl.searchParams.get("version"));
  if (!picked.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return versionZipResponse(picked);
}
