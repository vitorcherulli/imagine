import { z } from "zod";
import type { ScriptDraftNotes, ScriptParagraphImageSearch } from "@/lib/script-studio";
import {
  paragraphImageSearchForPause,
  paragraphImageSearchForSpeech,
} from "@/lib/script-studio";

export const scriptParagraphImageTargetFields = z.object({
  speechIndex: z.number().int().min(0).max(200).optional(),
  pauseIndex: z.number().int().min(0).max(200).optional(),
});

export type ScriptParagraphImageTarget = z.infer<typeof scriptParagraphImageTargetFields>;

export function refineParagraphImageTarget<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (data: ScriptParagraphImageTarget) =>
      (data.speechIndex !== undefined && data.pauseIndex === undefined) ||
      (data.pauseIndex !== undefined && data.speechIndex === undefined),
    { message: "Exactly one of speechIndex or pauseIndex is required" },
  );
}

export const scriptParagraphImageTargetSchema = refineParagraphImageTarget(
  scriptParagraphImageTargetFields,
);

export function paragraphImageSearchForTarget(
  notes: ScriptDraftNotes,
  target: ScriptParagraphImageTarget,
): ScriptParagraphImageSearch | undefined {
  return target.pauseIndex !== undefined
    ? paragraphImageSearchForPause(notes, target.pauseIndex)
    : paragraphImageSearchForSpeech(notes, target.speechIndex!);
}

export function paragraphImageTargetKey(target: ScriptParagraphImageTarget): string {
  return target.pauseIndex !== undefined ? `pause:${target.pauseIndex}` : `speech:${target.speechIndex}`;
}
