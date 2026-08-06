/** Distinct framings requested inside a single AI video clip (prompt instruction only). */
export const VIDEO_SHOT_COUNT_MIN = 1;
export const VIDEO_SHOT_COUNT_MAX = 4;

/** Camera angle / perspective applied to the whole block's video clip (prompt only). */
export interface CameraAngleOption {
  value: string;
  label: string;
  hint: string;
  /** English instruction appended to the video prompt. Empty for "auto". */
  prompt: string;
}

export const CAMERA_ANGLE_OPTIONS: CameraAngleOption[] = [
  { value: "auto", label: "Auto", hint: "Let the model decide", prompt: "" },
  {
    value: "eye_level",
    label: "Eye level",
    hint: "Neutral, straight-on view",
    prompt: "Eye-level camera perspective, straight-on and neutral.",
  },
  {
    value: "low_angle",
    label: "Low angle",
    hint: "Looking up — heroic, imposing",
    prompt: "Low-angle shot looking up at the subject, making it feel powerful and imposing.",
  },
  {
    value: "high_angle",
    label: "High angle",
    hint: "Looking down — vulnerable, small",
    prompt: "High-angle shot looking down at the subject, making the scene feel smaller or vulnerable.",
  },
  {
    value: "aerial",
    label: "Aerial / drone",
    hint: "Bird's-eye, top-down flyover",
    prompt: "Aerial drone perspective, high bird's-eye view flying over the scene.",
  },
  {
    value: "pov",
    label: "POV",
    hint: "First-person point of view",
    prompt: "First-person point-of-view (POV) shot, as if seen through the subject's eyes.",
  },
  {
    value: "ots",
    label: "Over-shoulder",
    hint: "Behind the subject's shoulder",
    prompt: "Over-the-shoulder shot framed from just behind the subject.",
  },
  {
    value: "close_up",
    label: "Close-up",
    hint: "Tight framing on detail/face",
    prompt: "Tight close-up framing focused on the subject's face or key detail.",
  },
  {
    value: "wide",
    label: "Wide",
    hint: "Wide establishing shot",
    prompt: "Wide establishing shot showing the full environment around the subject.",
  },
];

export const DEFAULT_CAMERA_ANGLE = "auto";

export function normalizeCameraAngle(value: unknown): string {
  const v = String(value ?? "").trim();
  return CAMERA_ANGLE_OPTIONS.some((o) => o.value === v) ? v : DEFAULT_CAMERA_ANGLE;
}

export function cameraAngleLabel(value: unknown): string {
  const normalized = normalizeCameraAngle(value);
  return CAMERA_ANGLE_OPTIONS.find((o) => o.value === normalized)?.label ?? "Auto";
}

/** English camera-perspective instruction appended to the video prompt (empty for auto). */
export function buildCameraAnglePromptInstruction(value: unknown): string {
  const normalized = normalizeCameraAngle(value);
  return CAMERA_ANGLE_OPTIONS.find((o) => o.value === normalized)?.prompt ?? "";
}

export function appendCameraAngleInstruction(basePrompt: string, cameraAngle: unknown): string {
  const suffix = buildCameraAnglePromptInstruction(cameraAngle);
  if (!suffix.trim()) return basePrompt;
  return `${basePrompt.trim()}\n\n${suffix}`;
}

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
