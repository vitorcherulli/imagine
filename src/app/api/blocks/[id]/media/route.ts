import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { generateSpeech, resolveTtsVoice } from "@/lib/openrouter/tts";
import {
  ceilBlockDurationSeconds,
  generateBlockVideo,
  probeAudioDurationSeconds,
} from "@/lib/block-video";
import { saveBuffer, withCacheBuster } from "@/lib/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setBlockStatus(params.id, { status: "generating", errorMessage: null });

  void (async () => {
    const projectId = owned.project.id;
    const blockId = owned.block.id;
    const models = resolveProjectApiModels(owned.project);

    try {
      const voice = resolveTtsVoice({
        ttsModel: models.ttsModel,
        ttsVoice: models.ttsVoice,
        voiceTone: owned.project.voiceTone,
      });
      const speech = await generateSpeech({
        text: owned.block.narrativeText,
        voice,
        model: models.ttsModel,
        voiceTone: owned.project.voiceTone,
      });
      const audioUrl = await saveBuffer(projectId, blockId, speech.filename, speech.buffer);
      const probed = await probeAudioDurationSeconds(audioUrl);
      const durationSeconds = probed
        ? ceilBlockDurationSeconds(probed)
        : owned.block.durationSeconds;

      await setBlockStatus(blockId, { audioUrl: withCacheBuster(audioUrl), durationSeconds });

      const blockForVideo = {
        ...owned.block,
        audioUrl,
        durationSeconds,
      };
      const { videoUrl, sceneAudioUrl } = await generateBlockVideo({
        project: owned.project,
        block: blockForVideo,
      });

      await setBlockStatus(blockId, {
        videoUrl,
        sceneAudioUrl,
        durationSeconds,
        status: "ready",
      });
    } catch (err) {
      await setBlockStatus(blockId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Media generation failed",
      });
    }
  })();

  return NextResponse.json({ ok: true, status: "generating" });
}
