import { normalizeVideoFormat, type VideoFormat } from "./video-format";

export type CaptionMode =
  | "off"
  | "bottom"
  | "center"
  | "bottom-karaoke"
  | "center-karaoke";

const CAPTION_MODES: CaptionMode[] = [
  "off",
  "bottom",
  "center",
  "bottom-karaoke",
  "center-karaoke",
];

export interface CaptionSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export function isCaptionMode(value: unknown): value is CaptionMode {
  return typeof value === "string" && CAPTION_MODES.includes(value as CaptionMode);
}

export function normalizeCaptionMode(value: unknown): CaptionMode {
  return isCaptionMode(value) ? value : "off";
}

export function parseCaptionLayout(mode: CaptionMode): {
  enabled: boolean;
  position: "bottom" | "center";
  karaoke: boolean;
} {
  switch (mode) {
    case "bottom":
      return { enabled: true, position: "bottom", karaoke: false };
    case "center":
      return { enabled: true, position: "center", karaoke: false };
    case "bottom-karaoke":
      return { enabled: true, position: "bottom", karaoke: true };
    case "center-karaoke":
      return { enabled: true, position: "center", karaoke: true };
    default:
      return { enabled: false, position: "bottom", karaoke: false };
  }
}

export function getCaptionDisplayText(opts: {
  mode: CaptionMode;
  narrativeText: string;
  localOffsetSeconds: number;
  blockDurationSeconds: number;
}): string {
  const text = opts.narrativeText.trim();
  if (!text) return "";

  const { karaoke } = parseCaptionLayout(opts.mode);
  if (!karaoke) return text;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const duration = Math.max(0.05, opts.blockDurationSeconds);
  const progress = Math.min(1, Math.max(0, opts.localOffsetSeconds / duration));
  const count = Math.max(1, Math.ceil(progress * words.length));
  return words.slice(0, count).join(" ");
}

export function buildCaptionSegments(
  blocks: Array<{ narrativeText: string; durationSeconds: number }>,
): CaptionSegment[] {
  let elapsed = 0;
  const segments: CaptionSegment[] = [];
  for (const block of blocks) {
    const text = block.narrativeText.trim();
    const startSeconds = elapsed;
    const endSeconds = elapsed + block.durationSeconds;
    elapsed = endSeconds;
    if (text) {
      segments.push({ text, startSeconds, endSeconds });
    }
  }
  return segments;
}

export function buildKaraokeCaptionSegments(
  blocks: Array<{ narrativeText: string; durationSeconds: number }>,
): CaptionSegment[] {
  let elapsed = 0;
  const segments: CaptionSegment[] = [];
  for (const block of blocks) {
    const words = block.narrativeText.trim().split(/\s+/).filter(Boolean);
    const blockStart = elapsed;
    const duration = block.durationSeconds;
    elapsed += duration;
    if (words.length === 0) continue;

    const wordDur = duration / words.length;
    for (let i = 0; i < words.length; i++) {
      segments.push({
        text: words.slice(0, i + 1).join(" "),
        startSeconds: blockStart + i * wordDur,
        endSeconds: blockStart + (i + 1) * wordDur,
      });
    }
  }
  return segments;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function wrapCaptionLines(text: string, maxChars: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return escapeAssText(lines.join("\n")).replace(/\n/g, "\\N");
}

function formatAssTimestamp(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

export function buildAssSubtitleContent(opts: {
  segments: CaptionSegment[];
  width: number;
  height: number;
  position: "bottom" | "center";
  videoFormat?: VideoFormat | unknown;
}): string {
  const { segments, width, height, position } = opts;
  const vertical = normalizeVideoFormat(opts.videoFormat) === "vertical";
  const maxChars = vertical ? 28 : 42;
  const fontSize = vertical ? Math.round(width * 0.042) : Math.round(height * 0.045);
  const alignment = position === "center" ? 5 : 2;
  const marginV = position === "center" ? 0 : Math.round(height * 0.08);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,2,0,${alignment},48,48,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const dialogues = segments.map((seg) => {
    const start = formatAssTimestamp(seg.startSeconds);
    const end = formatAssTimestamp(seg.endSeconds);
    const text = wrapCaptionLines(seg.text, maxChars);
    return `Dialogue: 0,${start},${end},Caption,,0,0,0,,${text}`;
  });

  return [...header, ...dialogues, ""].join("\n");
}

/** Escape path for ffmpeg subtitles filter (POSIX). */
export function escapeFfmpegSubtitlesPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}

export const CAPTION_MODE_OPTIONS: Array<{ id: CaptionMode; label: string; hint?: string }> = [
  { id: "off", label: "Off" },
  {
    id: "bottom",
    label: "Bottom — full block",
    hint: "Shows the full narration for the block at once",
  },
  {
    id: "bottom-karaoke",
    label: "Bottom — word by word",
    hint: "Words appear as the narration plays",
  },
  {
    id: "center",
    label: "Center — full block",
    hint: "Full text centered on screen",
  },
  {
    id: "center-karaoke",
    label: "Center — word by word",
    hint: "Karaoke-style captions in the center",
  },
];
