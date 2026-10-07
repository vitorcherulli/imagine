import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { isCreativeStatus, isCreativeUsage } from "@/lib/creatives";
import { deleteConcept, updateConcept, type ConceptPatch } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

/** Edits every version and size of one concept at once (product = folder, angle, hook, notes, status, usage). */
export async function PATCH(req: NextRequest, { params }: { params: { code: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = Number(params.code);
  if (!Number.isInteger(code) || code < 1) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: ConceptPatch = {};
  for (const k of ["product", "angle", "hook", "notes"] as const) {
    if (typeof body[k] === "string") patch[k] = body[k] as string;
  }
  if (body.status === null || isCreativeStatus(body.status)) patch.status = body.status as string | null;
  if (body.usage === null || isCreativeUsage(body.usage)) patch.usage = body.usage as string | null;
  if (typeof body.trashed === "boolean") patch.trashed = body.trashed;

  const updated = await updateConcept(userId, code, patch);
  if (!updated) return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  return NextResponse.json({ updated });
}

/** Deletes the concept for good — every version, size and file. */
export async function DELETE(_req: NextRequest, { params }: { params: { code: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = Number(params.code);
  if (!Number.isInteger(code) || code < 1) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  const deleted = await deleteConcept(userId, code);
  if (!deleted) return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  return NextResponse.json({ deleted });
}
