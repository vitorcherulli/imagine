import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getDubProjectForUser } from "@/lib/dubbing/helpers";
import { processDubbingProject, clearDubPipelineProgress } from "@/lib/dubbing/process";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const bodySchema = z.object({
  stages: z
    .array(z.enum(["transcribe", "translate", "synthesize", "clone"]))
    .optional(),
  force: z.boolean().optional(),
  trackId: z.string().optional(),
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

  const raw = await req.text();
  const body = raw ? JSON.parse(raw) : {};
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await processDubbingProject(project, {
      stages: parsed.data.stages,
      force: parsed.data.force,
      trackId: parsed.data.trackId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await clearDubPipelineProgress(id);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Processing failed", details: message },
      { status: 500 },
    );
  }
}
