import { getCutPaceSpec } from "./cut-pace";
import { countWords, DEFAULT_WORDS_PER_MINUTE, type ScriptParagraphNarrationClip } from "./script-studio";

export function estimateSpeechParagraphDurationSeconds(
  paragraphText: string,
  clip?: ScriptParagraphNarrationClip | null,
): number {
  if (clip?.durationSeconds && clip.durationSeconds > 0) {
    return Math.max(4, Math.ceil(clip.durationSeconds));
  }
  const words = countWords(paragraphText);
  if (words === 0) return 4;
  return Math.max(4, Math.round((words / DEFAULT_WORDS_PER_MINUTE) * 60));
}

/** How many reference photos fit a narration paragraph at the project's cut pace. */
export function estimateParagraphReferenceImageCount(
  durationSeconds: number,
  cutPace: string | null | undefined,
): number {
  const spec = getCutPaceSpec(cutPace);
  const duration = Math.max(4, Math.round(durationSeconds));
  const idealCutSeconds = (spec.continuousCutMin + spec.continuousCutMax) / 2;
  const fromDuration = Math.round(duration / idealCutSeconds);
  return Math.min(8, Math.max(spec.cutsPerUnitMin, fromDuration));
}
