import type { Project } from "./db/schema";
import {
  DEFAULT_SPEECH_GAP_SECONDS,
  normalizeScriptText,
  parseScriptNarrationSegments,
  type ScriptDraftNotes,
} from "./script-studio";
import {
  listScriptSpeechParagraphs,
  narrationClipForSpeechIndex,
  scriptParagraphTextKey,
} from "./script-narration-utils";

export const PREMIERE_MANIFEST_VERSION = 1 as const;
export const PREMIERE_MANIFEST_AUDIO_FILENAME = "Narracao.mp3";

export interface ScriptPremiereManifestShot {
  id: string;
  durationSec: number;
  visualIntent: string;
  keywords?: string[];
}

export interface ScriptPremiereManifestClipSlot {
  /** Local path — filled by footage matcher (layer 2). */
  file?: string;
  inSec?: number;
  outSec?: number;
}

export interface ScriptPremiereManifestSegment {
  id: string;
  kind: "speech" | "pause";
  speechIndex?: number;
  text?: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  visualIntent?: string;
  keywords?: string[];
  shots?: ScriptPremiereManifestShot[];
  clip?: ScriptPremiereManifestClipSlot;
}

export interface ScriptPremiereManifest {
  version: typeof PREMIERE_MANIFEST_VERSION;
  generatedAt: string;
  projectTitle: string;
  projectId: string;
  audioFile: string;
  totalDurationSec: number;
  speechGapSeconds: number;
  segments: ScriptPremiereManifestSegment[];
  instructions?: {
    premiere: string;
    footageFolder?: string;
  };
}

export function estimateSpeechDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 150) * 60 * 10) / 10);
}

function speechGapBefore(
  segments: ReturnType<typeof parseScriptNarrationSegments>,
  index: number,
  speechIndex: number,
): number {
  if (speechIndex <= 0) return 0;
  const prev = segments[index - 1];
  if (prev?.kind === "pause") return 0;
  return DEFAULT_SPEECH_GAP_SECONDS;
}

/** Timeline from script + measured paragraph clip durations (no visual hints). */
export function buildPremiereManifestTimeline(input: {
  project: Pick<Project, "id" | "title">;
  script: string;
  notes: ScriptDraftNotes;
}): ScriptPremiereManifest {
  const script = normalizeScriptText(input.script);
  const segments = parseScriptNarrationSegments(script);
  const clips = input.notes.paragraphNarration ?? [];
  const out: ScriptPremiereManifestSegment[] = [];
  let currentSec = 0;
  let speechIndex = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (segment.kind === "pause") {
      const durationSec = segment.pauseSeconds;
      out.push({
        id: `pause-${out.filter((s) => s.kind === "pause").length + 1}`,
        kind: "pause",
        startSec: roundSec(currentSec),
        endSec: roundSec(currentSec + durationSec),
        durationSec: roundSec(durationSec),
        visualIntent: `Hold / breath (${durationSec}s)`,
      });
      currentSec += durationSec;
      continue;
    }

    if (segment.kind === "section") continue;

    const textKey = scriptParagraphTextKey(segment.text);
    const clip = narrationClipForSpeechIndex(clips, speechIndex, textKey);
    const gap = speechGapBefore(segments, i, speechIndex);
    currentSec += gap;

    const durationSec = clip?.durationSeconds
      ? clip.durationSeconds
      : estimateSpeechDurationSeconds(segment.text);

    out.push({
      id: `p${speechIndex + 1}`,
      kind: "speech",
      speechIndex,
      text: segment.text,
      startSec: roundSec(currentSec),
      endSec: roundSec(currentSec + durationSec),
      durationSec: roundSec(durationSec),
      clip: {},
    });
    currentSec += durationSec;
    speechIndex += 1;
  }

  return {
    version: PREMIERE_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    projectTitle: input.project.title.trim() || "Untitled",
    projectId: input.project.id,
    audioFile: PREMIERE_MANIFEST_AUDIO_FILENAME,
    totalDurationSec: roundSec(currentSec),
    speechGapSeconds: DEFAULT_SPEECH_GAP_SECONDS,
    segments: out,
    instructions: {
      premiere:
        "1) Download MP3 as audioFile. 2) Run editor-ia/scripts/imagine-manifest-to-premiere.py with this manifest + local Footage folder + template .prproj. 3) Polish in Premiere.",
      footageFolder: "E:\\YourProject\\Footage",
    },
  };
}

function roundSec(n: number): number {
  return Math.round(n * 10) / 10;
}

export function mergeVisualHintsIntoManifest(
  base: ScriptPremiereManifest,
  hints: Array<{
    id: string;
    visual_intent?: string;
    keywords?: unknown;
    shots?: unknown;
  }>,
): ScriptPremiereManifest {
  const byId = new Map(hints.map((h) => [h.id, h]));
  const segments = base.segments.map((seg) => {
    const hint = byId.get(seg.id);
    if (!hint || seg.kind !== "speech") return seg;
    return {
      ...seg,
      visualIntent: trimHint(hint.visual_intent, 400) ?? seg.visualIntent,
      keywords: normalizeKeywords(hint.keywords),
      shots: normalizeShots(hint.shots, seg.durationSec),
    };
  });
  return { ...base, segments, generatedAt: new Date().toISOString() };
}

function trimHint(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().slice(0, max);
}

function normalizeKeywords(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim().slice(0, 40))
    .slice(0, 8);
  return out.length > 0 ? out : undefined;
}

function normalizeShots(raw: unknown, paragraphDurationSec: number): ScriptPremiereManifestShot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ScriptPremiereManifestShot[] = [];
  let n = 1;
  for (const item of raw) {
    const o = item as Partial<ScriptPremiereManifestShot> & { visual_intent?: string };
    const visualIntent = trimHint(o.visualIntent ?? o.visual_intent, 300);
    const durationSec =
      typeof o.durationSec === "number" && o.durationSec > 0
        ? Math.min(paragraphDurationSec, roundSec(o.durationSec))
        : 0;
    if (!visualIntent || durationSec < 0.5) continue;
    out.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 12) : `s${n}`,
      durationSec,
      visualIntent,
      keywords: normalizeKeywords(o.keywords),
    });
    n += 1;
  }
  return out.length > 0 ? out.slice(0, 6) : undefined;
}

export function manifestReadiness(
  script: string,
  notes: ScriptDraftNotes,
): { totalSpeech: number; withAudio: number; allReady: boolean } {
  const paragraphs = listScriptSpeechParagraphs(script);
  const clips = notes.paragraphNarration ?? [];
  const withAudio = paragraphs.filter((p) =>
    narrationClipForSpeechIndex(clips, p.speechIndex, p.textKey),
  ).length;
  return {
    totalSpeech: paragraphs.length,
    withAudio,
    allReady: paragraphs.length > 0 && withAudio === paragraphs.length,
  };
}

export function serializePremiereManifest(manifest: ScriptPremiereManifest): string {
  return JSON.stringify(manifest, null, 2);
}
