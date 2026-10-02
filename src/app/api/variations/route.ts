import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { saveVariationBuffer, withCacheBuster } from "@/lib/storage";
import { createOriginalItem, getOwnedVariationSet, startVariations } from "@/lib/variations-server";
import {
  isVariationAspect,
  isVariationImageModel,
  isVariationVideoModel,
  MAX_VARIATIONS_PER_REQUEST,
  normalizeVariationTextMode,
} from "@/lib/variations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sets = await db
    .select()
    .from(schema.variationSets)
    .where(eq(schema.variationSets.userId, userId))
    .orderBy(desc(schema.variationSets.updatedAt));

  return NextResponse.json({ sets });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Drop an image to start" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 20MB" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });

  const name = String(form.get("name") ?? "").trim().slice(0, 80) || "New product";
  const instructions = String(form.get("instructions") ?? "").trim().slice(0, 1000) || null;
  const aspectRaw = String(form.get("aspectRatio") ?? "");
  const aspectRatio = isVariationAspect(aspectRaw) ? aspectRaw : "1:1";
  const imageModelRaw = String(form.get("imageModel") ?? "");
  const videoModelRaw = String(form.get("videoModel") ?? "");
  const imageModel = isVariationImageModel(imageModelRaw) ? imageModelRaw : null;
  const videoModel = isVariationVideoModel(videoModelRaw) ? videoModelRaw : null;
  const customText = String(form.get("customText") ?? "").trim().slice(0, 300) || null;
  let textMode = normalizeVariationTextMode(form.get("textMode"));
  if (textMode === "custom" && !customText) textMode = "keep";
  const count = Math.min(
    MAX_VARIATIONS_PER_REQUEST,
    Math.max(1, Number(form.get("count")) || 4),
  );

  const id = createId();
  const sourceImageUrl = withCacheBuster(
    await saveVariationBuffer(userId, id, `source.${ext}`, Buffer.from(await file.arrayBuffer())),
  );
  const now = new Date();
  await db.insert(schema.variationSets).values({
    id,
    userId,
    name,
    sourceImageUrl,
    instructions,
    aspectRatio,
    imageModel,
    videoModel,
    textMode,
    customText,
    createdAt: now,
    updatedAt: now,
  });

  const set = await getOwnedVariationSet(id, userId);
  if (!set) return NextResponse.json({ error: "Could not create" }, { status: 500 });
  await createOriginalItem(set);
  await startVariations(set, count);

  return NextResponse.json({ set });
}
