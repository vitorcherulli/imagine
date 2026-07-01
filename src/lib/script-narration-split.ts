import {
  countScriptSpeechWords,
  normalizeScriptText,
  parseScriptNarrationSegments,
  splitScriptIntoDisplayBlocks,
} from "./script-studio";
import { parsePauseSecondsFromBlock } from "./script-pause";
import { parseSectionTitleFromBlock } from "./script-sections";

const ABBREV_BEFORE_PERIOD =
  /(?:^|\s)(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|min|max|no|vol|ed|approx|St|Mt|Ft|Dept|Inc|Ltd|Co)\.$/i;

const MIN_WORDS_PER_LINE = 5;
const TARGET_WORDS_PER_LINE = 16;
const MAX_WORDS_PER_LINE = 26;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isAbbreviationPeriod(text: string): boolean {
  return ABBREV_BEFORE_PERIOD.test(text);
}

/** Split speech into clauses — respects abbreviations and multi-sentence punctuation. */
export function splitIntoSpeakableClauses(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];

  const clauses: string[] = [];
  let buffer = "";

  for (let index = 0; index < flat.length; index += 1) {
    const char = flat[index]!;
    buffer += char;

    if (char === "—" || (char === "-" && flat[index + 1] === "-")) {
      if (char === "-" && flat[index + 1] === "-") {
        buffer += flat[index + 1];
        index += 1;
      }
      const trimmed = buffer.trim();
      if (trimmed) clauses.push(trimmed);
      buffer = "";
      continue;
    }

    if (char === ";" || char === ":") {
      const trimmed = buffer.trim();
      if (trimmed) clauses.push(trimmed);
      buffer = "";
      continue;
    }

    if (char === "." || char === "?" || char === "!") {
      while (flat[index + 1] === ".") {
        buffer += flat[index + 1];
        index += 1;
      }
      if (char === "." && isAbbreviationPeriod(buffer)) {
        continue;
      }
      const trimmed = buffer.trim();
      if (trimmed) clauses.push(trimmed);
      buffer = "";
    }
  }

  const tail = buffer.trim();
  if (tail) clauses.push(tail);

  return clauses.length > 0 ? clauses : [flat];
}

function splitLongClauseByCommas(clause: string, maxWords: number): string[] {
  if (wordCount(clause) <= maxWords) return [clause];

  const parts = clause.split(/,\s+/);
  if (parts.length <= 1) return [clause];

  const out: string[] = [];
  let current = "";

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!.trim();
    const piece = index === 0 ? part : `${current ? `${current}, ` : ""}${part}`;
    const candidate = index === 0 ? part : piece;

    if (!current) {
      current = part;
      continue;
    }

    const combined = `${current}, ${part}`;
    if (wordCount(combined) <= maxWords) {
      current = combined;
    } else {
      out.push(current);
      current = part;
    }

    if (index === 0 && wordCount(candidate) > maxWords) {
      current = part;
    }
  }

  if (current) out.push(current);
  return out.length > 0 ? out : [clause];
}

/** Pack clauses into narrator breath lines (not one sentence per line). */
export function packClausesIntoNarratorLines(clauses: string[]): string[] {
  const expanded: string[] = [];
  for (const clause of clauses) {
    expanded.push(...splitLongClauseByCommas(clause, MAX_WORDS_PER_LINE));
  }

  const lines: string[] = [];
  let current = "";

  for (const clause of expanded) {
    const trimmed = clause.trim();
    if (!trimmed) continue;

    if (!current) {
      current = trimmed;
      continue;
    }

    const combined = `${current} ${trimmed}`;
    const combinedWords = wordCount(combined);
    const clauseWords = wordCount(trimmed);

    if (combinedWords <= MAX_WORDS_PER_LINE) {
      if (
        combinedWords <= TARGET_WORDS_PER_LINE ||
        wordCount(current) < MIN_WORDS_PER_LINE ||
        clauseWords < MIN_WORDS_PER_LINE
      ) {
        current = combined;
        continue;
      }
    }

    lines.push(current);
    current = trimmed;
  }

  if (current) lines.push(current);

  const merged: string[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      wordCount(line) < MIN_WORDS_PER_LINE &&
      wordCount(prev) + wordCount(line) <= MAX_WORDS_PER_LINE
    ) {
      merged[merged.length - 1] = `${prev} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return merged;
}

export function splitSpeechBlockForNarrator(block: string): string[] {
  const trimmed = block.trim();
  if (!trimmed) return [];

  const physicalLines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: string[] = [];

  for (const line of physicalLines) {
    const clauses = splitIntoSpeakableClauses(line);
    out.push(...packClausesIntoNarratorLines(clauses));
  }

  return out;
}

/**
 * Split an existing script into narrator locution lines — keeps every word.
 * Groups short beats; splits long passages at breath-friendly pauses.
 */
export function formatScriptForNarrationLines(script: string): string {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (parsePauseSecondsFromBlock(block) !== null) {
      out.push(trimmed);
      continue;
    }

    if (parseSectionTitleFromBlock(block) !== null) {
      out.push(trimmed);
      continue;
    }

    out.push(...splitSpeechBlockForNarrator(block));
  }

  return normalizeScriptText(out.join("\n\n"));
}

export function narrationSplitIsLossless(before: string, after: string): boolean {
  return countScriptSpeechWords(before) === countScriptSpeechWords(after);
}

export function assertNarrationSplitLossless(before: string, after: string): void {
  const beforeWords = countScriptSpeechWords(before);
  const afterWords = countScriptSpeechWords(after);
  if (beforeWords !== afterWords) {
    throw new Error(
      `Narration split changed word count (${beforeWords} → ${afterWords}).`,
    );
  }
}

/** Speech line count after narrator-aware split (for UI hints). */
export function countNarrationLinesAfterSplit(script: string): number {
  return parseScriptNarrationSegments(formatScriptForNarrationLines(script)).filter(
    (segment) => segment.kind === "speech",
  ).length;
}
