import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, isNotNull, isNull, lt, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Creative, CreativeMetric } from "@/lib/db/schema";
import { hasFfmpeg, readImagePixelSize } from "@/lib/ffmpeg";
import { deleteCreativeMedia, saveCreativeBuffer, withCacheBuster } from "@/lib/storage";
import {
  CREATIVE_TRASH_DAYS,
  buildCreativeName,
  parseMetaAdsCsv,
  ratioFromSize,
  summarizePerformance,
  toNameSlug,
  toProductCode,
  versionFromAdName,
  viewPeriod,
  type CreativeFormat,
  type CreativePerformance,
  type MetricPeriod,
  type PeriodView,
} from "@/lib/creatives";

export const CREATIVE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export const MAX_CREATIVE_BYTES = 400 * 1024 * 1024;

export function mimeFromName(name: string): string | null {
  const ext = path.extname(name).toLowerCase().slice(1);
  const entry = Object.entries(CREATIVE_MIME_EXT).find(([, e]) => e === ext || (ext === "jpeg" && e === "jpg"));
  return entry?.[0] ?? null;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `${bin} exited ${code}`))));
  });
}

type ProbedMedia = {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumb: Buffer | null;
};

async function probeMedia(buffer: Buffer, ext: string, isVideo: boolean): Promise<ProbedMedia> {
  const header = isVideo ? null : readImagePixelSize(buffer);
  const empty: ProbedMedia = {
    width: header?.width ?? null,
    height: header?.height ?? null,
    durationSeconds: null,
    thumb: null,
  };
  if (!hasFfmpeg()) return empty;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-creative-"));
  const input = path.join(dir, `in.${ext}`);
  const thumbPath = path.join(dir, "thumb.jpg");
  try {
    await fs.writeFile(input, buffer);
    const probe = JSON.parse(
      await run("ffprobe", [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
        "-of", "json", input,
      ]),
    ) as {
      streams?: { width?: number; height?: number; side_data_list?: { rotation?: number }[] }[];
      format?: { duration?: string };
    };
    const stream = probe.streams?.[0] ?? {};
    const rotated = Math.abs(stream.side_data_list?.[0]?.rotation ?? 0) === 90;
    const width = (rotated ? stream.height : stream.width) ?? empty.width;
    const height = (rotated ? stream.width : stream.height) ?? empty.height;
    const duration = isVideo && probe.format?.duration ? Number(probe.format.duration) : null;

    await run(process.env.FFMPEG_PATH?.trim() || "ffmpeg", [
      "-v", "error", "-y",
      ...(isVideo ? ["-ss", duration && duration > 2 ? "1" : "0"] : []),
      "-i", input, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", thumbPath,
    ]).catch(() => undefined);
    const thumb = await fs.readFile(thumbPath).catch(() => null);
    return { width, height, durationSeconds: duration && Number.isFinite(duration) ? duration : null, thumb };
  } catch {
    return empty;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getOwnedCreative(id: string, userId: string): Promise<Creative | null> {
  const [row] = await db
    .select()
    .from(schema.creatives)
    .where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId)));
  return row ?? null;
}

async function nextCode(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: max(schema.creatives.code) })
    .from(schema.creatives)
    .where(eq(schema.creatives.userId, userId));
  return (row?.value ?? 0) + 1;
}

async function nextVersion(userId: string, code: number): Promise<number> {
  const [row] = await db
    .select({ value: max(schema.creatives.version) })
    .from(schema.creatives)
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.code, code)));
  return (row?.value ?? 0) + 1;
}

export type CreativeMeta = {
  product: string;
  angle: string;
  hook?: string;
  format: CreativeFormat;
  creator?: string;
  language?: string;
};

/** new = next code; version = same code, next version; size = same code and version, another aspect ratio. */
export type CreativePlacement =
  | { mode: "new" }
  | { mode: "version"; code: number }
  | { mode: "size"; code: number; version: number };

