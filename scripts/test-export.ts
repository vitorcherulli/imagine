import { asc, eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";
import { db, schema } from "@/lib/db";
import { absoluteFromPublicUrl, ensureProjectDir, publicUrlFor } from "@/lib/storage";
import { concatBlocksWithAudio, getMediaDurationSeconds, hasFfmpeg } from "@/lib/ffmpeg";

async function main() {
  const projectId = process.argv[2] ?? "ozhdcbg3la4hur38cwsifsxy";
  console.log("hasFfmpeg", hasFfmpeg());

  const blocks = await db
    .select()
    .from(schema.storyBlocks)
    .where(eq(schema.storyBlocks.projectId, projectId))
    .orderBy(asc(schema.storyBlocks.position));

  const segments = await Promise.all(
    blocks.map(async (b) => {
      const audioPath = absoluteFromPublicUrl(b.audioUrl!);
      let durationSeconds = b.durationSeconds;
      try {
        durationSeconds = Math.max(durationSeconds, await getMediaDurationSeconds(audioPath));
      } catch {
        // keep timeline duration
      }
      return {
        videoPath: absoluteFromPublicUrl(b.videoUrl!),
        audioPath,
        sceneAudioPath: b.sceneAudioUrl ? absoluteFromPublicUrl(b.sceneAudioUrl) : null,
        audioVolume: b.audioVolume ?? 100,
        sceneAudioVolume: b.sceneAudioVolume ?? 60,
        durationSeconds,
      };
    }),
  );

  const dir = await ensureProjectDir(projectId);
  const outputPath = path.join(dir, "test_export_fix.mp4");
  const t0 = Date.now();
  await concatBlocksWithAudio({
    segments,
    outputPath,
    resolution: "1080p",
    narrationVolume: 100,
    sceneVolume: 60,
    masterVolume: 100,
  });
  const stat = fs.statSync(outputPath);
  console.log("OK", publicUrlFor(outputPath), "bytes", stat.size, "ms", Date.now() - t0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
