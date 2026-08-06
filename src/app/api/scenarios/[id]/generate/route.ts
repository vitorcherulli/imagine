import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  generateScenarioImage,
  generateScenarioPerspectiveImage,
} from "@/lib/scenario-generate-server";
import {
  SCENARIO_PERSPECTIVE_PRESETS,
} from "@/lib/scenario-perspective-presets";
import { IMAGE_MODEL_OPTIONS } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const bodySchema = z.object({
  prompt: z.string().max(800).optional(),
  visualStyle: z.string().max(60).nullable().optional(),
  imageModel: z.string().min(1).max(120).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  sourceImageUrl: z.string().max(2000).optional(),
  perspectiveId: z.string().max(60).optional(),
});

const PERSPECTIVE_BY_ID = new Map(SCENARIO_PERSPECTIVE_PRESETS.map((p) => [p.id, p]));

const IMAGE_MODEL_VALUES = new Set(IMAGE_MODEL_OPTIONS.map((o) => o.value));

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const imageModel =
    parsed.data.imageModel && IMAGE_MODEL_VALUES.has(parsed.data.imageModel)
      ? parsed.data.imageModel
      : undefined;

  const isPerspective = Boolean(parsed.data.sourceImageUrl);
  const customPrompt = parsed.data.prompt?.trim();

  try {
    let generated;
    if (isPerspective) {
      const preset = parsed.data.perspectiveId
        ? PERSPECTIVE_BY_ID.get(parsed.data.perspectiveId)
        : undefined;
      const perspectivePrompt = customPrompt || preset?.prompt;
      if (!perspectivePrompt) {
        return NextResponse.json(
          { error: "Choose a perspective preset or describe the new angle." },
          { status: 400 },
        );
      }
      generated = await generateScenarioPerspectiveImage({
        userId,
        scenario: row,
        sourceImageUrl: parsed.data.sourceImageUrl!,
        perspectivePrompt,
        visualStyle: parsed.data.visualStyle ?? null,
        imageModel,
        aspectRatio: parsed.data.aspectRatio,
      });
    } else {
      if (!customPrompt || customPrompt.length < 3) {
        return NextResponse.json({ error: "Describe the scene." }, { status: 400 });
      }
      generated = await generateScenarioImage({
        userId,
        scenario: row,
        prompt: customPrompt,
        visualStyle: parsed.data.visualStyle ?? null,
        imageModel,
        aspectRatio: parsed.data.aspectRatio,
      });
    }

    await db
      .update(schema.scenarios)
      .set({
        imageUrls: JSON.stringify(generated.imageUrls),
        primaryImageUrl: generated.primaryImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.scenarios.id, row.id));

    const [scenario] = await db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.id, row.id))
      .limit(1);

    return NextResponse.json({ ok: true, scenario, imageUrl: generated.imageUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
