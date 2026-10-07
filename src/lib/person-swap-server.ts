import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PersonSwap, PersonSwapItem, Scenario } from "@/lib/db/schema";
import { generateImage } from "@/lib/openrouter/images";
import { openRouterHeaders } from "@/lib/openrouter/client";
import { submitVideoWithCapacityRetry, type VideoReferenceInput } from "@/lib/openrouter/videos";
import { chatCompletion } from "@/lib/openrouter/llm";
import { convertSpeechToVoice } from "@/lib/elevenlabs/speech-to-speech";
import {
  coverImageBufferToSize,
  extractFirstFrameFromVideoBuffer,
  muxDubbedAudioOntoVideo,
  prepareSwapSourceVideo,
  readImagePixelSize,
  trimVideoBuffer,
} from "@/lib/ffmpeg";
import {
  closestSupportedAspect,
  closestSupportedDuration,
  DEFAULT_PERSON_SWAP_MODEL,
  isModelId,
  PERSON_SWAP_MODELS,
  preferredVideoResolution,
  swapAcceptsReferences,
  swapMaxSeconds,
  type CatalogModel,
} from "@/lib/model-catalog";
import { getCatalogModel } from "@/lib/model-catalog-server";
import { catalogImageParams, imageResultToBuffer } from "@/lib/image-model-params";
import { registerGeneratedMediaSafe } from "@/lib/media-library-server";
import { parseScenarioImageUrls } from "@/lib/scenario-images";
import { createDubProject } from "@/lib/dubbing/create";
import { ELEVENLABS_MULTILINGUAL_MODEL, ELEVENLABS_VOICE_OPTIONS } from "@/lib/project-api-models";
import {
  deleteMediaByPublicUrl,
  readMediaBuffer,
  readMediaForProvider,
  savePersonSwapBuffer,
  withCacheBuster,
} from "@/lib/storage";
import {
  aspectRatioFor,
  DEFAULT_SWAP_IMAGE_MODEL,
  parseUrlList,
  PERSON_SWAP_GALLERY_FOLDER,
  PERSON_SWAP_MAX_SECONDS,
  PERSON_SWAP_MIN_SECONDS,
  PUBLIC_MEDIA_REQUIRED,
  type PersonSwapMode,
  type PersonSwapVoiceMode,
} from "@/lib/person-swap";

const FRAME_STALE_MS = 15 * 60 * 1000;
const VIDEO_STALE_MS = 45 * 60 * 1000;
const VOICE_STALE_MS = 10 * 60 * 1000;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export function resolveSwapModels(swap: Pick<PersonSwap, "videoModel" | "imageModel">): {
  videoModel: string;
  imageModel: string;
} {
  return {
    videoModel: isModelId(swap.videoModel) ? swap.videoModel : DEFAULT_PERSON_SWAP_MODEL,
    imageModel: isModelId(swap.imageModel) ? swap.imageModel : DEFAULT_SWAP_IMAGE_MODEL,
  };
}

