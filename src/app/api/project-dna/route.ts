import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { saveProjectDnaLogoBuffer } from "@/lib/storage";
import { normalizeDnaStyleInput } from "@/lib/dna-style";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.projectDna)
    .where(eq(schema.projectDna.userId, userId))
    .orderBy(desc(schema.projectDna.updatedAt));

  return NextResponse.json({ projectDna: rows });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim() || null;
  const style = normalizeDnaStyleInput({
    genre: String(form.get("genre") ?? ""),
    visualStyle: String(form.get("visualStyle") ?? ""),
    voiceTone: String(form.get("voiceTone") ?? ""),
    colorPalette: String(form.get("colorPalette") ?? ""),
    visualMood: String(form.get("visualMood") ?? ""),
  });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name too long" }, { status: 400 });
  if (description && description.length > 4000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  const logoFile = form.get("logo");
  let logoUrl: string | null = null;
  const id = createId();

  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Logo is larger than 4MB" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(logoFile.type)) {
      return NextResponse.json(
        { error: `Unsupported logo type ${logoFile.type}` },
        { status: 400 },
      );
    }
    const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
    const buf = Buffer.from(await logoFile.arrayBuffer());
    logoUrl = await saveProjectDnaLogoBuffer(userId, id, `logo.${ext}`, buf);
  }

  const now = new Date();
  await db.insert(schema.projectDna).values({
    id,
    userId,
    name,
    description,
    logoUrl,
    genre: style.genre ?? null,
    visualStyle: style.visualStyle ?? null,
    voiceTone: style.voiceTone ?? null,
    colorPalette: style.colorPalette ?? null,
    visualMood: style.visualMood ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(schema.projectDna)
    .where(eq(schema.projectDna.id, id))
    .limit(1);

  return NextResponse.json({ projectDna: created });
}
