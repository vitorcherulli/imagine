import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { VariationItem, VariationSet } from "@/lib/db/schema";
import { generateImage } from "@/lib/openrouter/images";
import { OPENROUTER_MODELS, openRouterHeaders } from "@/lib/openrouter/client";
import { submitVideo, waitForVideo } from "@/lib/openrouter/videos";
import { pickVideoRequestDuration } from "@/lib/ffmpeg";
import {
  closestSupportedAspect,
  closestSupportedDuration,
  preferredVideoResolution,
} from "@/lib/model-catalog";
import { catalogImageParams, imageResultToBuffer } from "@/lib/image-model-params";
import { getCatalogModel } from "@/lib/model-catalog-server";
import { registerGeneratedMediaSafe } from "@/lib/media-library-server";
import {
  deleteMediaByPublicUrl,
  readImageAsDataUrl,
  readImageAsVideoFrameUrl,
  saveVariationBuffer,
  withCacheBuster,
} from "@/lib/storage";
import {
  isVariationImageModel,
  isVariationVideoModel,
  normalizeVariationTextMode,
  ORIGINAL_DIRECTION,
  VARIATIONS_GALLERY_FOLDER,
  VARIATION_DIRECTIONS,
} from "@/lib/variations";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";

export function resolveVariationModels(set: Pick<VariationSet, "imageModel" | "videoModel">): {
  imageModel: string;
  videoModel: string;
} {
  return {
    imageModel: isVariationImageModel(set.imageModel) ? set.imageModel : OPENROUTER_MODELS.image,
    videoModel: isVariationVideoModel(set.videoModel) ? set.videoModel : OPENROUTER_MODELS.video,
  };
}

