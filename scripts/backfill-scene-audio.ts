/**
 * Backfill `scene_audio_url` for blocks whose video was generated before the
 * scene-audio feature existed. Reads the existing video file, checks for an
 * audio stream, extracts it as `scene_audio.m4a`, and updates the database.
 *
 * Usage: npx tsx --env-file=.env.local scripts/backfill-scene-audio.ts
 */

import { eq, isNull } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { db, schema } from "../src/lib/db";
import {
  extractAudioFromVideo,
  hasFfmpeg,
  videoHasAudioStream,
} from "../src/lib/ffmpeg";
import {
  absoluteFromPublicUrl,
  publicUrlFor,
  withCacheBuster,
} from "../src/lib/storage";

async function main() {
  if (!hasFfmpeg()) {
    console.error("ffmpeg/ffprobe not available — install them first.");
    process.exit(1);
  }

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(isNull(schema.storyBlocks.sceneAudioUrl));

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const b of blocks) {
    if (!b.videoUrl) {
      skipped += 1;
      continue;
    }
    const videoPath = absoluteFromPublicUrl(b.videoUrl);
    try {
      await fs.access(videoPath);
    } catch {
      missing += 1;
      continue;
    }
    const has = await videoHasAudioStream(videoPath);
    if (!has) {
      skipped += 1;
      continue;
    }
    const scenePath = path.join(path.dirname(videoPath), "scene_audio.m4a");
    const ok = await extractAudioFromVideo(videoPath, scenePath).catch(() => false);
    if (!ok) {
      skipped += 1;
      continue;
    }
    const url = withCacheBuster(publicUrlFor(scenePath));
    await db
      .update(schema.storyBlocks)
      .set({ sceneAudioUrl: url, updatedAt: new Date() })
      .where(eq(schema.storyBlocks.id, b.id));
    updated += 1;
    console.log(`  ✓ ${b.id} -> ${url}`);
  }

  console.log(
    `\nDone. updated=${updated}, skipped=${skipped}, missing=${missing}, total=${blocks.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
