import {
  parseScriptNarrationSegments,
  type ScriptParagraphNarrationClip,
} from "./script-studio";

export function scriptParagraphTextKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 480);
}

export interface ScriptSpeechParagraph {
  speechIndex: number;
  text: string;
  textKey: string;
}

export function listScriptSpeechParagraphs(script: string): ScriptSpeechParagraph[] {
  const segments = parseScriptNarrationSegments(script);
  const out: ScriptSpeechParagraph[] = [];
  let speechIndex = 0;
  for (const segment of segments) {
    if (segment.kind !== "speech") continue;
    out.push({
      speechIndex,
      text: segment.text,
      textKey: scriptParagraphTextKey(segment.text),
    });
    speechIndex += 1;
  }
  return out;
}

export function speechIndexFromNarrationGroupId(groupId: string): number | null {
  const match = /^n(\d+)$/.exec(groupId.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}

export interface ScriptPauseParagraph {
  pauseIndex: number;
  pauseSeconds: number;
  textKey: string;
}

export function pauseParagraphTextKey(pauseIndex: number, pauseSeconds: number): string {
  return `pause:${pauseIndex}:${pauseSeconds}`;
}

export function listScriptPauseParagraphs(script: string): ScriptPauseParagraph[] {
  const segments = parseScriptNarrationSegments(script);
  const out: ScriptPauseParagraph[] = [];
  let pauseIndex = 0;
  for (const segment of segments) {
    if (segment.kind !== "pause") continue;
    out.push({
      pauseIndex,
      pauseSeconds: segment.pauseSeconds,
      textKey: pauseParagraphTextKey(pauseIndex, segment.pauseSeconds),
    });
    pauseIndex += 1;
  }
  return out;
}

export function pauseIndexFromNarrationGroupId(groupId: string): number | null {
  const match = /^pause(\d+)$/i.exec(groupId.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}

/** Speech text before a pause — used as image-search context for music holds. */
export function pauseSearchContext(script: string, pauseIndex: number): string {
  const segments = parseScriptNarrationSegments(script);
  let pIdx = 0;
  let lastSpeech = "";
  for (const segment of segments) {
    if (segment.kind === "speech") lastSpeech = segment.text;
    if (segment.kind === "pause") {
      if (pIdx === pauseIndex) return lastSpeech.trim();
      pIdx += 1;
    }
  }
  return "";
}

export function mergeParagraphNarrationClip(
  existing: ScriptParagraphNarrationClip[] | undefined,
  clip: ScriptParagraphNarrationClip,
): ScriptParagraphNarrationClip[] {
  const next = [...(existing ?? [])].filter((c) => c.speechIndex !== clip.speechIndex);
  next.push(clip);
  next.sort((a, b) => a.speechIndex - b.speechIndex);
  return next;
}

export function narrationClipForSpeechIndex(
  clips: ScriptParagraphNarrationClip[] | undefined,
  speechIndex: number,
  textKey: string,
): ScriptParagraphNarrationClip | null {
  const clip = clips?.find((c) => c.speechIndex === speechIndex);
  if (!clip || clip.textKey !== textKey) return null;
  return clip;
}

/** Clips stored for a paragraph index but whose text no longer matches the script. */
export function countOutdatedParagraphClips(
  script: string,
  clips: ScriptParagraphNarrationClip[] | undefined,
): number {
  if (!clips?.length) return 0;
  const paragraphs = listScriptSpeechParagraphs(script);
  return paragraphs.filter((p) => {
    const clip = clips.find((c) => c.speechIndex === p.speechIndex);
    return clip !== undefined && clip.textKey !== p.textKey;
  }).length;
}
