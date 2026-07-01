import type { Project } from "./db/schema";
import { probeAudioBufferDurationSeconds } from "./ffmpeg";
import { resolveElevenLabsVoiceSettings, resolveKokoroVoiceSettings } from "./elevenlabs-voice-settings";
import { normalizeTtsSpeed } from "./narration-speed";
import { resolveProjectApiModels } from "./project-api-models";
import { generateSpeech, resolveTtsVoice } from "./openrouter/tts";
import { saveBuffer, withCacheBuster } from "./storage";
import type { ScriptDraftNotes, ScriptParagraphNarrationClip } from "./script-studio";
import { resolveScriptNarrator } from "./script-studio";
import { deliverySpansInText } from "./script-tts-delivery";
import { applyPronunciationHints } from "./script-pronunciation";
import { scriptParagraphTextKey } from "./script-narration-utils";

function deliverySpansForSpeech(
  speechText: string,
  notes: ScriptDraftNotes,
): ReturnType<typeof deliverySpansInText> {
  const hints = notes.pronunciation?.hints;
  return deliverySpansInText(speechText, notes.delivery?.spans).map((span) => ({
    ...span,
    quote: applyPronunciationHints(span.quote, hints),
  }));
}

export async function generateScriptParagraphSpeech(input: {
  project: Project;
  notes: ScriptDraftNotes;
  speechText: string;
  speechIndex: number;
  speed?: number;
}): Promise<ScriptParagraphNarrationClip> {
  const models = resolveProjectApiModels(input.project);
  const notes = input.notes;
  const narrator = resolveScriptNarrator(input.project, notes);
  const ttsModel = narrator.ttsModel;
  const ttsVoice =
    narrator.ttsVoice && narrator.ttsVoice !== "auto"
      ? narrator.ttsVoice
      : resolveTtsVoice({
          ttsModel,
          ttsVoice: models.ttsVoice,
          voiceTone: narrator.voiceTone || input.project.voiceTone,
        });
  const speed = normalizeTtsSpeed(input.speed ?? input.project.ttsSpeed ?? 1);
  const deliveryNotes = narrator.deliveryNotes || "";
  const hints = notes.pronunciation?.hints;
  const speechText = applyPronunciationHints(input.speechText, hints);
  const segmentSpans = deliverySpansForSpeech(input.speechText, notes);

  const speech = await generateSpeech({
    text: speechText,
    voice: ttsVoice,
    model: ttsModel,
    voiceTone: narrator.voiceTone || input.project.voiceTone,
    speed,
    deliveryNotes,
    deliverySpans: segmentSpans.length > 0 ? segmentSpans : undefined,
    elevenLabsSettings: resolveElevenLabsVoiceSettings(input.project.ttsVoiceSettings),
    kokoroExpressiveness: resolveKokoroVoiceSettings(input.project.ttsVoiceSettings).expressiveness,
  });

  const filename = `script-para-${input.speechIndex}-${Date.now()}${
    speech.filename.endsWith(".wav") ? ".wav" : ".mp3"
  }`;
  const url = await saveBuffer(input.project.id, null, filename, speech.buffer);
  const probed = await probeAudioBufferDurationSeconds({
    buffer: speech.buffer,
    filename: speech.filename,
  });
  const durationSeconds =
    typeof probed === "number" && probed > 0
      ? Math.round(probed * 10) / 10
      : Math.max(1, Math.round((input.speechText.split(/\s+/).length / 150) * 60));

  return {
    speechIndex: input.speechIndex,
    textKey: scriptParagraphTextKey(input.speechText),
    audioUrl: withCacheBuster(url),
    durationSeconds,
    generatedAt: new Date().toISOString(),
  };
}
