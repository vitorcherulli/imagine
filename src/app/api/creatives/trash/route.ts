import { NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { emptyTrash } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const deleted = await emptyTrash(userId);
  return NextResponse.json({ deleted });
}
