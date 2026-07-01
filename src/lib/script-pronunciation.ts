import type { ScriptPronunciationHint } from "./script-studio";
import type { ScriptDraftNotes } from "./script-studio";
import {
  isElevenLabsTtsModel,
  isGeminiTtsModel,
} from "./project-api-models";
import {
  deliverySpansInText,
  prepareSpeechTextForTts,
} from "./script-tts-delivery";

/** Strip syllable breaks — TTS reads hyphenated respellings letter-by-letter. */
export function sanitizeSpokenForTts(spoken: string): string {
  let s = spoken.trim();
  if (!s) return s;
  s = s.replace(/-/g, "");
  s = s.replace(/\s+/g, " ");
  return s;
}

/** Replace written forms with spoken aliases for TTS (document text unchanged). */
export function applyPronunciationHints(
  text: string,
  hints: ScriptPronunciationHint[] | undefined,
): string {
  if (!hints?.length || !text.trim()) return text;

  const sorted = [...hints]
    .filter((h) => h.written.trim().length >= 2 && h.spoken.trim().length >= 2)
    .sort((a, b) => b.written.length - a.written.length);

  let result = text;
  for (const hint of sorted) {
    const written = hint.written.trim();
    const spoken = sanitizeSpokenForTts(hint.spoken);
    if (!spoken || written === spoken || !result.includes(written)) continue;
    result = result.split(written).join(spoken);
  }
  return result;
}

export function pronunciationHintsInText(
  speechText: string,
  hints: ScriptPronunciationHint[] | undefined,
): ScriptPronunciationHint[] {
  if (!hints?.length || !speechText.trim()) return [];
  return hints.filter((h) => {
    const w = h.written.trim();
    return w.length >= 2 && speechText.includes(w);
  });
}

export function countPronunciationHintsInScript(
  script: string,
  hints: ScriptPronunciationHint[] | undefined,
): number {
  if (!hints?.length) return 0;
  return hints.filter((h) => script.includes(h.written.trim())).length;
}

/** Full TTS pipeline: pronunciation aliases → delivery emphasis. */
export function prepareNarrationSpeechText(input: {
  text: string;
  notes: ScriptDraftNotes;
  ttsModel: string;
}): string {
  const hints = input.notes.pronunciation?.hints;
  const pronounced = applyPronunciationHints(input.text, hints);
  const segmentSpans = deliverySpansInText(
    input.text,
    input.notes.delivery?.spans,
  ).map((span) => ({
    ...span,
    quote: applyPronunciationHints(span.quote, hints),
  }));

  return prepareSpeechTextForTts({
    text: pronounced,
    deliverySpans: segmentSpans,
    ttsModel: input.ttsModel,
    isGemini: isGeminiTtsModel(input.ttsModel),
    isElevenLabs: isElevenLabsTtsModel(input.ttsModel),
  });
}