export async function createCreativeFromBuffer(input: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  meta: CreativeMeta;
  placement: CreativePlacement;
  source?: string;
  sourceRef?: string | null;
}): Promise<Creative> {
  const ext = CREATIVE_MIME_EXT[input.mimeType];
  if (!ext) throw new Error("Use PNG, JPG, WebP, MP4 or MOV");
  const isVideo = input.mimeType.startsWith("video/");
  const probed = await probeMedia(input.buffer, ext, isVideo);

  const code =
    input.placement.mode === "new" ? await nextCode(input.userId) : input.placement.code;
  const version =
    input.placement.mode === "new"
      ? 1
      : input.placement.mode === "version"
        ? await nextVersion(input.userId, code)
        : input.placement.version;

  const id = createId();
  const fileUrl = withCacheBuster(
    await saveCreativeBuffer(input.userId, id, `original.${ext}`, input.buffer),
  );
  const thumbUrl = probed.thumb
    ? withCacheBuster(await saveCreativeBuffer(input.userId, id, "thumb.jpg", probed.thumb))
    : isVideo
      ? null
      : fileUrl;

  const now = new Date();
  const row = {
    id,
    userId: input.userId,
    code,
    version,
    product: toProductCode(input.meta.product) || "GERAL",
    angle: toNameSlug(input.meta.angle) || "Angulo",
    hook: (input.meta.hook ?? "").trim().slice(0, 300),
    format: input.meta.format,
    creator: input.meta.format === "UGC" ? toNameSlug(input.meta.creator ?? "", 16) : "",
    aspectRatio: ratioFromSize(probed.width, probed.height) ?? "1x1",
    language: input.meta.language || "PT",
    kind: isVideo ? "video" : "image",
    fileUrl,
    thumbUrl,
    mimeType: input.mimeType,
    width: probed.width,
    height: probed.height,
    durationSeconds: probed.durationSeconds,
    sizeBytes: input.buffer.length,
    originalName: input.originalName.slice(0, 200),
    source: input.source ?? "upload",
    sourceRef: input.sourceRef ?? null,
    status: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.creatives).values(row);
  return row as Creative;
}

export async function deleteCreative(creative: Creative): Promise<void> {
  await db.delete(schema.creatives).where(eq(schema.creatives.id, creative.id));
  await deleteCreativeMedia(creative.userId, creative.id).catch(() => {});
}

export function creativeFileName(c: Creative): string {
  const ext = CREATIVE_MIME_EXT[c.mimeType] ?? "bin";
  return `${buildCreativeName({ ...c, format: c.format as CreativeFormat })}.${ext}`;
}

// ---------------------------------------------------------------------------

/** Rows imported before periods existed become one period of their own. */
async function adoptLegacyMetrics(userId: string): Promise<void> {
  const m = schema.creativeMetrics;
  const legacy = await db
    .select({ code: m.code, sourceFile: m.sourceFile, importedAt: m.importedAt })
    .from(m)
    .where(and(eq(m.userId, userId), isNull(m.importId)));
  if (!legacy.length) return;
  const id = createId();
  await db.insert(schema.creativeMetricImports).values({
    id,
    userId,
    sourceFile: legacy[0].sourceFile,
    rows: legacy.length,
    matched: legacy.filter((r) => r.code != null).length,
    importedAt: legacy[0].importedAt,
  });
  await db.update(m).set({ importId: id }).where(and(eq(m.userId, userId), isNull(m.importId)));
}

export async function deleteMetricImport(userId: string, importId: string): Promise<void> {
  await db
    .delete(schema.creativeMetrics)
    .where(and(eq(schema.creativeMetrics.userId, userId), eq(schema.creativeMetrics.importId, importId)));
  await db
    .delete(schema.creativeMetricImports)
    .where(and(eq(schema.creativeMetricImports.userId, userId), eq(schema.creativeMetricImports.id, importId)));
}