const IMAGE_STALE_MS = 15 * 60 * 1000;
const VIDEO_STALE_MS = 30 * 60 * 1000;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export async function getOwnedVariationSet(
  setId: string,
  userId: string,
): Promise<VariationSet | null> {
  const [row] = await db
    .select()
    .from(schema.variationSets)
    .where(and(eq(schema.variationSets.id, setId), eq(schema.variationSets.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getOwnedVariationItem(
  itemId: string,
  userId: string,
): Promise<VariationItem | null> {
  const [row] = await db
    .select()
    .from(schema.variationItems)
    .where(and(eq(schema.variationItems.id, itemId), eq(schema.variationItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Jobs lost to a server restart stay "generating" forever; surface them as errors. */
async function failStaleJobs(setId: string): Promise<void> {
  const now = Date.now();
  await db
    .update(schema.variationItems)
    .set({ status: "error", error: "Interrupted — try again.", updatedAt: new Date() })
    .where(
      and(
        eq(schema.variationItems.setId, setId),
        eq(schema.variationItems.status, "generating"),
        lt(schema.variationItems.updatedAt, new Date(now - IMAGE_STALE_MS)),
      ),
    );
  await db
    .update(schema.variationItems)
    .set({ videoStatus: "error", videoError: "Interrupted — try again.", updatedAt: new Date() })
    .where(
      and(
        eq(schema.variationItems.setId, setId),
        eq(schema.variationItems.videoStatus, "generating"),
        lt(schema.variationItems.updatedAt, new Date(now - VIDEO_STALE_MS)),
      ),
    );
}

export async function listVariationItems(setId: string): Promise<VariationItem[]> {
  await failStaleJobs(setId);
  return db
    .select()
    .from(schema.variationItems)
    .where(eq(schema.variationItems.setId, setId))
    .orderBy(asc(schema.variationItems.createdAt), asc(schema.variationItems.id));
}

function buildVariationPrompt(
  direction: string,
  instructions: string | null,
  headline: string | null,
): string {
  const textRules = headline
    ? [
        "TEXT — MANDATORY: erase ALL of the original text from the ad completely (headline, subheadline, taglines). None of the old words may remain.",
        "The ONLY text in the new image must be exactly this, with these line breaks, correct spelling and accents:",
        `«${headline}»`,
        "Lay it out like the original: big bold headline, key words emphasized in the accent color. Do not add any other words.",
      ]
    : [
        "If the reference contains text, reproduce the same text exactly (same language, same spelling), clean and legible.",
      ];
  return [
    "The attached image is an existing advertisement creative. Create ONE new variation of this ad.",
    "KEEP: the exact same product (shape, colors, packaging, label and logo) and the same brand identity.",
    ...textRules,
    `CHANGE: ${direction}.`,
    instructions?.trim() ? `Extra instructions from the client (these override the visual rules above): ${instructions.trim()}` : "",
    "Polished, professional ad quality. No watermarks, no gibberish text.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reads the ad's current copy and writes `count` distinct replacements in the same language. */
async function writeVariationHeadlines(
  set: VariationSet,
  count: number,
  avoid: string[],
): Promise<string[]> {
  const image = await readImageAsDataUrl(set.sourceImageUrl);
  const raw = await chatCompletion({
    messages: [
      {
        role: "system",
        content: [
          "You are a senior direct-response copywriter for image ads.",
          "Read ALL the text written on the ad image. Then write new versions of that text to replace it completely.",
          "Rules: same language as the ad; similar length (±25%) and the same structure (headline, plus a supporting line only if the original has one);",
          "punchier and more persuasive; keep the offer/promise and any numbers that matter; no hashtags, no emojis, no quotes.",
          "Use \\n for line breaks, 2–5 short lines total. Every version must be clearly different from the original and from each other.",
          'Respond ONLY with JSON: {"original_text": string, "language": string, "headlines": string[]}',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Write ${count} new version(s) of the text on this ad.`,
              set.instructions?.trim() ? `Client instructions: ${set.instructions.trim()}` : "",
              avoid.length ? `Do not repeat these previous versions:\n${avoid.join("\n---\n")}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    temperature: 0.9,
    response_format: { type: "json_object" },
  });
  const json = extractJson<{ headlines?: unknown }>(raw);
  const headlines = (Array.isArray(json.headlines) ? json.headlines : [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => h.replace(/\\n/g, "\n").trim().slice(0, 300));
  if (headlines.length === 0) throw new Error("The AI could not write a new headline.");
  return Array.from({ length: count }, (_, i) => headlines[i % headlines.length]);
}

async function runVariationImage(set: VariationSet, item: VariationItem): Promise<void> {
  try {
    const model = isVariationImageModel(item.imageModel)
      ? item.imageModel
      : resolveVariationModels(set).imageModel;
    const reference = await readImageAsDataUrl(set.sourceImageUrl);
    const img = await generateImage({
      prompt: buildVariationPrompt(
        item.direction ?? VARIATION_DIRECTIONS[0].prompt,
        set.instructions,
        item.headline,
      ),
      model,
      ...(await catalogImageParams(model, set.aspectRatio, { withReferences: true })),
      referenceImages: [reference],
      referenceImagesFirst: true,
    });
    const buffer = await imageResultToBuffer(img);
    const imageUrl = withCacheBuster(
      await saveVariationBuffer(set.userId, set.id, `${item.id}.png`, buffer),
    );
    await db
      .update(schema.variationItems)
      .set({ imageUrl, status: "ready", error: null, updatedAt: new Date() })
      .where(eq(schema.variationItems.id, item.id));
    registerGeneratedMediaSafe({ userId: set.userId, url: imageUrl, name: set.name, product: VARIATIONS_GALLERY_FOLDER });
  } catch (err) {
    console.error(`[variations] image ${item.id} failed`, err);
    await db
      .update(schema.variationItems)
      .set({ status: "error", error: errorMessage(err), updatedAt: new Date() })
      .where(eq(schema.variationItems.id, item.id));
  }
}

/** Insert `count` pending variations and generate them in the background. */
export async function startVariations(set: VariationSet, count: number): Promise<VariationItem[]> {
  const existing = await db
    .select({ id: schema.variationItems.id })
    .from(schema.variationItems)
    .where(eq(schema.variationItems.setId, set.id));
  const offset = Math.max(0, existing.length - 1);
  const { imageModel } = resolveVariationModels(set);
  const textMode = normalizeVariationTextMode(set.textMode);
  const customText = textMode === "custom" ? set.customText?.trim() || null : null;
  const now = new Date();
  const rows = Array.from({ length: count }, (_, i) => ({
    id: createId(),
    setId: set.id,
    userId: set.userId,
    direction: VARIATION_DIRECTIONS[(offset + i) % VARIATION_DIRECTIONS.length].prompt,
    imageModel,
    headline: customText,
    status: "generating",
    createdAt: new Date(now.getTime() + i),
    updatedAt: now,
  }));
  await db.insert(schema.variationItems).values(rows);
  const items = await db
    .select()
    .from(schema.variationItems)
    .where(inArray(schema.variationItems.id, rows.map((r) => r.id)));

  if (textMode !== "rewrite") {
    for (const item of items) void runVariationImage(set, item);
    return items;
  }

  void (async () => {
    let headlines: string[];
    try {
      const previous = await db
        .select({ headline: schema.variationItems.headline })
        .from(schema.variationItems)
        .where(eq(schema.variationItems.setId, set.id));
      headlines = await writeVariationHeadlines(
        set,
        items.length,
        previous.map((p) => p.headline).filter((h): h is string => !!h).slice(-12),
      );
    } catch (err) {
      console.error("[variations] headline writing failed", err);
      await db
        .update(schema.variationItems)
        .set({ status: "error", error: `Headline: ${errorMessage(err)}`, updatedAt: new Date() })
        .where(inArray(schema.variationItems.id, items.map((i) => i.id)));
      return;
    }
    for (const [i, item] of items.entries()) {
      const headline = headlines[i];
      await db
        .update(schema.variationItems)
        .set({ headline })
        .where(eq(schema.variationItems.id, item.id));
      void runVariationImage(set, { ...item, headline });
    }
  })();
  return items;
}

/** Retries with the product's current image model, so switching models can fix a failing one. */
export async function retryVariation(set: VariationSet, item: VariationItem): Promise<void> {
  const { imageModel } = resolveVariationModels(set);
  await db
    .update(schema.variationItems)
    .set({ status: "generating", error: null, imageModel, updatedAt: new Date() })
    .where(eq(schema.variationItems.id, item.id));
  void (async () => {
    let headline = item.headline;
    if (!headline && normalizeVariationTextMode(set.textMode) === "rewrite") {
      try {
        [headline] = await writeVariationHeadlines(set, 1, []);
        await db
          .update(schema.variationItems)
          .set({ headline })
          .where(eq(schema.variationItems.id, item.id));
      } catch (err) {
        await db
          .update(schema.variationItems)
          .set({ status: "error", error: `Headline: ${errorMessage(err)}`, updatedAt: new Date() })
          .where(eq(schema.variationItems.id, item.id));
        return;
      }
    }
    await runVariationImage(set, { ...item, imageModel, headline });
  })();
}

export async function createOriginalItem(set: VariationSet): Promise<void> {
  const now = new Date();
  await db.insert(schema.variationItems).values({
    id: createId(),
    setId: set.id,
    userId: set.userId,
    direction: ORIGINAL_DIRECTION,
    imageUrl: set.sourceImageUrl,
    status: "ready",
    createdAt: new Date(now.getTime() - 1000),
    updatedAt: now,
  });
}

function videoAspectFor(aspect: string): "16:9" | "9:16" | "1:1" {
  if (aspect === "16:9") return "16:9";
  if (aspect === "1:1") return "1:1";
  return "9:16";
}

function buildVideoPrompt(extra: string | null): string {
  return [
    "Animate this advertisement image into a short, smooth, professional product ad clip.",
    "Keep the product, logo and any text exactly as they are — stable, sharp and legible the whole time.",
    "Subtle cinematic camera motion (slow push-in or gentle parallax) and soft lighting movement. No new text.",
    extra?.trim() ? `Direction: ${extra.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runVariationVideo(
  set: VariationSet,
  item: VariationItem,
  opts: { prompt: string | null; durationSeconds: number; videoModel: string },
): Promise<void> {
  try {
    if (!item.imageUrl) throw new Error("This variation has no image yet.");
    const model = opts.videoModel;
    const info = await getCatalogModel("video", model);
    if (info && !info.frameImages?.includes("first_frame")) {
      throw new Error(`${info.label} can't start from an image — pick another video AI.`);
    }
    const aspect = closestSupportedAspect(videoAspectFor(set.aspectRatio), info?.aspectRatios);
    const frameUrl = await readImageAsVideoFrameUrl(item.imageUrl, aspect);
    const submit = await submitVideo({
      prompt: buildVideoPrompt(opts.prompt),
      model,
      duration:
        closestSupportedDuration(opts.durationSeconds, info?.durations) ??
        pickVideoRequestDuration(opts.durationSeconds, model),
      aspect_ratio: aspect,
      resolution: preferredVideoResolution(info?.resolutions),
      frame_images: [{ url: frameUrl, frame: "first_frame" }],
    });
    const result = await waitForVideo(submit.id, { pollingUrl: submit.polling_url });
    const fileUrl = result.unsigned_urls?.[0] ?? result.signed_urls?.[0];
    if (!fileUrl) throw new Error("Video response had no URL");
    const res = await fetch(fileUrl, { headers: openRouterHeaders() });
    if (!res.ok) throw new Error(`Video download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error("Downloaded video is empty");
    const videoUrl = withCacheBuster(
      await saveVariationBuffer(set.userId, set.id, `${item.id}.mp4`, buf),
    );
    await db
      .update(schema.variationItems)
      .set({ videoUrl, videoStatus: "ready", videoError: null, updatedAt: new Date() })
      .where(eq(schema.variationItems.id, item.id));
    registerGeneratedMediaSafe({
      userId: set.userId,
      url: videoUrl,
      name: set.name,
      product: VARIATIONS_GALLERY_FOLDER,
      kind: "video",
    });
  } catch (err) {
    console.error(`[variations] video ${item.id} failed`, err);
    await db
      .update(schema.variationItems)
      .set({ videoStatus: "error", videoError: errorMessage(err), updatedAt: new Date() })
      .where(eq(schema.variationItems.id, item.id));
  }
}

export async function startVariationVideo(
  set: VariationSet,
  item: VariationItem,
  opts: { prompt: string | null; durationSeconds: number; videoModel: string },
): Promise<void> {
  await db
    .update(schema.variationItems)
    .set({
      videoStatus: "generating",
      videoError: null,
      videoModel: opts.videoModel,
      updatedAt: new Date(),
    })
    .where(eq(schema.variationItems.id, item.id));
  void runVariationVideo(set, item, opts);
}

export async function deleteVariationItemMedia(item: VariationItem): Promise<void> {
  if (item.direction !== ORIGINAL_DIRECTION) await deleteMediaByPublicUrl(item.imageUrl);
  await deleteMediaByPublicUrl(item.videoUrl);
}