import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getDubSegmentForUser, listDubSegments } from "@/lib/dubbing/helpers";
import {
  ensureDubTracksMigrated,
  getLocaleForSegmentTrack,
  listDubTracks,
  syncPrimaryTrackToSegments,
  updateDubSegmentLocale,
} from "@/lib/dubbing/tracks";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  translatedText: z.string().min(0).max(4000).optional(),
  trackId: z.string().optional(),
  status: z
    .enum(["pending", "transcribed", "translated", "synthesized", "error"])
    .optional(),
});

interface Params {
  params: Promise<{ id: string; sid: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, sid } = await params;
  const owned = await getDubSegmentForUser(sid, userId);
  if (!owned || owned.project.id !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = owned.project;
  const segments = await listDubSegments(id);
  await ensureDubTracksMigrated(project, segments);

  const tracks = await listDubTracks(id);
  const resolvedTrackId =
    parsed.data.trackId ??
    tracks.find((t) => t.languageId === project.dubTargetLanguage)?.id ??
    tracks[0]?.id;
  if (!resolvedTrackId) {
    return NextResponse.json({ error: "No dub track" }, { status: 400 });
  }

  const locale = await getLocaleForSegmentTrack(sid, resolvedTrackId);
  if (!locale) {
    return NextResponse.json({ error: "Locale not found" }, { status: 404 });
  }

  const localePatch: Parameters<typeof updateDubSegmentLocale>[1] = {};
  if (parsed.data.translatedText !== undefined) {
    localePatch.translatedText = parsed.data.translatedText;
    localePatch.status = "translated";
    localePatch.ttsAudioUrl = null;
    localePatch.ttsDurationSeconds = null;
    localePatch.stretchRatio = null;
  }
  if (parsed.data.status) localePatch.status = parsed.data.status;

  await updateDubSegmentLocale(locale.id, localePatch);
  await syncPrimaryTrackToSegments(project, resolvedTrackId);

  return NextResponse.json({ ok: true });
}
