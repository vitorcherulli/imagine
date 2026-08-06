import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import {
  getDubProjectForUser,
  getDubSegmentForUser,
  listDubSegments,
} from "@/lib/dubbing/helpers";
import { synthesizeDubSegment, dubSegmentNeedsShorten } from "@/lib/dubbing/synthesize";
import { shortenTranslatedLine } from "@/lib/dubbing/translate";
import { saveDubSegmentAudio } from "@/lib/dubbing/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { normalizeDubLanguage } from "@/lib/dub-languages";
import {
  ensureDubTracksMigrated,
  getDubTrack,
  getLocaleForSegmentTrack,
  listDubTracks,
  syncPrimaryTrackToSegments,
  updateDubSegmentLocale,
} from "@/lib/dubbing/tracks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  trackId: z.string().optional(),
});

interface Params {
  params: Promise<{ id: string; sid: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, sid } = await params;
  const owned = await getDubSegmentForUser(sid, userId);
  if (!owned || owned.project.id !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const segment = owned.segment;

  const raw = await req.text();
  const body = raw ? JSON.parse(raw) : {};
  const parsed = bodySchema.safeParse(body);

  const segments = await listDubSegments(id);
  await ensureDubTracksMigrated(project, segments);
  const tracks = await listDubTracks(id);
  const trackId =
    (parsed.success ? parsed.data.trackId : undefined) ??
    tracks.find((t) => t.languageId === project.dubTargetLanguage)?.id ??
    tracks[0]?.id;
  if (!trackId) {
    return NextResponse.json({ error: "No dub track" }, { status: 400 });
  }
  const track = await getDubTrack(trackId, id);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const locale = await getLocaleForSegmentTrack(sid, trackId);
  if (!locale?.translatedText.trim()) {
    return NextResponse.json(
      { error: "Segment has no translated text — translate it first" },
      { status: 400 },
    );
  }

  const models = resolveProjectApiModels(project);
  const voice = project.dubUseVoiceClone
    ? project.dubClonedVoiceId ?? models.ttsVoice
    : models.ttsVoice;

  try {
    const targetLanguage = normalizeDubLanguage(track.languageId);
    let currentText = locale.translatedText;
    let attempt = 0;
    const MAX_SHORTEN_ATTEMPTS = 4;
    let result = await synthesizeDubSegment(
      {
        id: segment.id,
        text: currentText,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
      {
        ttsModel: models.ttsModel,
        voice: voice ?? undefined,
        voiceTone: project.voiceTone,
        speed: project.ttsSpeed ?? 1,
      },
    );

    while (dubSegmentNeedsShorten(result) && attempt < MAX_SHORTEN_ATTEMPTS) {
      attempt += 1;
      try {
        const shorter = await shortenTranslatedLine({
          targetLanguage,
          originalSource: segment.sourceText,
          currentTranslation: currentText,
          targetSeconds: Math.max(0.5, segment.endSeconds - segment.startSeconds),
          model: models.llmModel,
          attempt,
        });
        if (!shorter || shorter === currentText) break;
        currentText = shorter;
        result = await synthesizeDubSegment(
          {
            id: segment.id,
            text: currentText,
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
          },
          {
            ttsModel: models.ttsModel,
            voice: voice ?? undefined,
            voiceTone: project.voiceTone,
            speed: project.ttsSpeed ?? 1,
          },
        );
      } catch {
        break;
      }
    }

    const url = await saveDubSegmentAudio({
      projectId: id,
      segmentId: sid,
      buffer: result.buffer,
      filename: `${track.languageId}_${result.filename}`,
    });
    await updateDubSegmentLocale(locale.id, {
      translatedText: currentText,
      ttsAudioUrl: url,
      ttsDurationSeconds: result.ttsDurationSeconds,
      ttsModel: result.modelUsed,
      ttsVoice: result.voiceUsed || null,
      stretchRatio: result.stretchRatio,
      status: "synthesized",
      errorMessage: result.overflowed
        ? `Voice still slightly over the original slot (${result.stretchRatio.toFixed(2)}x max stretch).`
        : null,
    });
    await syncPrimaryTrackToSegments(project, trackId);

    return NextResponse.json({
      ok: true,
      ttsAudioUrl: url,
      translatedText: currentText,
      overflowed: result.overflowed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateDubSegmentLocale(locale.id, {
      status: "error",
      errorMessage: message.slice(0, 500),
    });
    return NextResponse.json(
      { error: "Synthesis failed", details: message },
      { status: 500 },
    );
  }
}
