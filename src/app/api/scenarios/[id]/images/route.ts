import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  MAX_SCENARIO_IMAGES,
  normalizeScenarioImages,
  parseScenarioImageUrls,
} from "@/lib/scenario-images";
import { saveScenarioBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"]);

async function getOwned(scenarioId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.scenarios)
    .where(and(eq(schema.scenarios.id, scenarioId), eq(schema.scenarios.userId, userId)))
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

  const existing = parseScenarioImageUrls(row);
  if (existing.length + files.length > MAX_SCENARIO_IMAGES) {
    return NextResponse.json(
      { error: `Max ${MAX_SCENARIO_IMAGES} images per scenario (${existing.length} already).` },
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
      await saveScenarioBuffer(userId, row.id, `ref_${createId().slice(0, 8)}.${ext}`, buf),
    );
  }

  const normalized = normalizeScenarioImages({
    imageUrls: [...existing, ...newUrls],
    primaryImageUrl: row.primaryImageUrl,
  });

  await db
    .update(schema.scenarios)
    .set({
      imageUrls: JSON.stringify(normalized.imageUrls),
      primaryImageUrl: normalized.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenarios.id, row.id));

  const [scenario] = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.id, row.id))
    .limit(1);

  return NextResponse.json({ scenario, added: newUrls });
}

const deleteSchema = z.object({ url: z.string().min(1) });

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = parseScenarioImageUrls(row);
  const nextUrls = existing.filter((u) => u !== parsed.data.url);
  if (nextUrls.length === existing.length) {
    return NextResponse.json({ error: "Image not found on this scenario." }, { status: 404 });
  }

  const normalized = normalizeScenarioImages({
    imageUrls: nextUrls,
    primaryImageUrl: row.primaryImageUrl === parsed.data.url ? nextUrls[0] ?? null : row.primaryImageUrl,
  });

  await db
    .update(schema.scenarios)
    .set({
      imageUrls: JSON.stringify(normalized.imageUrls),
      primaryImageUrl: normalized.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenarios.id, row.id));

  const [scenario] = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.id, row.id))
    .limit(1);

  return NextResponse.json({ scenario });
}
