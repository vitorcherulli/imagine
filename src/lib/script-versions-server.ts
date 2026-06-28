import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import {
  computeScriptStats,
  countWords,
  normalizeScriptDraftStatus,
  normalizeScriptText,
  parseScriptDraftNotes,
  serializeScriptDraftNotes,
  type ScriptDraftNotes,
  type ScriptDraftStatus,
  type ScriptVersionMeta,
} from "@/lib/script-studio";

export type { ScriptVersionMeta } from "@/lib/script-studio";

export type ScriptVersionSource =
  | "ai_generate"
  | "refine"
  | "paste"
  | "manual_checkpoint"
  | "restore"
  | "applied_snapshot"
  | "initial";

export interface SaveScriptDraftInput {
  script: string;
  notes?: ScriptDraftNotes;
  status?: ScriptDraftStatus;
  /** When set, creates an immutable version snapshot. */
  versionSource?: ScriptVersionSource | null;
  versionSummary?: string | null;
}

export interface SaveScriptDraftResult {
  script: string;
  notes: ScriptDraftNotes;
  status: ScriptDraftStatus;
  currentVersion: number | null;
  versionCreated: number | null;
}

async function nextVersionNumber(projectId: string): Promise<number> {
  const [row] = await db
    .select({ maxVersion: max(schema.scriptVersions.version) })
    .from(schema.scriptVersions)
    .where(eq(schema.scriptVersions.projectId, projectId));
  return (row?.maxVersion ?? 0) + 1;
}

export async function createScriptVersion(
  projectId: string,
  input: {
    script: string;
    notes?: ScriptDraftNotes;
    source: ScriptVersionSource;
    summary?: string | null;
  },
): Promise<number> {
  const text = normalizeScriptText(input.script);
  if (!text) throw new Error("Cannot version an empty script");

  const version = await nextVersionNumber(projectId);
  const now = new Date();
  await db.insert(schema.scriptVersions).values({
    id: createId(),
    projectId,
    version,
    script: text,
    notes: input.notes ? serializeScriptDraftNotes(input.notes) : null,
    source: input.source,
    summary: input.summary?.trim() || null,
    wordCount: countWords(text),
    createdAt: now,
  });
  return version;
}

export async function saveScriptDraft(
  project: Pick<
    Project,
    "id" | "scriptDraft" | "scriptDraftNotes" | "scriptDraftStatus" | "scriptDraftVersion"
  >,
  input: SaveScriptDraftInput,
): Promise<SaveScriptDraftResult> {
  const text = normalizeScriptText(input.script);
  const existingNotes = parseScriptDraftNotes(project.scriptDraftNotes);
  const incomingNotes = input.notes ?? {};
  const mergedNotes: ScriptDraftNotes = {
    ...existingNotes,
    ...incomingNotes,
    updatedAt: new Date().toISOString(),
    sourceMode:
      incomingNotes.sourceMode ??
      existingNotes.sourceMode ??
      (input.versionSource === "paste"
        ? "pasted"
        : input.versionSource === "ai_generate"
          ? "ai"
          : "edited"),
  };

  const prevScript = normalizeScriptText(project.scriptDraft ?? "");
  if (text !== prevScript && input.versionSource !== "refine") {
    delete mergedNotes.review;
  }

  const inferredStatus: ScriptDraftStatus = text.length === 0 ? "none" : "draft";
  const status = input.status ?? inferredStatus;

  let currentVersion = project.scriptDraftVersion ?? null;
  let versionCreated: number | null = null;

  if (text && input.versionSource) {
    versionCreated = await createScriptVersion(project.id, {
      script: text,
      notes: mergedNotes,
      source: input.versionSource,
      summary: input.versionSummary,
    });
    currentVersion = versionCreated;
    mergedNotes.revision = versionCreated;
  } else if (text && currentVersion === null) {
    // Backfill v1 for drafts that predate versioning.
    versionCreated = await createScriptVersion(project.id, {
      script: text,
      notes: mergedNotes,
      source: "initial",
      summary: "Initial draft",
    });
    currentVersion = versionCreated;
    mergedNotes.revision = versionCreated;
  }

  await db
    .update(schema.projects)
    .set({
      scriptDraft: text || null,
      scriptDraftNotes:
        text || mergedNotes.narrator ? serializeScriptDraftNotes(mergedNotes) : null,
      scriptDraftStatus: status,
      scriptDraftVersion: text ? currentVersion : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));

  return {
    script: text,
    notes: text || mergedNotes.narrator ? mergedNotes : {},
    status,
    currentVersion: text ? currentVersion : null,
    versionCreated,
  };
}

