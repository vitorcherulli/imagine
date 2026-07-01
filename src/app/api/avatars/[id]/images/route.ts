import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  MAX_AVATAR_IMAGES,
  normalizeAvatarImages,
  parseAvatarImageUrls,
} from "@/lib/avatar-images";
import { saveAvatarBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"]);

async function getOwned(avatarId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.avatars)
    .where(and(eq(schema.avatars.id, avatarId), eq(schema.avatars.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one image to upload." }, { status: 400 });
  }

  const existing = parseAvatarImageUrls(row);
  if (existing.length + files.length > MAX_AVATAR_IMAGES) {
    return NextResponse.json(
      { error: `Max ${MAX_AVATAR_IMAGES} images per avatar (${existing.length} already).` },
      { status: 400 },
    );
  }

  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${f.name} is larger than 20MB.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return NextResponse.json({ error: `${f.name}: unsupported type ${f.type}` }, { status: 400 });
    }
  }

  const newUrls: string[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const buf = Buffer.from(await f.arrayBuffer());
    newUrls.push(
      await saveAvatarBuffer(userId, row.id, `ref_${createId().slice(0, 8)}.${ext}`, buf),
    );
  }

  const normalized = normalizeAvatarImages({
    imageUrls: [...existing, ...newUrls],
    primaryImageUrl: row.primaryImageUrl,
  });

  await db
    .update(schema.avatars)
    .set({
      imageUrls: JSON.stringify(normalized.imageUrls),
      primaryImageUrl: normalized.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.avatars.id, row.id));

  const [avatar] = await db
    .select()
    .from(schema.avatars)
    .where(eq(schema.avatars.id, row.id))
    .limit(1);

  return NextResponse.json({ avatar, added: newUrls });
}

const deleteSchema = z.object({
  url: z.string().min(1),
});

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = parseAvatarImageUrls(row);
  const nextUrls = existing.filter((u) => u !== parsed.data.url);
  if (nextUrls.length === existing.length) {
    return NextResponse.json({ error: "Image not found on this avatar." }, { status: 404 });
  }
  if (nextUrls.length === 0) {
    return NextResponse.json({ error: "Keep at least one reference image." }, { status: 400 });
  }

  const normalized = normalizeAvatarImages({
    imageUrls: nextUrls,
    primaryImageUrl: row.primaryImageUrl === parsed.data.url ? nextUrls[0]! : row.primaryImageUrl,
  });

  await db
    .update(schema.avatars)
    .set({
      imageUrls: JSON.stringify(normalized.imageUrls),
      primaryImageUrl: normalized.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.avatars.id, row.id));

  const [avatar] = await db
    .select()
    .from(schema.avatars)
    .where(eq(schema.avatars.id, row.id))
    .limit(1);

  return NextResponse.json({ avatar });
}
