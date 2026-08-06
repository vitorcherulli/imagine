import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, getLatestBlock, setBlockStatus } from "@/lib/block-helpers";
import { generateSpeech, resolveTtsVoice } from "@/lib/openrouter/tts";
import { saveBuffer, withCacheBuster } from "@/lib/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { parseTtsSpeedFromRequest } from "@/lib/narration-speed-server";
import { resolveElevenLabsVoiceSettings, resolveKokoroVoiceSettings } from "@/lib/elevenlabs-voice-settings";
import { isVisualCutOnly } from "@/lib/cut-pace";
import {
  ceilBlockDurationSeconds,
  probeAudioDurationSeconds,
} from "@/lib/block-video";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ttsSpeed = await parseTtsSpeedFromRequest(req, owned.project);

  if (isVisualCutOnly(owned.block)) {
    return NextResponse.json(
      { error: "Visual cuts use narration from the group's lead block" },
      { status: 400 },
    );
  }

  await setBlockStatus(params.id, { status: "audio_generating", errorMessage: null });

  void (async () => {
    try {
      const models = resolveProjectApiModels(owned.project);
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
      const url = await saveBuffer(
        owned.project.id,
        owned.block.id,
        speech.filename,
        speech.buffer,
      );
      const probed = await probeAudioDurationSeconds(url);
      const durationSeconds = probed
        ? ceilBlockDurationSeconds(probed)
        : owned.block.durationSeconds;
      const latest = await getLatestBlock(params.id);
      const videoReady = !!latest?.videoUrl;
      await setBlockStatus(params.id, {
        audioUrl: withCacheBuster(url),
        durationSeconds,
        narrationAiModel: models.ttsModel,
        status: videoReady ? "ready" : "audio_ready",
      });
    } catch (err) {
      await setBlockStatus(params.id, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "TTS failed",
      });
    }
  })();

  return NextResponse.json({ ok: true, status: "audio_generating" });
}
