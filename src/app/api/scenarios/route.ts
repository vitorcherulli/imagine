import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { saveScenarioBuffer } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.userId, userId))
    .orderBy(desc(schema.scenarios.updatedAt));

  return NextResponse.json({ scenarios: rows });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim() || null;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name too long" }, { status: 400 });

  const files = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > 8) {
    return NextResponse.json({ error: "Max 8 images per scenario" }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${f.name} is larger than 20MB` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json(
        { error: `${f.name} has unsupported type ${f.type}` },
        { status: 400 },
      );
    }
  }

  const id = createId();
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const buf = Buffer.from(await f.arrayBuffer());
    const url = await saveScenarioBuffer(userId, id, `ref_${i}.${ext}`, buf);
    urls.push(url);
  }

  const now = new Date();
  await db.insert(schema.scenarios).values({
    id,
    userId,
    name,
    description,
    imageUrls: JSON.stringify(urls),
    primaryImageUrl: urls[0] ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.id, id))
    .limit(1);

  return NextResponse.json({ scenario: created });
}
