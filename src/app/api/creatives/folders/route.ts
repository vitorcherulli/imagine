import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { createFolder, deleteFolder, renameFolder } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function fail(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ name: await createFolder(userId, str((await readBody(req)).name)) });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readBody(req);
  try {
    return NextResponse.json({ name: await renameFolder(userId, str(body.from), str(body.to)) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteFolder(userId, str((await readBody(req)).name));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
