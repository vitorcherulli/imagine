/** Distinct framings requested inside a single AI video clip (prompt instruction only). */
export const VIDEO_SHOT_COUNT_MIN = 1;
export const VIDEO_SHOT_COUNT_MAX = 4;

export interface VideoShotCountOption {
  value: number;
  label: string;
  hint: string;
}

export const VIDEO_SHOT_COUNT_OPTIONS: VideoShotCountOption[] = [
  {
    value: 1,
    label: "1 shot",
    hint: "Single continuous framing",
  },
  {
    value: 2,
    label: "2 shots",
    hint: "Two distinct framings in the clip",
  },
  {
    value: 3,
    label: "3 shots",
    hint: "Three camera changes",
  },
  {
    value: 4,
    label: "4 shots",
    hint: "Dynamic montage feel",
  },
];

const SHOT_FRAMING_PRESETS = [
  "wide establishing shot",
  "medium shot on the subject",
  "close-up with emotional detail",
  "detail, over-the-shoulder or dynamic angle",
] as const;

export function normalizeVideoShotCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(
    VIDEO_SHOT_COUNT_MAX,
    Math.max(VIDEO_SHOT_COUNT_MIN, Math.round(n)),
  );
}

export function videoShotCountLabel(count: number): string {
  const normalized = normalizeVideoShotCount(count);
  return (
    VIDEO_SHOT_COUNT_OPTIONS.find((o) => o.value === normalized)?.label ??
    `${normalized} shots`
  );
}

/** English instructions appended to the video model prompt. */
export function buildVideoShotPromptInstructions(
  shotCount: number,
  clipDurationSeconds?: number,
): string {
  const count = normalizeVideoShotCount(shotCount);
  if (count <= 1) return "";

  const durationHint =
    clipDurationSeconds != null && clipDurationSeconds > 0
      ? ` Spread the ${count} shots evenly across roughly ${clipDurationSeconds.toFixed(0)} seconds.`
      : "";

  const shotList = SHOT_FRAMING_PRESETS.slice(0, count)
    .map((framing, index) => `Shot ${index + 1}: ${framing}`)
    .join(". ");

  return (
    `Cinematic editing: include ${count} distinct camera framings within this single clip, ` +
    `with clear but smooth transitions between them.${durationHint} ${shotList}. ` +
    "Vary angle, framing and subject scale while keeping the same scene, characters, lighting and color grade. " +
    "Use motivated camera moves and natural cut points — not one static framing throughout."
  );
}

export function appendVideoShotInstructions(
  basePrompt: string,
  shotCount: number,
  clipDurationSeconds?: number,
): string {
  const suffix = buildVideoShotPromptInstructions(shotCount, clipDurationSeconds);
  if (!suffix.trim()) return basePrompt;
  return `${basePrompt.trim()}\n\n${suffix}`;
}
