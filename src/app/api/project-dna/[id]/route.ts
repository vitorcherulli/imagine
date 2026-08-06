import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { saveProjectDnaLogoBuffer, deleteProjectDnaMedia, deleteMediaByPublicUrl } from "@/lib/storage";
import { dnaProjectDefaultsSchema } from "@/lib/dna-project-defaults";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

async function getOwned(dnaId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.projectDna)
    .where(and(eq(schema.projectDna.id, dnaId), eq(schema.projectDna.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ projectDna: row });
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(4000).nullable().optional(),
    removeLogo: z.boolean().optional(),
    genre: z.string().max(60).nullable().optional(),
    visualStyle: z.string().max(60).nullable().optional(),
    voiceTone: z.string().max(60).nullable().optional(),
    colorPalette: z.string().max(500).nullable().optional(),
    visualMood: z.string().max(1000).nullable().optional(),
    learnedNotes: z.string().max(8000).nullable().optional(),
  })
  .merge(dnaProjectDefaultsSchema);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  let patch: z.infer<typeof patchSchema> = {};
  let logoUrl = row.logoUrl;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const name = form.get("name");
    const description = form.get("description");
    const removeLogo = form.get("removeLogo");
    if (name != null) patch.name = String(name).trim();
    if (description != null) {
      const desc = String(description).trim();
      patch.description = desc || null;
    }
    if (removeLogo === "true" || removeLogo === "1") patch.removeLogo = true;

    const logoFile = form.get("logo");
    if (logoFile instanceof File && logoFile.size > 0) {
      if (logoFile.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "Logo is larger than 4MB" }, { status: 400 });
      }
      if (!ALLOWED_TYPES.includes(logoFile.type)) {
        return NextResponse.json({ error: `Unsupported logo type ${logoFile.type}` }, { status: 400 });
      }
      if (row.logoUrl) await deleteMediaByPublicUrl(row.logoUrl);
      const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const buf = Buffer.from(await logoFile.arrayBuffer());
      logoUrl = await saveProjectDnaLogoBuffer(userId, row.id, `logo.${ext}`, buf);
    }
  } else {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    patch = parsed.data;
  }

  if (patch.removeLogo) {
    if (row.logoUrl) await deleteMediaByPublicUrl(row.logoUrl);
    logoUrl = null;
  }

  const styleFields: Record<string, string | number | null> = {};
  if (patch.genre !== undefined) styleFields.genre = patch.genre;
  if (patch.visualStyle !== undefined) styleFields.visualStyle = patch.visualStyle;
  if (patch.voiceTone !== undefined) styleFields.voiceTone = patch.voiceTone;
  if (patch.colorPalette !== undefined) styleFields.colorPalette = patch.colorPalette;
  if (patch.visualMood !== undefined) styleFields.visualMood = patch.visualMood;
  if (patch.learnedNotes !== undefined) styleFields.learnedNotes = patch.learnedNotes;
  if (patch.llmModel !== undefined) styleFields.llmModel = patch.llmModel;
  if (patch.imageModel !== undefined) styleFields.imageModel = patch.imageModel;
  if (patch.videoModel !== undefined) styleFields.videoModel = patch.videoModel;
  if (patch.videoClipAudio !== undefined) styleFields.videoClipAudio = patch.videoClipAudio;
  if (patch.ttsModel !== undefined) styleFields.ttsModel = patch.ttsModel;
  if (patch.ttsVoice !== undefined) styleFields.ttsVoice = patch.ttsVoice;
  if (patch.videoFormat !== undefined) styleFields.videoFormat = patch.videoFormat;
  if (patch.cutPace !== undefined) styleFields.cutPace = patch.cutPace;
  if (patch.scriptLanguage !== undefined) styleFields.scriptLanguage = patch.scriptLanguage;
  if (patch.targetDurationSeconds !== undefined) {
    styleFields.targetDurationSeconds = patch.targetDurationSeconds;
  }

  await db
    .update(schema.projectDna)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...styleFields,
      logoUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.projectDna.id, row.id));

  const [updated] = await db
    .select()
    .from(schema.projectDna)
    .where(eq(schema.projectDna.id, row.id))
    .limit(1);

  return NextResponse.json({ projectDna: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteProjectDnaMedia(userId, row.id, row.logoUrl);
  await db.delete(schema.projectDna).where(eq(schema.projectDna.id, row.id));
  await db
    .update(schema.projects)
    .set({ projectDnaId: null })
    .where(and(eq(schema.projects.projectDnaId, row.id), eq(schema.projects.userId, userId)));

  return NextResponse.json({ ok: true });
}
