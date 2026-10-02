import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { tryUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { pickVersion, versionZipResponse } from "@/lib/creatives-zip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every size of one version as a ZIP — what one Meta ad needs. Defaults to the latest version. */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = Number(params.code);
  if (!Number.isInteger(code) || code < 1) return NextResponse.json({ error: "Bad code" }, { status: 400 });

  const files = await db
    .select()
    .from(schema.creatives)
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.code, code)));
  const picked = pickVersion(files, req.nextUrl.searchParams.get("version"));
  if (!picked.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return versionZipResponse(picked);
}
