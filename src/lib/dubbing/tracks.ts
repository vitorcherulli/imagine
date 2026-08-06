/**
 * Multi-language dub tracks — one timeline row per target language.
 */
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  DubbingSegment,
  DubbingSegmentLocale,
  DubbingTrack,
  Project,
} from "@/lib/db/schema";
import { dubLanguageInfo, normalizeDubLanguage } from "@/lib/dub-languages";
import { listDubSegments, updateDubProject } from "./helpers";

export type {
  DubSegmentClip,
  DubTrack,
} from "./track-view";
export {
  buildSegmentClipsForTrack,
  buildTimelineDubTracks,
} from "./track-view";

export async function listDubTracks(projectId: string): Promise<DubbingTrack[]> {
  return db
    .select()
    .from(schema.dubbingTracks)
    .where(eq(schema.dubbingTracks.projectId, projectId))
    .orderBy(asc(schema.dubbingTracks.sortOrder), asc(schema.dubbingTracks.createdAt));
}

export async function listDubSegmentLocales(
  projectId: string,
): Promise<DubbingSegmentLocale[]> {
  const tracks = await listDubTracks(projectId);
  if (tracks.length === 0) return [];
  const trackIds = tracks.map((t) => t.id);
  const rows: DubbingSegmentLocale[] = [];
  for (const trackId of trackIds) {
    const locales = await db
      .select()
      .from(schema.dubbingSegmentLocales)
      .where(eq(schema.dubbingSegmentLocales.trackId, trackId));
    rows.push(...locales);
  }
  return rows;
}

export async function getDubTrack(
  trackId: string,
  projectId: string,
): Promise<DubbingTrack | null> {
  const [row] = await db
    .select()
    .from(schema.dubbingTracks)
    .where(
      and(
        eq(schema.dubbingTracks.id, trackId),
        eq(schema.dubbingTracks.projectId, projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Copy legacy single-language segment fields into track + locale tables. */
export async function ensureDubTracksMigrated(
  project: Project,
  segments: DubbingSegment[],
): Promise<DubbingTrack[]> {
  const existing = await listDubTracks(project.id);
  if (existing.length > 0) return existing;

  const languageId = normalizeDubLanguage(project.dubTargetLanguage ?? "en");
  const now = new Date();
  const trackId = createId();

  await db.insert(schema.dubbingTracks).values({
    id: trackId,
    projectId: project.id,
    languageId,
    sortOrder: 0,
    ttsVoice: project.ttsVoice ?? null,
    createdAt: now,
    updatedAt: now,
  });

  if (segments.length > 0) {
    await db.insert(schema.dubbingSegmentLocales).values(
      segments.map((seg) => ({
        id: createId(),
        segmentId: seg.id,
        trackId,
        translatedText: seg.translatedText ?? "",
        ttsAudioUrl: seg.ttsAudioUrl ?? null,
        ttsDurationSeconds: seg.ttsDurationSeconds ?? null,
        ttsModel: seg.ttsModel ?? null,
        ttsVoice: seg.ttsVoice ?? null,
        stretchRatio: seg.stretchRatio ?? null,
        status: seg.status ?? "pending",
        errorMessage: seg.errorMessage ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  return listDubTracks(project.id);
}

export async function addDubTrack(
  project: Project,
  languageId: string,
): Promise<DubbingTrack> {
  const lang = normalizeDubLanguage(languageId);
  const tracks = await ensureDubTracksMigrated(project, await listDubSegments(project.id));
  if (tracks.some((t) => t.languageId === lang)) {
    throw new Error(`${dubLanguageInfo(lang).label} is already on the timeline`);
  }

  const now = new Date();
  const trackId = createId();
  const sortOrder = tracks.length;

  await db.insert(schema.dubbingTracks).values({
    id: trackId,
    projectId: project.id,
    languageId: lang,
    sortOrder,
    ttsVoice: project.ttsVoice ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const segments = await listDubSegments(project.id);
  if (segments.length > 0) {
    await db.insert(schema.dubbingSegmentLocales).values(
      segments.map((seg) => ({
        id: createId(),
        segmentId: seg.id,
        trackId,
        translatedText: "",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  await updateDubProject(project.id, { dubTargetLanguage: lang });

  const [track] = await db
    .select()
    .from(schema.dubbingTracks)
    .where(eq(schema.dubbingTracks.id, trackId))
    .limit(1);
  if (!track) throw new Error("Failed to create dub track");
  return track;
}

export async function updateDubSegmentLocale(
  localeId: string,
  patch: Partial<DubbingSegmentLocale>,
): Promise<void> {
  await db
    .update(schema.dubbingSegmentLocales)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.dubbingSegmentLocales.id, localeId));
}

export async function getLocaleForSegmentTrack(
  segmentId: string,
  trackId: string,
): Promise<DubbingSegmentLocale | null> {
  const [row] = await db
    .select()
    .from(schema.dubbingSegmentLocales)
    .where(
      and(
        eq(schema.dubbingSegmentLocales.segmentId, segmentId),
        eq(schema.dubbingSegmentLocales.trackId, trackId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listLocalesForTrack(
  trackId: string,
): Promise<DubbingSegmentLocale[]> {
  return db
    .select()
    .from(schema.dubbingSegmentLocales)
    .where(eq(schema.dubbingSegmentLocales.trackId, trackId));
}

/** Mirror primary track locale back onto dubbing_segments for legacy readers. */
export async function syncPrimaryTrackToSegments(
  project: Project,
  trackId: string,
): Promise<void> {
  const track = await getDubTrack(trackId, project.id);
  if (!track) return;
  const locales = await listLocalesForTrack(trackId);
  const lang = track.languageId;
  for (const loc of locales) {
    await db
      .update(schema.dubbingSegments)
      .set({
        translatedText: loc.translatedText,
        targetLanguage: lang,
        ttsAudioUrl: loc.ttsAudioUrl,
        ttsDurationSeconds: loc.ttsDurationSeconds,
        ttsModel: loc.ttsModel,
        ttsVoice: loc.ttsVoice,
        stretchRatio: loc.stretchRatio,
        status: loc.status,
        errorMessage: loc.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(schema.dubbingSegments.id, loc.segmentId));
  }
  await updateDubProject(project.id, { dubTargetLanguage: lang });
}

