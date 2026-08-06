import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { deleteScenarioMedia } from "@/lib/storage";
import { normalizeScenarioImages, parseScenarioImageUrls } from "@/lib/scenario-images";

export const dynamic = "force-dynamic";

async function getOwned(scenarioId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.scenarios)
    .where(and(eq(schema.scenarios.id, scenarioId), eq(schema.scenarios.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ scenario: row });
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(2000).nullable().optional(),
  primaryImageUrl: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;

  const currentUrls = parseScenarioImageUrls(row);
  if (parsed.data.imageUrls !== undefined) {
    const normalized = normalizeScenarioImages({
      imageUrls: parsed.data.imageUrls,
      primaryImageUrl: parsed.data.primaryImageUrl ?? row.primaryImageUrl,
    });
    patch.imageUrls = JSON.stringify(normalized.imageUrls);
    patch.primaryImageUrl = normalized.primaryImageUrl;
  } else if (parsed.data.primaryImageUrl !== undefined) {
    if (!currentUrls.includes(parsed.data.primaryImageUrl)) {
      return NextResponse.json(
        { error: "Primary image must be in the scenario library." },
        { status: 400 },
      );
    }
    patch.primaryImageUrl = parsed.data.primaryImageUrl;
  }

  await db.update(schema.scenarios).set(patch).where(eq(schema.scenarios.id, row.id));

  const [scenario] = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.id, row.id))
    .limit(1);

  return NextResponse.json({ ok: true, scenario });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwned(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteScenarioMedia(userId, row.id, row.imageUrls);
  await db.delete(schema.scenarios).where(eq(schema.scenarios.id, row.id));
  await db
    .update(schema.projects)
    .set({ scenarioId: null })
    .where(and(eq(schema.projects.scenarioId, row.id), eq(schema.projects.userId, userId)));

  return NextResponse.json({ ok: true });
}
