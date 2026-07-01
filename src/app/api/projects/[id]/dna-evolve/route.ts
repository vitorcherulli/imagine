import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { DNA_EVOLVE_FIELDS } from "@/lib/project-dna-evolve";
import {
  applyDnaEvolveChanges,
  loadProjectWithBlocks,
  previewDnaEvolveFromProject,
} from "@/lib/project-dna-evolve-server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loaded = await loadProjectWithBlocks(params.id, userId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const preview = await previewDnaEvolveFromProject(loaded);
    return NextResponse.json({ preview });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not analyze episode" },
      { status: 500 },
    );
  }
}

const applySchema = z.object({
  projectDnaId: z.string().min(1),
  changes: z.array(
    z.object({
      field: z.enum(DNA_EVOLVE_FIELDS),
      after: z.string().max(4000).nullable(),
    }),
  ),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loaded = await loadProjectWithBlocks(params.id, userId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (loaded.project.projectDnaId !== parsed.data.projectDnaId) {
    return NextResponse.json({ error: "DNA mismatch for this project" }, { status: 400 });
  }

  if (parsed.data.changes.length === 0) {
    return NextResponse.json({ error: "No changes selected" }, { status: 400 });
  }

  try {
    const projectDna = await applyDnaEvolveChanges({
      userId,
      projectDnaId: parsed.data.projectDnaId,
      changes: parsed.data.changes,
    });
    return NextResponse.json({ projectDna });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update DNA" },
      { status: 500 },
    );
  }
}
