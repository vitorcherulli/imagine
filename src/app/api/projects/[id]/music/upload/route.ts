import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { defaultMusic2TimelineStartSeconds } from "@/lib/music-duration-mismatch";
import { normalizeMusicStartSeconds } from "@/lib/music-timeline";
import { registerMediaLibraryAssetSafe } from "@/lib/media-library-server";
import { deleteMediaByPublicUrl, saveBuffer, withCacheBuster } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
]);

function extForMime(mime: string, filename: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("flac")) return ".flac";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("aac")) return ".aac";
  if (mime.includes("m4a") || mime.includes("mp4")) return ".m4a";
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (
    fromName === "mp3" ||
    fromName === "wav" ||
    fromName === "flac" ||
    fromName === "ogg" ||
    fromName === "webm" ||
    fromName === "aac" ||
    fromName === "m4a"
  ) {
    return `.${fromName}`;
  }
  return ".mp3";
}

function safeFilename(originalName: string, ext: string, prefix: string): string {
  const base =
    originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "track";
  return `${prefix}${base}${ext}`;
}

async function getProject(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("audio") ?? form.get("music");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an audio file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Audio file is larger than 50MB." }, { status: 400 });
  }

  const slot = String(form.get("slot") ?? "1");
  const isSecond = slot === "2";
  if (isSecond && !project.musicUrl?.trim()) {
    return NextResponse.json({ error: "Add a primary music track first." }, { status: 400 });
  }

  const mime = file.type || "audio/mpeg";
  if (!ALLOWED_TYPES.has(mime)) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExt = new Set(["mp3", "wav", "flac", "ogg", "webm", "aac", "m4a"]);
    if (!ext || !allowedExt.has(ext)) {
      return NextResponse.json(
        { error: "Unsupported format. Use MP3, WAV, FLAC, OGG, M4A, AAC, or WebM." },
        { status: 400 },
      );
    }
  }

  try {
    const ext = extForMime(mime, file.name);
    const filename = safeFilename(file.name, ext, isSecond ? "music2-" : "music-");
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isSecond) {
      if (project.music2Url) await deleteMediaByPublicUrl(project.music2Url);
      const savedUrl = await saveBuffer(project.id, "_music", filename, buffer);
      const music2Url = withCacheBuster(savedUrl);
      const timelineStartRaw = form.get("music2TimelineStartSeconds");
      const clientStart =
        typeof timelineStartRaw === "string" && timelineStartRaw.trim()
          ? Number.parseFloat(timelineStartRaw)
          : NaN;
      const file1DurationRaw = form.get("file1DurationSeconds");
      const file1Duration =
        typeof file1DurationRaw === "string" && file1DurationRaw.trim()
          ? Number.parseFloat(file1DurationRaw)
          : NaN;
      const music2TimelineStartSeconds = Number.isFinite(clientStart)
        ? Math.max(0, clientStart)
        : Number.isFinite(file1Duration)
          ? defaultMusic2TimelineStartSeconds(
              file1Duration,
              normalizeMusicStartSeconds(project.musicStartSeconds),
            )
          : project.music2TimelineStartSeconds ?? 0;

      await db
        .update(schema.projects)
        .set({
          music2Url,
          music2Status: "ready",
          music2TimelineStartSeconds,
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, project.id));

      registerMediaLibraryAssetSafe({
        userId,
        url: music2Url,
        name: file.name.trim() || "Background music (part 2)",
        mimeType: mime || undefined,
        kind: "audio",
        source: "upload",
        projectId: project.id,
      });

      return NextResponse.json({
        ok: true,
        music2Url,
        music2TimelineStartSeconds,
        status: "ready",
        slot: 2,
        filename,
      });
    }

    if (project.musicUrl) await deleteMediaByPublicUrl(project.musicUrl);

    const savedUrl = await saveBuffer(project.id, "_music", filename, buffer);
    const musicUrl = withCacheBuster(savedUrl);

    await db
      .update(schema.projects)
      .set({
        musicUrl,
        musicStatus: "ready",
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id));

    registerMediaLibraryAssetSafe({
      userId,
      url: musicUrl,
      name: file.name.trim() || "Background music",
      mimeType: mime || undefined,
      kind: "audio",
      source: "upload",
      projectId: project.id,
    });

    return NextResponse.json({
      ok: true,
      musicUrl,
      status: "ready",
      slot: 1,
      filename,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