export async function listScriptVersionMeta(
  projectId: string,
  currentVersion: number | null,
  limit = 50,
): Promise<ScriptVersionMeta[]> {
  const rows = await db
    .select({
      version: schema.scriptVersions.version,
      source: schema.scriptVersions.source,
      summary: schema.scriptVersions.summary,
      wordCount: schema.scriptVersions.wordCount,
      createdAt: schema.scriptVersions.createdAt,
    })
    .from(schema.scriptVersions)
    .where(eq(schema.scriptVersions.projectId, projectId))
    .orderBy(desc(schema.scriptVersions.version))
    .limit(limit);

  return rows.map((row) => ({
    version: row.version,
    source: row.source as ScriptVersionSource,
    summary: row.summary,
    wordCount: row.wordCount,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date((row.createdAt as number) * 1000).toISOString(),
    isCurrent: currentVersion !== null && row.version === currentVersion,
  }));
}

export async function getScriptVersion(projectId: string, version: number) {
  const [row] = await db
    .select()
    .from(schema.scriptVersions)
    .where(
      and(
        eq(schema.scriptVersions.projectId, projectId),
        eq(schema.scriptVersions.version, version),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function restoreScriptVersion(
  project: Project,
  version: number,
): Promise<SaveScriptDraftResult> {
  const row = await getScriptVersion(project.id, version);
  if (!row) throw new Error(`Version v${version} not found`);

  const notes = parseScriptDraftNotes(row.notes);
  return saveScriptDraft(project, {
    script: row.script,
    notes,
    status: "draft",
    versionSource: "restore",
    versionSummary: `Restored from v${version}`,
  });
}

export async function clearScriptDraft(projectId: string): Promise<void> {
  await db.delete(schema.scriptVersions).where(eq(schema.scriptVersions.projectId, projectId));
  await db
    .update(schema.projects)
    .set({
      scriptDraft: null,
      scriptDraftNotes: null,
      scriptDraftStatus: "none",
      scriptDraftVersion: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, projectId));
}

export async function ensureScriptVersionsBackfill(project: Project): Promise<void> {
  const text = normalizeScriptText(project.scriptDraft ?? "");
  if (!text) return;

  const [existing] = await db
    .select({ count: max(schema.scriptVersions.version) })
    .from(schema.scriptVersions)
    .where(eq(schema.scriptVersions.projectId, project.id));
  if ((existing?.count ?? 0) > 0) return;

  const version = await createScriptVersion(project.id, {
    script: text,
    notes: parseScriptDraftNotes(project.scriptDraftNotes),
    source: "initial",
    summary: "Imported existing draft",
  });

  await db
    .update(schema.projects)
    .set({
      scriptDraftVersion: version,
      scriptDraftStatus: normalizeScriptDraftStatus(project.scriptDraftStatus),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));
}

export function scriptDraftPayload(
  project: Pick<
    Project,
    "scriptDraft" | "scriptDraftNotes" | "scriptDraftStatus" | "scriptDraftVersion"
  >,
) {
  const script = project.scriptDraft ?? "";
  return {
    script,
    notes: parseScriptDraftNotes(project.scriptDraftNotes),
    status: normalizeScriptDraftStatus(project.scriptDraftStatus),
    currentVersion: project.scriptDraftVersion ?? null,
    stats: computeScriptStats(script),
  };
}
