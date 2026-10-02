import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { deleteShare } from "@/lib/creatives-share";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteShare(userId, params.id);
  return NextResponse.json({ ok: true });
}
