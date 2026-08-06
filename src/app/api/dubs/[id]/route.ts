import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  getDubProjectForUser,
  getDubSource,
  listDubSegments,
  updateDubProject,
} from "@/lib/dubbing/helpers";
import {
  ensureDubTracksMigrated,
  listDubSegmentLocales,
  listDubTracks,
} from "@/lib/dubbing/tracks";
import { normalizeDubLanguage } from "@/lib/dub-languages";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [source, segments, renders] = await Promise.all([
    getDubSource(id),
    listDubSegments(id),
    db
      .select()
      .from(schema.dubbingRenders)
      .where(eq(schema.dubbingRenders.projectId, id))
      .orderBy(desc(schema.dubbingRenders.createdAt)),
  ]);
  const tracks = await ensureDubTracksMigrated(project, segments);
  const locales = await listDubSegmentLocales(id);
  return NextResponse.json({ project, source, segments, tracks, locales, renders });
}

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  dubTargetLanguage: z.string().optional(),
  dubBackgroundGain: z.number().min(0).max(1).optional(),
  dubUseVoiceClone: z.boolean().optional(),
  ttsModel: z.string().optional(),
  llmModel: z.string().optional(),
  ttsVoice: z.string().nullable().optional(),
  voiceTone: z.string().optional(),
  folderId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: Parameters<typeof updateDubProject>[1] = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.dubTargetLanguage !== undefined) {
    patch.dubTargetLanguage = normalizeDubLanguage(parsed.data.dubTargetLanguage);
  }
  if (parsed.data.dubBackgroundGain !== undefined) {
    patch.dubBackgroundGain = parsed.data.dubBackgroundGain;
  }
  if (parsed.data.dubUseVoiceClone !== undefined) {
    patch.dubUseVoiceClone = parsed.data.dubUseVoiceClone;
  }
  if (parsed.data.ttsModel !== undefined) patch.ttsModel = parsed.data.ttsModel;
  if (parsed.data.llmModel !== undefined) patch.llmModel = parsed.data.llmModel;
  if (parsed.data.ttsVoice !== undefined) patch.ttsVoice = parsed.data.ttsVoice;
  if (parsed.data.voiceTone !== undefined) patch.voiceTone = parsed.data.voiceTone;
  if (parsed.data.folderId !== undefined) patch.folderId = parsed.data.folderId;

  await updateDubProject(id, patch);
  const updated = await getDubProjectForUser(id, userId);
  return NextResponse.json({ project: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getDubProjectForUser(id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
}
