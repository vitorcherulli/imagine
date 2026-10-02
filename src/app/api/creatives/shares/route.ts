import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { createShare, isShareScope, listShares } from "@/lib/creatives-share";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ shares: await listShares(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { scope?: unknown; value?: unknown; expiresInDays?: unknown };
  if (!isShareScope(body.scope)) return NextResponse.json({ error: "Bad scope" }, { status: 400 });
  try {
    const share = await createShare(
      userId,
      body.scope,
      String(body.value ?? ""),
      typeof body.expiresInDays === "number" ? body.expiresInDays : null,
    );
    return NextResponse.json({ share });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create link" }, { status: 400 });
  }
}