async function videoModelInfo(model: string): Promise<CatalogModel> {
  return (
    (await getCatalogModel("video", model)) ??
    PERSON_SWAP_MODELS.find((m) => m.value === model) ?? {
      value: model,
      label: model.split("/").pop() ?? model,
      provider: model.split("/")[0] ?? "",
      created: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOwnedSwap(id: string, userId: string): Promise<PersonSwap | null> {
  const [row] = await db
    .select()
    .from(schema.personSwaps)
    .where(and(eq(schema.personSwaps.id, id), eq(schema.personSwaps.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getOwnedSwapItem(id: string, userId: string): Promise<PersonSwapItem | null> {
  const [row] = await db
    .select()
    .from(schema.personSwapItems)
    .where(and(eq(schema.personSwapItems.id, id), eq(schema.personSwapItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Jobs lost to a server restart stay in progress forever; surface them as errors. */
async function failStaleItems(where: ReturnType<typeof eq>): Promise<void> {
  const now = Date.now();
  for (const [status, ms] of [
    ["frame", FRAME_STALE_MS],
    ["video", VIDEO_STALE_MS],
    ["voice", VOICE_STALE_MS],
  ] as const) {
    await db
      .update(schema.personSwapItems)
      .set({ status: "error", error: "Interrupted — try again.", updatedAt: new Date() })
      .where(
        and(
          where,
          eq(schema.personSwapItems.status, status),
          lt(schema.personSwapItems.updatedAt, new Date(now - ms)),
        ),
      );
  }
}

export async function listSwapItems(swapId: string): Promise<PersonSwapItem[]> {
  await failStaleItems(eq(schema.personSwapItems.swapId, swapId));
  return db
    .select()
    .from(schema.personSwapItems)
    .where(eq(schema.personSwapItems.swapId, swapId))
    .orderBy(asc(schema.personSwapItems.createdAt), asc(schema.personSwapItems.id));
}

export async function listSwaps(
  userId: string,
): Promise<Array<PersonSwap & { items: PersonSwapItem[] }>> {
  await failStaleItems(eq(schema.personSwapItems.userId, userId));
  const swaps = await db
    .select()
    .from(schema.personSwaps)
    .where(eq(schema.personSwaps.userId, userId))
    .orderBy(desc(schema.personSwaps.updatedAt));
  if (swaps.length === 0) return [];
  const items = await db
    .select()
    .from(schema.personSwapItems)
    .where(inArray(schema.personSwapItems.swapId, swaps.map((s) => s.id)))
    .orderBy(asc(schema.personSwapItems.createdAt));
  return swaps.map((s) => ({ ...s, items: items.filter((i) => i.swapId === s.id) }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type SwapPerson = { avatarId: string | null; name: string; referenceUrls: string[] };

export async function createPersonSwap(input: {
  userId: string;
  name: string;
  buffer: Buffer;
  filename: string;
  videoModel: string | null;
  imageModel: string | null;
  mode: PersonSwapMode;
  scenarioId: string | null;
  instructions: string | null;
  voiceMode: PersonSwapVoiceMode;
  voiceId: string | null;
}): Promise<PersonSwap> {
  const prepared = await prepareSwapSourceVideo({
    buffer: input.buffer,
    filename: input.filename,
    maxSeconds: PERSON_SWAP_MAX_SECONDS,
  });
  if (prepared.durationSeconds < PERSON_SWAP_MIN_SECONDS) {
    throw new Error(`The video is too short — use at least ${PERSON_SWAP_MIN_SECONDS} seconds.`);
  }
  const id = createId();
  const sourceUrl = await savePersonSwapBuffer(input.userId, id, "source.mp4", prepared.video);
  const audioUrl = prepared.audio
    ? await savePersonSwapBuffer(input.userId, id, "source-audio.mp3", prepared.audio)
    : null;
  const now = new Date();
  await db.insert(schema.personSwaps).values({
    id,
    userId: input.userId,
    name: input.name,
    sourceUrl,
    audioUrl,
    durationSeconds: prepared.durationSeconds,
    aspectRatio: aspectRatioFor(prepared.width, prepared.height),
    videoModel: input.videoModel,
    imageModel: input.imageModel,
    mode: input.mode,
    scenarioId: input.mode === "scene" ? input.scenarioId : null,
    instructions: input.instructions,
    voiceMode: input.voiceMode,
    voiceId: input.voiceMode === "voice" ? input.voiceId : null,
    createdAt: now,
    updatedAt: now,
  });
  const swap = await getOwnedSwap(id, input.userId);
  if (!swap) throw new Error("Could not create the swap.");
  return swap;
}

/** Resolve avatar ids to their name + reference photos (primary first). */
export async function resolveAvatarPeople(userId: string, avatarIds: string[]): Promise<SwapPerson[]> {
  if (avatarIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.avatars)
    .where(and(eq(schema.avatars.userId, userId), inArray(schema.avatars.id, avatarIds)));
  return avatarIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((a) => {
      const urls = parseUrlList(a.imageUrls);
      const ordered = a.primaryImageUrl
        ? [a.primaryImageUrl, ...urls.filter((u) => u !== a.primaryImageUrl)]
        : urls;
      return { avatarId: a.id, name: a.name, referenceUrls: ordered.slice(0, 4) };
    })
    .filter((p) => p.referenceUrls.length > 0);
}

const PHOTO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * People from a form: `avatarIds` (JSON array) plus optional uploaded `photos`
 * that become one extra person named `photoName`.
 */
export async function peopleFromForm(form: FormData, userId: string, swapId: string): Promise<SwapPerson[]> {
  let avatarIds: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("avatarIds") ?? "[]"));
    if (Array.isArray(raw)) avatarIds = raw.filter((v): v is string => typeof v === "string").slice(0, 12);
  } catch {
    // ignore malformed list
  }
  const people = await resolveAvatarPeople(userId, avatarIds);
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (photos.length > 0) {
    const urls: string[] = [];
    for (const photo of photos) {
      const ext = PHOTO_TYPES[photo.type];
      if (!ext) throw new Error("Person photos must be JPG, PNG or WebP.");
      if (photo.size > 20 * 1024 * 1024) throw new Error("Person photos must be under 20MB.");
      urls.push(
        await savePersonSwapBuffer(userId, swapId, `person-${createId()}.${ext}`, Buffer.from(await photo.arrayBuffer())),
      );
    }
    const name = String(form.get("photoName") ?? "").trim().slice(0, 60) || "New person";
    people.push({ avatarId: null, name, referenceUrls: urls });
  }
  return people;
}

export async function addSwapPeople(swap: PersonSwap, people: SwapPerson[]): Promise<PersonSwapItem[]> {
  if (people.length === 0) return [];
  const { videoModel } = resolveSwapModels(swap);
  const now = Date.now();
  const rows = people.map((p, i) => ({
    id: createId(),
    swapId: swap.id,
    userId: swap.userId,
    avatarId: p.avatarId,
    avatarName: p.name,
    referenceUrls: JSON.stringify(p.referenceUrls),
    status: "frame",
    videoModel,
    createdAt: new Date(now + i),
    updatedAt: new Date(now),
  }));
  await db.insert(schema.personSwapItems).values(rows);
  await touchSwap(swap.id);
  const items = await db
    .select()
    .from(schema.personSwapItems)
    .where(inArray(schema.personSwapItems.id, rows.map((r) => r.id)));
  for (const item of items) void runSwapItem(swap, item, { newFrame: true });
  return items;
}

async function touchSwap(id: string): Promise<void> {
  await db.update(schema.personSwaps).set({ updatedAt: new Date() }).where(eq(schema.personSwaps.id, id));
}

async function setItem(id: string, patch: Partial<typeof schema.personSwapItems.$inferInsert>): Promise<void> {
  await db
    .update(schema.personSwapItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.personSwapItems.id, id));
}

// ---------------------------------------------------------------------------
// Pipeline: keyframe (image AI) → video edit (video AI) → voice (ElevenLabs)
// ---------------------------------------------------------------------------

async function loadScenario(swap: PersonSwap): Promise<Scenario | null> {
  if (swap.mode !== "scene" || !swap.scenarioId) return null;
  const [row] = await db
    .select()
    .from(schema.scenarios)
    .where(and(eq(schema.scenarios.id, swap.scenarioId), eq(schema.scenarios.userId, swap.userId)))
    .limit(1);
  return row ?? null;
}

function sceneLine(scenario: Scenario | null): string {
  if (!scenario) return "";
  const what = [scenario.name, scenario.description].filter(Boolean).join(" — ");
  return `Change the background/location to this scene: ${what}. Match its look to the scene reference photos. Keep the camera framing and the person's pose.`;
}

function buildKeyframePrompt(
  swap: PersonSwap,
  item: PersonSwapItem,
  scenario: Scenario | null,
  refCount: number,
): string {
  return [
    "Image 1 is a frame from a video.",
    `Images 2 to ${refCount + 1} are photos of ${item.avatarName || "a person"}.`,
    "Recreate image 1 with the person replaced by the person from the photos: their face, hair, skin tone and body type must match the photos exactly.",
    "KEEP from image 1: the exact pose, gesture, head angle, expression, mouth position, camera angle, framing, lens, lighting and any objects held.",
    scenario
      ? sceneLine(scenario)
      : "KEEP the background and everything else in image 1 identical — only the person changes.",
    "Keep the same clothing style unless the instructions say otherwise.",
    swap.instructions?.trim() ? `Instructions: ${swap.instructions.trim()}` : "",
    "Photorealistic, same image quality as image 1. No text, no watermark, no borders.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildVideoPrompt(
  swap: PersonSwap,
  item: PersonSwapItem,
  scenario: Scenario | null,
  opts: { withKeyframe: boolean; personDescription: string | null },
): string {
  const who = opts.personDescription
    ? `this person: ${opts.personDescription}`
    : opts.withKeyframe
      ? "the person shown in the guidance image"
      : `${item.avatarName || "the new person"}`;
  return [
    `Replace the person in the video with ${who}.`,
    "Keep the exact same motion, gestures, lip and mouth movements, timing, camera movement and lighting as the original video.",
    scenario ? sceneLine(scenario) : "Keep the background and every other element unchanged.",
    "The new person must look identical in every frame (consistent face, hair and body). Natural skin, photorealistic.",
    swap.instructions?.trim() ? `Instructions: ${swap.instructions.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Text description of the person for editors that can't take reference photos. */
async function describePerson(referenceUrl: string, name: string): Promise<string> {
  const image = await readMediaForProvider(referenceUrl, "image/jpeg");
  const raw = await chatCompletion({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Describe the person in this photo for a video editor, in one sentence (max 45 words): " +
              "apparent age, gender, ethnicity/skin tone, face shape, hair (color, length, style), facial hair, " +
              "build, and clothing. Only the description, no preamble.",
          },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    temperature: 0.2,
  });
  return raw.trim().replace(/\s+/g, " ").slice(0, 400) || name;
}

async function makeKeyframe(swap: PersonSwap, item: PersonSwapItem, scenario: Scenario | null): Promise<string> {
  const { imageModel } = resolveSwapModels(swap);
  const people = parseUrlList(item.referenceUrls).slice(0, 3);
  if (people.length === 0) throw new Error("This person has no photos.");
  const frame = await extractFirstFrameFromVideoBuffer(await readMediaBuffer(swap.sourceUrl));
  const frameUrl = `data:image/jpeg;base64,${frame.toString("base64")}`;
  const personRefs = await Promise.all(people.map((u) => readMediaForProvider(u, "image/jpeg")));
  const sceneRefs = scenario
    ? await Promise.all(
        parseScenarioImageUrls(scenario)
          .slice(0, 2)
          .map((u) => readMediaForProvider(u, "image/jpeg")),
      )
    : [];
  const img = await generateImage({
    prompt: buildKeyframePrompt(swap, item, scenario, personRefs.length),
    model: imageModel,
    ...(await catalogImageParams(imageModel, swap.aspectRatio, { withReferences: true })),
    referenceImages: [frameUrl, ...personRefs, ...sceneRefs],
    referenceImagesFirst: true,
  });
  const size = readImagePixelSize(frame);
  const raw = await imageResultToBuffer(img);
  const buffer = size ? await coverImageBufferToSize(raw, size.width, size.height) : raw;
  return withCacheBuster(await savePersonSwapBuffer(swap.userId, swap.id, `${item.id}-frame.jpg`, buffer));
}

/** Video references must be downloadable over https — inline data is rejected. */
async function providerVideoUrl(url: string): Promise<string> {
  const direct = await readMediaForProvider(url, "video/mp4");
  if (direct.startsWith("https://")) return direct;
  throw new Error(PUBLIC_MEDIA_REQUIRED);
}

/** Source clip cut to what the model accepts (cached per length). */
async function sourceForModel(swap: PersonSwap, info: CatalogModel): Promise<{ url: string; seconds: number }> {
  const max = swapMaxSeconds(info);
  if (swap.durationSeconds <= max + 0.05) return { url: swap.sourceUrl, seconds: swap.durationSeconds };
  const trimmed = await trimVideoBuffer(await readMediaBuffer(swap.sourceUrl), max);
  const url = await savePersonSwapBuffer(swap.userId, swap.id, `source-${max}s.mp4`, trimmed);
  return { url, seconds: max };
}

async function renderVideo(
  swap: PersonSwap,
  item: PersonSwapItem,
  scenario: Scenario | null,
  model: string,
): Promise<string> {
  const info = await videoModelInfo(model);
  const source = await sourceForModel(swap, info);
  const withRefs = swapAcceptsReferences(model);
  const refs: VideoReferenceInput[] = [{ kind: "video", url: await providerVideoUrl(source.url) }];
  const isSeedance = /seedance/i.test(model);
  const isRunway = model.startsWith("runway/");
  const keyframe =
    withRefs && item.keyframeUrl ? await readMediaForProvider(item.keyframeUrl, "image/jpeg") : null;
  // Runway takes guidance images only as timed keyframes; other editors take image references.
  if (keyframe && !isRunway) refs.push({ kind: "image", url: keyframe });
  if (withRefs && isSeedance) {
    for (const u of parseUrlList(item.referenceUrls).slice(0, 2)) {
      refs.push({ kind: "image", url: await readMediaForProvider(u, "image/jpeg") });
    }
  }
  const personDescription = withRefs
    ? null
    : await describePerson(parseUrlList(item.referenceUrls)[0] ?? "", item.avatarName).catch(() => null);

  const duration = info.durations?.length
    ? closestSupportedDuration(Math.round(source.seconds), info.durations) ?? undefined
    : undefined;
  if (info.durations?.length && source.seconds < Math.min(...info.durations) - 0.5) {
    throw new Error(
      `${info.label} needs at least ${Math.min(...info.durations)} s of video — pick Aleph 2.0 for short clips.`,
    );
  }
  const videoInput = {
    model,
    prompt: buildVideoPrompt(swap, item, scenario, {
      withKeyframe: withRefs && !!item.keyframeUrl,
      personDescription,
    }),
    input_references: refs,
    duration,
    aspect_ratio: !isRunway && info.aspectRatios?.length
      ? closestSupportedAspect(swap.aspectRatio, info.aspectRatios)
      : undefined,
    resolution: info.resolutions?.length ? preferredVideoResolution(info.resolutions) : undefined,
    generateAudio: isSeedance ? false : undefined,
    providerOptions: keyframe && isRunway ? { runway: { keyframes: [{ uri: keyframe, seconds: 0 }] } } : undefined,
  };
  const result = await submitVideoWithCapacityRetry(videoInput, 40 * 60 * 1000);
  const fileUrl = result.unsigned_urls?.[0] ?? result.signed_urls?.[0];
  if (!fileUrl) throw new Error("Video response had no URL");
  const res = await fetch(fileUrl, { headers: openRouterHeaders() });
  if (!res.ok) throw new Error(`Video download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error("Downloaded video is empty");
  return withCacheBuster(await savePersonSwapBuffer(swap.userId, swap.id, `${item.id}-raw.mp4`, buf));
}

const voiceTracks = new Map<string, Promise<string>>();

/** Original soundtrack converted to another voice — one ElevenLabs call per swap + voice. */
function voiceTrack(swap: PersonSwap, voiceId: string): Promise<string> {
  const key = `${swap.id}:${voiceId}`;
  let p = voiceTracks.get(key);
  if (!p) {
    p = (async () => {
      const audio = await readMediaBuffer(swap.audioUrl!);
      const converted = await convertSpeechToVoice({ audio, voiceId, filename: "speech.mp3" });
      return savePersonSwapBuffer(swap.userId, swap.id, `voice-${voiceId}.mp3`, converted);
    })();
    p.catch(() => voiceTracks.delete(key));
    voiceTracks.set(key, p);
  }
  return p;
}

async function applyVoice(
  swap: PersonSwap,
  item: PersonSwapItem,
  rawUrl: string,
  voiceId: string | null,
): Promise<string> {
  if (!swap.audioUrl) return rawUrl;
  const audioUrl = voiceId ? await voiceTrack(swap, voiceId) : swap.audioUrl;
  const muxed = await muxDubbedAudioOntoVideo({
    video: { buffer: await readMediaBuffer(rawUrl), filename: "video.mp4" },
    audio: { buffer: await readMediaBuffer(audioUrl), filename: "audio.mp3" },
  });
  return withCacheBuster(
    await savePersonSwapBuffer(swap.userId, swap.id, `${item.id}-${voiceId ?? "original"}.mp4`, muxed.buffer),
  );
}

function galleryName(swap: PersonSwap, item: PersonSwapItem): string {
  return item.avatarName ? `${swap.name} · ${item.avatarName}` : swap.name;
}

async function finishItem(
  swap: PersonSwap,
  item: PersonSwapItem,
  rawUrl: string,
  voiceId: string | null,
): Promise<void> {
  if (swap.audioUrl && (voiceId || rawUrl !== item.videoUrl)) await setItem(item.id, { status: "voice" });
  const videoUrl = await applyVoice(swap, item, rawUrl, voiceId);
  await setItem(item.id, { videoUrl, voiceId, status: "ready", error: null });
  registerGeneratedMediaSafe({
    userId: swap.userId,
    url: videoUrl,
    name: galleryName(swap, item),
    product: PERSON_SWAP_GALLERY_FOLDER,
    kind: "video",
  });
  await touchSwap(swap.id);
}

async function runSwapItem(
  swap: PersonSwap,
  item: PersonSwapItem,
  opts: { newFrame: boolean },
): Promise<void> {
  try {
    const scenario = await loadScenario(swap);
    const model = isModelId(item.videoModel) ? item.videoModel : resolveSwapModels(swap).videoModel;
    let current = item;
    if (swapAcceptsReferences(model) && (opts.newFrame || !item.keyframeUrl)) {
      await setItem(item.id, { status: "frame", error: null });
      const keyframeUrl = await makeKeyframe(swap, item, scenario);
      await setItem(item.id, { keyframeUrl });
      current = { ...current, keyframeUrl };
    }
    await setItem(item.id, { status: "video", error: null, videoModel: model });
    const rawVideoUrl = await renderVideo(swap, current, scenario, model);
    await setItem(item.id, { rawVideoUrl });
    current = { ...current, rawVideoUrl };
    const voiceId = swap.voiceMode === "voice" ? swap.voiceId : null;
    await finishItem(swap, current, rawVideoUrl, voiceId);
  } catch (err) {
    console.error(`[person-swap] item ${item.id} failed`, err);
    await setItem(item.id, { status: "error", error: errorMessage(err) });
  }
}

/** Re-run one person; keeps the approved keyframe unless `newFrame`. Uses the swap's current video AI. */
export async function retrySwapItem(
  swap: PersonSwap,
  item: PersonSwapItem,
  opts: { newFrame: boolean },
): Promise<void> {
  const { videoModel } = resolveSwapModels(swap);
  await setItem(item.id, { status: opts.newFrame || !item.keyframeUrl ? "frame" : "video", error: null, videoModel });
  void runSwapItem(swap, { ...item, videoModel }, opts);
}

/** Swap only the voice on a finished video (no new render). */
export async function revoiceSwapItem(
  swap: PersonSwap,
  item: PersonSwapItem,
  voiceId: string | null,
): Promise<void> {
  if (!item.rawVideoUrl) throw new Error("This video isn't rendered yet.");
  if (!swap.audioUrl) throw new Error("The original video has no sound to convert.");
  await setItem(item.id, { status: "voice", error: null });
  void finishItem(swap, item, item.rawVideoUrl, voiceId).catch(async (err) => {
    console.error(`[person-swap] voice ${item.id} failed`, err);
    await setItem(item.id, { status: "error", error: `Voice: ${errorMessage(err)}` });
  });
}

function isBuiltInElevenLabsVoice(voiceId: string): boolean {
  return ELEVENLABS_VOICE_OPTIONS.some((o) => o.value === voiceId);
}

/**
 * Send a finished video to Dubbing in the same voice: built-in voices go as the TTS voice, cloned
 * voices as the dub's clone, and the original voice is cloned from the video.
 */
export async function dubSwapItem(
  swap: PersonSwap,
  item: PersonSwapItem,
  targetLanguage: string,
): Promise<string> {
  if (!item.videoUrl) throw new Error("This video isn't ready yet.");
  if (!swap.audioUrl) throw new Error("The video has no speech to dub.");
  return createDubProject({
    userId: swap.userId,
    title: `${galleryName(swap, item)} (${targetLanguage.toUpperCase()})`,
    buffer: await readMediaBuffer(item.videoUrl),
    filename: `${item.id}.mp4`,
    mimeType: "video/mp4",
    sourceType: "video",
    targetLanguage,
    ttsModel: ELEVENLABS_MULTILINGUAL_MODEL,
    ...(item.voiceId && isBuiltInElevenLabsVoice(item.voiceId)
      ? { ttsVoice: item.voiceId }
      : { useVoiceClone: true, clonedVoiceId: item.voiceId }),
  });
}

export async function deleteSwapItemMedia(item: PersonSwapItem): Promise<void> {
  for (const url of [item.keyframeUrl, item.rawVideoUrl, item.videoUrl]) {
    await deleteMediaByPublicUrl(url).catch(() => {});
  }
}
