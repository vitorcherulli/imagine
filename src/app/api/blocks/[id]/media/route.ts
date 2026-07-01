import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { generateSpeech, resolveTtsVoice } from "@/lib/openrouter/tts";
import {
  ceilBlockDurationSeconds,
  generateBlockVideo,
  probeAudioDurationSeconds,
} from "@/lib/block-video";
import { saveBuffer, withCacheBuster, deleteMediaByPublicUrl } from "@/lib/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { parseTtsSpeedFromRequest } from "@/lib/narration-speed-server";
import { resolveElevenLabsVoiceSettings, resolveKokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";
import {
  mediaUrlForField,
  patchAfterClearingMedia,
  type BlockMediaField,
} from "@/lib/block-media";
import { z } from "zod";

const clearMediaSchema = z.object({
  field: z.enum(["keyframe", "video", "audio", "sceneAudio"]),
});

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ttsSpeed = await parseTtsSpeedFromRequest(req, owned.project);

  if (owned.block.status === "generating" || owned.block.status === "video_generating") {
    return NextResponse.json(
      { error: "Media generation already in progress for this block." },
      { status: 409 },
    );
  }

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
        speed: ttsSpeed,
        elevenLabsSettings: resolveElevenLabsVoiceSettings(owned.project.ttsVoiceSettings),
        kokoroExpressiveness: resolveKokoroVoiceSettings(owned.project.ttsVoiceSettings)
          .expressiveness,
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
      const { videoUrl, sceneAudioUrl, openRouterCostUsd } = await generateBlockVideo({
        project: owned.project,
        block: blockForVideo,
      });

      await setBlockStatus(blockId, {
        videoUrl,
        sceneAudioUrl,
        durationSeconds,
        openRouterCostUsd,
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = clearMediaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const field = parsed.data.field as BlockMediaField;
  const mediaUrl = mediaUrlForField(owned.block, field);
  if (!mediaUrl) {
    return NextResponse.json({ error: "Nothing to remove for this block." }, { status: 400 });
  }

  if (field === "video" && owned.block.sceneAudioUrl) {
    await deleteMediaByPublicUrl(owned.block.sceneAudioUrl);
  }
  await deleteMediaByPublicUrl(mediaUrl);

  const patch = patchAfterClearingMedia(owned.block, field);
  await setBlockStatus(params.id, patch);

  return NextResponse.json({ ok: true, field, patch });
}
