import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { scriptDraftNotesSchema } from "@/lib/script-studio";
import {
  clearScriptDraft,
  ensureScriptVersionsBackfill,
  listScriptVersionMeta,
  saveScriptDraft,
  scriptDraftPayload,
} from "@/lib/script-versions-server";

export const dynamic = "force-dynamic";

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await ensureScriptVersionsBackfill(project);
  const fresh = (await getOwnedProject(params.id, userId)) ?? project;
  const payload = scriptDraftPayload(fresh);
  const versions = await listScriptVersionMeta(
    fresh.id,
    payload.currentVersion,
  );

  return NextResponse.json({
    ...payload,
    versions,
  });
}

const putSchema = z.object({
  script: z.string().max(40_000).default(""),
  notes: scriptDraftNotesSchema.optional(),
  status: z.enum(["none", "draft", "applied"]).optional(),
  /** Create a named checkpoint version (manual save). */
  checkpoint: z.boolean().optional(),
  versionSource: z.enum(["paste", "manual_checkpoint"]).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const versionSource = parsed.data.versionSource
    ? parsed.data.versionSource
    : parsed.data.checkpoint
      ? "manual_checkpoint"
      : null;

  try {
    const result = await saveScriptDraft(project, {
      script: parsed.data.script,
      notes: parsed.data.notes,
      status: parsed.data.status,
      versionSource,
      versionSummary:
        versionSource === "paste"
          ? "Pasted from clipboard"
          : versionSource === "manual_checkpoint"
            ? "Manual checkpoint"
            : null,
    });

    const versions = await listScriptVersionMeta(
      project.id,
      result.currentVersion,
    );

    return NextResponse.json({
      ok: true,
      ...result,
      versions,
    });
  } catch (err) {
    console.error("[script PUT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save script" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await clearScriptDraft(project.id);
  return NextResponse.json({ ok: true });
}
