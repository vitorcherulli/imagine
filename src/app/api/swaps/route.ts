import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { isModelId } from "@/lib/model-catalog";
import { readMediaBuffer } from "@/lib/storage";
import {
  addSwapPeople,
  createPersonSwap,
  listSwaps,
  peopleFromForm,
} from "@/lib/person-swap-server";
import {
  isPersonSwapMode,
  isPersonSwapVoiceMode,
  PERSON_SWAP_MAX_PEOPLE,
  PERSON_SWAP_MAX_UPLOAD_BYTES,
} from "@/lib/person-swap";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Media the user may reuse: their own storage folders or one of their projects. */
async function ownsMediaUrl(userId: string, url: string): Promise<boolean> {
  const pathOnly = url.split("?")[0] ?? "";
  if (!pathOnly.startsWith("/api/media/")) return false;
  const parts = decodeURIComponent(pathOnly.slice("/api/media/".length)).split("/");
  if (parts.includes("..")) return false;
  if (parts.includes(userId)) return true;
  if (parts[0] !== "generated" || !parts[1]) return false;
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, parts[1]), eq(schema.projects.userId, userId)))
    .limit(1);
  return !!project;
}

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ swaps: await listSwaps(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("video");
  const sourceUrl = String(form.get("sourceUrl") ?? "").trim();

  let buffer: Buffer;
  let filename: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > PERSON_SWAP_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Video is larger than 300MB" }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    filename = file.name || "video.mp4";
  } else if (sourceUrl) {
    if (!(await ownsMediaUrl(userId, sourceUrl))) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    buffer = await readMediaBuffer(sourceUrl);
    filename = sourceUrl.split("?")[0]?.split("/").pop() || "video.mp4";
  } else {
    return NextResponse.json({ error: "Drop a video to start" }, { status: 400 });
  }

  const modeRaw = form.get("mode");
  const voiceModeRaw = form.get("voiceMode");
  const videoModel = String(form.get("videoModel") ?? "");
  const imageModel = String(form.get("imageModel") ?? "");
  const voiceId = String(form.get("voiceId") ?? "").trim().slice(0, 64) || null;

  let swap;
  try {
    swap = await createPersonSwap({
      userId,
      name: String(form.get("name") ?? "").trim().slice(0, 80) || filename.replace(/\.[^.]+$/, "") || "Person swap",
      buffer,
      filename,
      videoModel: isModelId(videoModel) ? videoModel : null,
      imageModel: isModelId(imageModel) ? imageModel : null,
      mode: isPersonSwapMode(modeRaw) ? modeRaw : "person",
      scenarioId: String(form.get("scenarioId") ?? "").trim() || null,
      instructions: String(form.get("instructions") ?? "").trim().slice(0, 1000) || null,
      voiceMode: isPersonSwapVoiceMode(voiceModeRaw) && voiceId ? voiceModeRaw : "original",
      voiceId,
    });
  } catch (err) {
    console.error("[person-swap] create failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read this video" },
      { status: 400 },
    );
  }

  try {
    const people = (await peopleFromForm(form, userId, swap.id)).slice(0, PERSON_SWAP_MAX_PEOPLE);
    await addSwapPeople(swap, people);
  } catch (err) {
    return NextResponse.json(
      { id: swap.id, error: err instanceof Error ? err.message : "Could not add the people" },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: swap.id });
}