/** Adds the export as a new period. Re-importing the same reporting range replaces that period. */
export async function importMetaCsv(userId: string, text: string, sourceFile: string) {
  const { rows, periodStart, periodEnd, error } = parseMetaAdsCsv(text);
  if (error) throw new Error(error);
  if (!rows.length) throw new Error("The file has no ads.");
  await adoptLegacyMetrics(userId);

  let replaced = false;
  if (periodStart && periodEnd) {
    const imp = schema.creativeMetricImports;
    const same = await db
      .select({ id: imp.id })
      .from(imp)
      .where(and(eq(imp.userId, userId), eq(imp.periodStart, periodStart), eq(imp.periodEnd, periodEnd)));
    for (const s of same) await deleteMetricImport(userId, s.id);
    replaced = same.length > 0;
  }

  const importId = createId();
  const importedAt = new Date();
  const matched = rows.filter((r) => r.code != null).length;
  await db.insert(schema.creativeMetricImports).values({
    id: importId,
    userId,
    sourceFile: sourceFile.slice(0, 200),
    periodStart,
    periodEnd,
    rows: rows.length,
    matched,
    importedAt,
  });
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(schema.creativeMetrics).values(
      rows.slice(i, i + 200).map((r) => ({
        id: createId(),
        userId,
        adName: r.adName.slice(0, 500),
        code: r.code,
        spend: r.spend,
        impressions: Math.round(r.impressions),
        clicks: Math.round(r.clicks),
        results: r.results,
        sourceFile: sourceFile.slice(0, 200),
        importId,
        importedAt,
      })),
    );
  }
  return { rows: rows.length, matched, importId, periodStart, periodEnd, replaced };
}

export async function clearMetrics(userId: string): Promise<void> {
  await db.delete(schema.creativeMetrics).where(eq(schema.creativeMetrics.userId, userId));
  await db.delete(schema.creativeMetricImports).where(eq(schema.creativeMetricImports.userId, userId));
}

// ---------------------------------------------------------------------------
// Folders (= products) and concept-wide edits

export const DEFAULT_FOLDER = "GERAL";

export async function createFolder(userId: string, rawName: string): Promise<string> {
  const name = toProductCode(rawName);
  if (!name) throw new Error("Use letters or numbers in the folder name");
  const [existing] = await db
    .select({ id: schema.creativeFolders.id })
    .from(schema.creativeFolders)
    .where(and(eq(schema.creativeFolders.userId, userId), eq(schema.creativeFolders.name, name)));
  if (!existing) {
    await db.insert(schema.creativeFolders).values({ id: createId(), userId, name, createdAt: new Date() });
  }
  return name;
}

/** Renaming a folder renames the product of everything inside; renaming onto an existing folder merges them. */
export async function renameFolder(userId: string, from: string, rawTo: string): Promise<string> {
  const to = toProductCode(rawTo);
  if (!to) throw new Error("Use letters or numbers in the folder name");
  if (to === from) return to;
  await db
    .update(schema.creatives)
    .set({ product: to, updatedAt: new Date() })
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.product, from)));
  await db
    .delete(schema.creativeFolders)
    .where(and(eq(schema.creativeFolders.userId, userId), eq(schema.creativeFolders.name, from)));
  await db
    .update(schema.creativeShares)
    .set({ scopeValue: to })
    .where(
      and(
        eq(schema.creativeShares.userId, userId),
        eq(schema.creativeShares.scope, "folder"),
        eq(schema.creativeShares.scopeValue, from),
      ),
    );
  await createFolder(userId, to);
  return to;
}

export async function deleteFolder(userId: string, name: string): Promise<void> {
  const inside = await db
    .select({ trashedAt: schema.creatives.trashedAt })
    .from(schema.creatives)
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.product, name)));
  if (inside.some((c) => !c.trashedAt)) throw new Error("Move or delete the concepts inside first");
  if (inside.length) throw new Error("Some concepts of this folder are in the trash — empty the trash first");
  await db
    .delete(schema.creativeFolders)
    .where(and(eq(schema.creativeFolders.userId, userId), eq(schema.creativeFolders.name, name)));
}

export type ConceptPatch = {
  product?: string;
  angle?: string;
  hook?: string;
  notes?: string;
  status?: string | null;
  usage?: string | null;
  trashed?: boolean;
};

export async function updateConcept(userId: string, code: number, patch: ConceptPatch): Promise<number> {
  const set: Partial<typeof schema.creatives.$inferInsert> = { updatedAt: new Date() };
  if (patch.product !== undefined) {
    const product = toProductCode(patch.product);
    if (product) {
      set.product = product;
      await createFolder(userId, product);
    }
  }
  if (patch.angle !== undefined && toNameSlug(patch.angle)) set.angle = toNameSlug(patch.angle);
  if (patch.hook !== undefined) set.hook = patch.hook.trim().slice(0, 300);
  if (patch.notes !== undefined) set.notes = patch.notes.trim().slice(0, 2000);
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.usage !== undefined) set.usage = patch.usage;
  if (patch.trashed !== undefined) set.trashedAt = patch.trashed ? new Date() : null;
  const rows = await db
    .update(schema.creatives)
    .set(set)
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.code, code)))
    .returning({ id: schema.creatives.id });
  return rows.length;
}

