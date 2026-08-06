import { z } from "zod";
import type { ProjectDna } from "@/lib/db/schema";

/** Per-DNA "new video" defaults — prefilled on the new-project form when a DNA is picked. */
export interface DnaProjectDefaults {
  llmModel: string | null;
  imageModel: string | null;
  videoModel: string | null;
  videoClipAudio: string | null;
  ttsModel: string | null;
  ttsVoice: string | null;
  videoFormat: string | null;
  cutPace: string | null;
  scriptLanguage: string | null;
  targetDurationSeconds: number | null;
}

export type DnaProjectDefaultsFields = Pick<
  ProjectDna,
  | "llmModel"
  | "imageModel"
  | "videoModel"
  | "videoClipAudio"
  | "ttsModel"
  | "ttsVoice"
  | "videoFormat"
  | "cutPace"
  | "scriptLanguage"
  | "targetDurationSeconds"
>;

function str(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Read the saved per-DNA defaults from a DNA row (nulls when unset). */
export function readDnaProjectDefaults(
  dna: Partial<DnaProjectDefaultsFields> | null | undefined,
): DnaProjectDefaults {
  return {
    llmModel: str(dna?.llmModel),
    imageModel: str(dna?.imageModel),
    videoModel: str(dna?.videoModel),
    videoClipAudio: str(dna?.videoClipAudio),
    ttsModel: str(dna?.ttsModel),
    ttsVoice: str(dna?.ttsVoice),
    videoFormat: str(dna?.videoFormat),
    cutPace: str(dna?.cutPace),
    scriptLanguage: str(dna?.scriptLanguage),
    targetDurationSeconds:
      typeof dna?.targetDurationSeconds === "number" && dna.targetDurationSeconds > 0
        ? dna.targetDurationSeconds
        : null,
  };
}

export function hasDnaProjectDefaults(
  dna: Partial<DnaProjectDefaultsFields> | null | undefined,
): boolean {
  const d = readDnaProjectDefaults(dna);
  return Object.values(d).some((v) => v !== null);
}

/** Validation for the settings a client can save onto a DNA. */
export const dnaProjectDefaultsSchema = z.object({
  llmModel: z.string().min(1).max(120).nullable().optional(),
  imageModel: z.string().min(1).max(120).nullable().optional(),
  videoModel: z.string().min(1).max(120).nullable().optional(),
  videoClipAudio: z.enum(["default", "on", "off"]).nullable().optional(),
  ttsModel: z.string().min(1).max(120).nullable().optional(),
  ttsVoice: z.string().min(1).max(60).nullable().optional(),
  videoFormat: z.enum(["horizontal", "vertical"]).nullable().optional(),
  cutPace: z.enum(["calm", "balanced", "dynamic", "hyper"]).nullable().optional(),
  scriptLanguage: z.enum(["en", "pt", "es"]).nullable().optional(),
  targetDurationSeconds: z.number().int().min(15).max(3600).nullable().optional(),
});

export type DnaProjectDefaultsInput = z.infer<typeof dnaProjectDefaultsSchema>;

/** Snapshot of the settings chosen when creating a project, to persist back on the DNA. */
export function dnaDefaultsFromProjectCreate(input: {
  llmModel?: string | null;
  imageModel?: string | null;
  videoModel?: string | null;
  videoClipAudio?: string | null;
  ttsModel?: string | null;
  ttsVoice?: string | null;
  videoFormat?: string | null;
  cutPace?: string | null;
  scriptLanguage?: string | null;
  targetDurationSeconds?: number | null;
}): Partial<DnaProjectDefaultsFields> {
  const patch: Partial<DnaProjectDefaultsFields> = {};
  if (str(input.llmModel)) patch.llmModel = str(input.llmModel);
  if (str(input.imageModel)) patch.imageModel = str(input.imageModel);
  if (str(input.videoModel)) patch.videoModel = str(input.videoModel);
  if (str(input.videoClipAudio)) patch.videoClipAudio = str(input.videoClipAudio);
  if (str(input.ttsModel)) patch.ttsModel = str(input.ttsModel);
  if (str(input.ttsVoice)) patch.ttsVoice = str(input.ttsVoice);
  if (str(input.videoFormat)) patch.videoFormat = str(input.videoFormat);
  if (str(input.cutPace)) patch.cutPace = str(input.cutPace);
  if (str(input.scriptLanguage)) patch.scriptLanguage = str(input.scriptLanguage);
  if (typeof input.targetDurationSeconds === "number" && input.targetDurationSeconds > 0) {
    patch.targetDurationSeconds = input.targetDurationSeconds;
  }
  return patch;
}
