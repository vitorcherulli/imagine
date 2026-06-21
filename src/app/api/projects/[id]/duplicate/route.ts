import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { duplicateProjectAsTemplate, getOwnedProject } from "@/lib/project-library";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await getOwnedProject(params.id, userId);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = await duplicateProjectAsTemplate(source, userId);
  return NextResponse.json({ id });
}
