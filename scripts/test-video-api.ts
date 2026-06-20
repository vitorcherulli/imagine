/**
 * Smoke test for OpenRouter video (Seedance) API.
 * Usage: npx tsx --env-file=.env.local scripts/test-video-api.ts
 */

import { OPENROUTER_MODELS } from "../src/lib/openrouter/client";
import { getVideoStatus, submitVideo } from "../src/lib/openrouter/videos";
import { hasFfmpeg } from "../src/lib/ffmpeg";

async function main() {
  console.log("=== Video API smoke test ===\n");

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("FAIL: OPENROUTER_API_KEY not set");
    process.exit(1);
  }
  console.log(`ffmpeg installed: ${hasFfmpeg() ? "yes" : "no (post-processing limited)"}`);
  console.log(`video model: ${OPENROUTER_MODELS.video}\n`);

  console.log("Submitting 4s test clip…");
  const job = await submitVideo({
    model: OPENROUTER_MODELS.video,
    prompt: "A peaceful sunny meadow with soft grass moving in a gentle breeze, cinematic wide shot.",
    duration: 4,
    aspect_ratio: "16:9",
  });
  console.log(`Submit OK — job id: ${job.id}`);

  const deadline = Date.now() + 10 * 60 * 1000;
  let lastStatus = "";

  while (Date.now() < deadline) {
    const status = await getVideoStatus(job.id, job.polling_url);
    const label = `${status.status}${status.progress != null ? ` (${status.progress}%)` : ""}`;
    if (label !== lastStatus) {
      console.log(`  status: ${label}`);
      lastStatus = label;
    }

    if (status.status === "completed") {
      const url = status.signed_urls?.[0] ?? status.unsigned_urls?.[0];
      console.log("\nPASS: Video API is working.");
      console.log(`Output URL: ${url ? url.slice(0, 80) + "…" : "(no url in response)"}`);
      return;
    }

    if (status.status === "failed") {
      console.error("\nFAIL: Job failed —", status.error ?? "unknown error");
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 8000));
  }

  console.error("\nFAIL: Timed out after 10 minutes (job may still be running on OpenRouter).");
  process.exit(1);
}

main().catch((err) => {
  console.error("\nFAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
