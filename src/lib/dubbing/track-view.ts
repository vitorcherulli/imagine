/**
 * Client-safe helpers for dub timeline rows (no DB / Node imports).
 */
import type {
  DubbingSegment,
  DubbingSegmentLocale,
  DubbingTrack,
} from "@/lib/db/schema";
import { dubLanguageInfo } from "@/lib/dub-languages";

export type DubSegmentClip = Pick<
  DubbingSegment,
  | "id"
  | "position"
  | "startSeconds"
  | "endSeconds"
  | "sourceText"
  | "sourceLanguage"
> & {
  translatedText: string;
  ttsAudioUrl: string | null;
  ttsDurationSeconds: number | null;
  stretchRatio: number | null;
  status: string;
  errorMessage: string | null;
  localeId: string | null;
};

export interface DubTrack {
  id: string;
  label: string;
  flag: string;
  segments: DubSegmentClip[];
  kind: "original" | "dub";
  languageId?: string;
}

export function buildSegmentClipsForTrack(
  segments: DubbingSegment[],
  locales: DubbingSegmentLocale[],
  _trackId: string,
): DubSegmentClip[] {
  const bySegment = new Map(locales.map((l) => [l.segmentId, l]));
  return segments.map((seg) => {
    const loc = bySegment.get(seg.id);
    return {
      id: seg.id,
      position: seg.position,
      startSeconds: seg.startSeconds,
      endSeconds: seg.endSeconds,
      sourceText: seg.sourceText,
      sourceLanguage: seg.sourceLanguage,
      translatedText: loc?.translatedText ?? "",
      ttsAudioUrl: loc?.ttsAudioUrl ?? null,
      ttsDurationSeconds: loc?.ttsDurationSeconds ?? null,
      stretchRatio: loc?.stretchRatio ?? null,
      status: loc?.status ?? "pending",
      errorMessage: loc?.errorMessage ?? null,
      localeId: loc?.id ?? null,
    };
  });
}

export function buildTimelineDubTracks(
  segments: DubbingSegment[],
  tracks: DubbingTrack[],
  locales: DubbingSegmentLocale[],
  sourceLanguage: string | null | undefined,
): DubTrack[] {
  const src = dubLanguageInfo(sourceLanguage || "pt");
  const originalClips: DubSegmentClip[] = segments.map((seg) => ({
    id: seg.id,
    position: seg.position,
    startSeconds: seg.startSeconds,
    endSeconds: seg.endSeconds,
    sourceText: seg.sourceText,
    sourceLanguage: seg.sourceLanguage,
    translatedText: seg.sourceText,
    ttsAudioUrl: null,
    ttsDurationSeconds: null,
    stretchRatio: null,
    status: seg.status,
    errorMessage: null,
    localeId: null,
  }));

  const rows: DubTrack[] = [
    {
      id: "__source__",
      label: `Original · ${src.label}`,
      flag: src.flag,
      kind: "original",
      segments: originalClips,
    },
  ];

  for (const track of tracks) {
    const info = dubLanguageInfo(track.languageId);
    const trackLocales = locales.filter((l) => l.trackId === track.id);
    rows.push({
      id: track.id,
      label: info.label,
      flag: info.flag,
      kind: "dub",
      languageId: track.languageId,
      segments: buildSegmentClipsForTrack(segments, trackLocales, track.id),
    });
  }

  return rows;
}
