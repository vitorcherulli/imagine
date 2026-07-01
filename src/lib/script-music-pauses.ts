import { parseSectionTitleFromBlock } from "@/lib/script-sections";
import {
  clampPauseSeconds,
  formatPauseLine,
  parsePauseSecondsFromBlock,
  PAUSE_PRESET_SECONDS,
} from "@/lib/script-pause";
import { normalizeScriptText, splitScriptIntoDisplayBlocks } from "@/lib/script-studio";

export interface ScriptMusicPauseInsertion {
  id: string;
  afterSpeechIndex: number;
  seconds: number;
  reason: string;
}

export interface ScriptMusicPausesAnalysis {
  generatedAt: string;
  overallStrategy?: string;
  insertionCount: number;
  insertions: ScriptMusicPauseInsertion[];
}

export interface IndexedSpeechBlock {
  displayIndex: number;
  speechIndex: number;
}

/** Map each speech paragraph to its display block index (skips pauses and sections). */
export function indexScriptSpeechBlocks(script: string): IndexedSpeechBlock[] {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const out: IndexedSpeechBlock[] = [];
  let speechIndex = 0;
  for (let displayIndex = 0; displayIndex < blocks.length; displayIndex += 1) {
    const block = blocks[displayIndex]!;
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (parsePauseSecondsFromBlock(block) !== null) continue;
    if (parseSectionTitleFromBlock(block) !== null) continue;
    out.push({ displayIndex, speechIndex });
    speechIndex += 1;
  }
  return out;
}

export function countScriptSpeechParagraphs(script: string): number {
  return indexScriptSpeechBlocks(script).length;
}

export function stripScriptPauseBlocks(script: string): string {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const kept = blocks.filter((block) => {
    const trimmed = block.trim();
    if (!trimmed) return false;
    return parsePauseSecondsFromBlock(block) === null;
  });
  return normalizeScriptText(kept.join("\n\n"));
}

function nearestPresetSeconds(seconds: number): (typeof PAUSE_PRESET_SECONDS)[number] {
  const clamped = clampPauseSeconds(seconds);
  let best: (typeof PAUSE_PRESET_SECONDS)[number] = PAUSE_PRESET_SECONDS[0]!;
  let bestDist = Math.abs(clamped - best);
  for (const preset of PAUSE_PRESET_SECONDS) {
    const dist = Math.abs(clamped - preset);
    if (dist < bestDist) {
      best = preset;
      bestDist = dist;
    }
  }
  return best;
}

export function normalizeMusicPauseInsertions(
  raw: unknown,
  speechCount: number,
): ScriptMusicPauseInsertion[] {
  if (!Array.isArray(raw) || speechCount < 2) return [];

  const candidates: ScriptMusicPauseInsertion[] = [];
  let n = 1;
  for (const item of raw) {
    const o = item as Partial<{
      id: string;
      after_speech_index: number;
      seconds: number;
      reason: string;
    }>;
    const afterSpeechIndex =
      typeof o.after_speech_index === "number" ? Math.floor(o.after_speech_index) : -1;
    if (afterSpeechIndex < 0 || afterSpeechIndex >= speechCount - 1) continue;
    const seconds =
      typeof o.seconds === "number" ? nearestPresetSeconds(o.seconds) : PAUSE_PRESET_SECONDS[1];
    const reason =
      (typeof o.reason === "string" ? o.reason.trim() : "Music swell for pacing").slice(0, 200) ||
      "Music swell for pacing";
    candidates.push({
      id:
        typeof o.id === "string" && o.id.trim()
          ? o.id.trim().slice(0, 20)
          : `p${n}`.slice(0, 20),
      afterSpeechIndex,
      seconds,
      reason,
    });
    n += 1;
  }

  candidates.sort((a, b) => a.afterSpeechIndex - b.afterSpeechIndex);

  const minSpeechGap = 2;
  const accepted: ScriptMusicPauseInsertion[] = [];
  let lastAcceptedSpeechIndex = -minSpeechGap - 1;

  for (const candidate of candidates) {
    if (candidate.afterSpeechIndex - lastAcceptedSpeechIndex < minSpeechGap) continue;
    if (accepted.some((item) => item.afterSpeechIndex === candidate.afterSpeechIndex)) continue;
    accepted.push(candidate);
    lastAcceptedSpeechIndex = candidate.afterSpeechIndex;
    if (accepted.length >= 16) break;
  }

  return accepted;
}

export function applyMusicPauseInsertions(
  script: string,
  insertions: ScriptMusicPauseInsertion[],
  options?: { replaceExisting?: boolean },
): { script: string; appliedCount: number } {
  let working = options?.replaceExisting !== false ? stripScriptPauseBlocks(script) : script;
  if (insertions.length === 0) {
    return { script: normalizeScriptText(working), appliedCount: 0 };
  }

  const speechBlocks = indexScriptSpeechBlocks(working);
  const speechIndexToDisplay = new Map(
    speechBlocks.map((item) => [item.speechIndex, item.displayIndex]),
  );

  let blocks = splitScriptIntoDisplayBlocks(working);
  const sorted = [...insertions].sort((a, b) => b.afterSpeechIndex - a.afterSpeechIndex);
  let appliedCount = 0;

  for (const insertion of sorted) {
    const displayIndex = speechIndexToDisplay.get(insertion.afterSpeechIndex);
    if (displayIndex === undefined) continue;
    const insertAt = displayIndex + 1;
    const pauseLine = formatPauseLine(insertion.seconds);
    if (blocks[insertAt]?.trim() === pauseLine) continue;
    blocks = [...blocks.slice(0, insertAt), pauseLine, ...blocks.slice(insertAt)];
    appliedCount += 1;
  }

  return {
    script: normalizeScriptText(blocks.join("\n\n")),
    appliedCount,
  };
}

export function suggestMusicPauseTargetRange(speechCount: number): { min: number; max: number } {
  if (speechCount < 4) return { min: 0, max: 1 };
  if (speechCount < 10) return { min: 2, max: 4 };
  if (speechCount < 20) return { min: 3, max: 7 };
  return {
    min: Math.max(4, Math.round(speechCount / 6)),
    max: Math.min(14, Math.round(speechCount / 3)),
  };
}