/** Deletes every version and size of one concept, files included. */
export async function deleteConcept(userId: string, code: number): Promise<number> {
  const files = await db
    .select()
    .from(schema.creatives)
    .where(and(eq(schema.creatives.userId, userId), eq(schema.creatives.code, code)));
  for (const f of files) await deleteCreative(f);
  return files.length;
}

/** Deletes trashed concepts — all of them, or only those trashed before `before`. */
export async function emptyTrash(userId: string, before?: Date): Promise<number> {
  const c = schema.creatives;
  const files = await db
    .select()
    .from(c)
    .where(and(eq(c.userId, userId), before ? lt(c.trashedAt, before) : isNotNull(c.trashedAt)));
  for (const f of files) await deleteCreative(f);
  return files.length;
}

export type CreativeLibrary = {
  folders: string[];
  creatives: Creative[];
  /** Newest period first. */
  periods: MetricPeriod[];
} & PeriodView;

function aggregatePeriod(rows: CreativeMetric[], known: Set<number>) {
  const byCode = new Map<number, CreativeMetric[]>();
  const byVersion = new Map<string, CreativeMetric[]>();
  for (const r of rows) {
    if (r.code == null) continue;
    byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
    const version = versionFromAdName(r.adName);
    if (version == null) continue;
    const key = `${r.code}:${version}`;
    byVersion.set(key, [...(byVersion.get(key) ?? []), r]);
  }
  const performance: Record<number, CreativePerformance> = {};
  for (const [code, list] of byCode) performance[code] = summarizePerformance(list);
  const versionPerformance: Record<string, CreativePerformance> = {};
  for (const [key, list] of byVersion) versionPerformance[key] = summarizePerformance(list);
  const unmatched = rows.filter((r) => r.code == null || !known.has(r.code)).map((r) => r.adName).slice(0, 50);
  return { performance, versionPerformance, unmatched };
}

export async function loadCreativeLibrary(userId: string): Promise<CreativeLibrary> {
  await adoptLegacyMetrics(userId);
  await emptyTrash(userId, new Date(Date.now() - CREATIVE_TRASH_DAYS * 86_400_000)).catch((err) => {
    console.warn("[creatives] trash purge failed", err);
  });
  const [creatives, metricRows, folderRows, importRows] = await Promise.all([
    db
      .select()
      .from(schema.creatives)
      .where(eq(schema.creatives.userId, userId))
      .orderBy(desc(schema.creatives.code), desc(schema.creatives.version)),
    db.select().from(schema.creativeMetrics).where(eq(schema.creativeMetrics.userId, userId)),
    db
      .select({ name: schema.creativeFolders.name })
      .from(schema.creativeFolders)
      .where(eq(schema.creativeFolders.userId, userId)),
    db.select().from(schema.creativeMetricImports).where(eq(schema.creativeMetricImports.userId, userId)),
  ]);
  const folders = [...new Set([...folderRows.map((f) => f.name), ...creatives.map((c) => c.product)])].sort();
  const known = new Set(creatives.map((c) => c.code));

  const rowsByImport = new Map<string, CreativeMetric[]>();
  for (const r of metricRows) {
    if (r.importId) rowsByImport.set(r.importId, [...(rowsByImport.get(r.importId) ?? []), r]);
  }
  const sortKey = (p: { periodEnd: string | null; importedAt: string }) => p.periodEnd ?? p.importedAt.slice(0, 10);
  const periods: MetricPeriod[] = importRows
    .filter((imp) => rowsByImport.has(imp.id))
    .map((imp) => {
      const rows = rowsByImport.get(imp.id)!;
      return {
        id: imp.id,
        sourceFile: imp.sourceFile,
        periodStart: imp.periodStart,
        periodEnd: imp.periodEnd,
        importedAt: new Date(imp.importedAt).toISOString(),
        rows: rows.length,
        ...aggregatePeriod(rows, known),
      };
    })
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.importedAt.localeCompare(a.importedAt));

  return { folders, creatives, periods, ...viewPeriod(periods, null) };
}
