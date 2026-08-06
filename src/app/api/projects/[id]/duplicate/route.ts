import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { duplicateProjectDeep, getOwnedProject } from "@/lib/project-library";

export const dynamic = "force-dynamic";
// Deep duplication copies every media file, so allow a generous window.
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await getOwnedProject(params.id, userId);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = await duplicateProjectDeep(source, userId);
  return NextResponse.json({ id });
}
