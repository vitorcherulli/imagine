import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getDubProjectForUser, listDubSegments } from "@/lib/dubbing/helpers";
import { addDubTrack, ensureDubTracksMigrated } from "@/lib/dubbing/tracks";
import { processDubbingProject } from "@/lib/dubbing/process";
import { normalizeDubLanguage } from "@/lib/dub-languages";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const bodySchema = z.object({
  languageId: z.string().min(2).max(8),
  /** Run translate + voice for the new row immediately. */
  process: z.boolean().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const languageId = normalizeDubLanguage(parsed.data.languageId);
  const segments = await listDubSegments(id);
  if (segments.length === 0) {
    return NextResponse.json(
      { error: "Transcribe the source first before adding languages" },
      { status: 400 },
    );
  }

  try {
    await ensureDubTracksMigrated(project, segments);
    const track = await addDubTrack(project, languageId);

    if (parsed.data.process !== false) {
      await processDubbingProject(
        { ...project, dubTargetLanguage: languageId },
        { stages: ["translate", "synthesize"], trackId: track.id },
      );
    }

    return NextResponse.json({ track });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
