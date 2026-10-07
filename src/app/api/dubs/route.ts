import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { createDubProject, detectDubSourceType } from "@/lib/dubbing/create";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Max upload size: 500MB. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data upload" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const backgroundGainRaw = Number(form.get("backgroundGain") ?? 0);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
      },
      { status: 413 },
    );
  }

  const sourceType = detectDubSourceType(file.type || "", file.name);
  if (!sourceType) {
    return NextResponse.json(
      { error: "Unsupported file type. Use MP4/MOV/WebM (video) or MP3/M4A/WAV (audio)." },
      { status: 400 },
    );
  }

  const id = await createDubProject({
    userId,
    title,
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mimeType: file.type,
    sourceType,
    targetLanguage: String(form.get("targetLanguage") ?? "en"),
    backgroundGain: Number.isFinite(backgroundGainRaw) ? backgroundGainRaw : 0,
    useVoiceClone: String(form.get("useVoiceClone") ?? "") === "true",
    ttsVoice: String(form.get("ttsVoice") ?? "").trim() || null,
    ttsModel: String(form.get("ttsModel") ?? "").trim() || null,
    llmModel: String(form.get("llmModel") ?? "").trim() || null,
    voiceTone: String(form.get("voiceTone") ?? "").trim() || null,
    folderId: String(form.get("folderId") ?? "").trim() || null,
    sourceLanguage: String(form.get("sourceLanguage") ?? "").trim() || null,
  });

  return NextResponse.json({ id });
}

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dubs = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.contentType, "dubbing"),
      ),
    )
    .orderBy(desc(schema.projects.updatedAt));
  return NextResponse.json({ dubs });
}
