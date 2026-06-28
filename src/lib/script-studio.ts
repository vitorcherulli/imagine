import { z } from "zod";
import type { Project } from "./db/schema";
import { resolveProjectApiModels } from "./project-api-models";
import type { NarratorSuggestion, ScriptApplyBlock } from "./script-prompts";
import type { OutlineOptions } from "./script-outline-options";
import {
  DEFAULT_OUTLINE_OPTIONS,
  isLikelyCtaParagraph,
  outlineBeatMaxWords,
} from "./script-outline-options";

export const DEFAULT_WORDS_PER_MINUTE = 150;

/** ~10s of speech at DEFAULT_WORDS_PER_MINUTE. */
export const NARRATOR_PREVIEW_TARGET_SECONDS = 10;
export const NARRATOR_PREVIEW_WORDS = Math.round(
  (DEFAULT_WORDS_PER_MINUTE / 60) * NARRATOR_PREVIEW_TARGET_SECONDS,
);

export type ScriptSuggestionSeverity = "high" | "medium" | "low";

export interface ScriptSuggestion {
  id: string;
  /** Verbatim excerpt from the script — used for highlights. */
  quote: string;
  issue: string;
  recommendation: string;
  severity: ScriptSuggestionSeverity;
  category: string;
}

export interface ScriptReview {
  generatedAt: string;
  instruction?: string;
  overallSummary: string;
  strengths?: string[];
  suggestions: ScriptSuggestion[];
}

/** Clamp LLM review items to schema limits so refine/apply never 400s. */
export function normalizeScriptSuggestion(
  item: unknown,
  fallbackId: string,
): ScriptSuggestion | null {
  const o = item as Partial<ScriptSuggestion>;
  const quote = typeof o.quote === "string" ? o.quote.trim().slice(0, 500) : "";
  if (!quote) return null;
  return {
    id:
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 20)
        : fallbackId.slice(0, 20),
    quote,
    issue:
      (typeof o.issue === "string" ? o.issue.trim() : "Could be stronger").slice(0, 500) ||
      "Could be stronger",
    recommendation:
      (typeof o.recommendation === "string"
        ? o.recommendation.trim()
        : "Tighten wording while keeping the meaning."
      ).slice(0, 500) || "Tighten wording while keeping the meaning.",
    severity:
      o.severity === "high" || o.severity === "medium" || o.severity === "low"
        ? o.severity
        : "medium",
    category:
      (typeof o.category === "string" ? o.category.trim() : "wording").slice(0, 40) || "wording",
  };
}

export function normalizeScriptSuggestions(raw: unknown): ScriptSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptSuggestion[] = [];
  let n = 1;
  for (const item of raw) {
    const normalized = normalizeScriptSuggestion(item, `s${n}`);
    if (!normalized) continue;
    out.push(normalized);
    n += 1;
  }
  return out.slice(0, 12);
}

export type ScriptDeliverySpanKind =
  | "hook"
  | "question"
  | "stat"
  | "contrast"
  | "emotion"
  | "punch"
  | "cta";

export interface ScriptDeliverySpan {
  id: string;
  quote: string;
  kind: ScriptDeliverySpanKind;
  hint: string;
}

export interface ScriptDeliveryAnalysis {
  generatedAt: string;
  overallPace?: string;
  spans: ScriptDeliverySpan[];
}

export function normalizeScriptDeliverySpan(
  item: unknown,
  fallbackId: string,
): ScriptDeliverySpan | null {
  const o = item as Partial<ScriptDeliverySpan>;
  const quote = typeof o.quote === "string" ? o.quote.trim().slice(0, 200) : "";
  if (quote.length < 3) return null;
  const kinds = new Set([
    "hook",
    "question",
    "stat",
    "contrast",
    "emotion",
    "punch",
    "cta",
  ]);
  const kind =
    typeof o.kind === "string" && kinds.has(o.kind)
      ? (o.kind as ScriptDeliverySpanKind)
      : "emotion";
  return {
    id:
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 20)
        : fallbackId.slice(0, 20),
    quote,
    kind,
    hint:
      (typeof o.hint === "string" ? o.hint.trim() : "Add warmth and clarity.").slice(0, 300) ||
      "Add warmth and clarity.",
  };
}

export function normalizeScriptDeliverySpans(raw: unknown): ScriptDeliverySpan[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptDeliverySpan[] = [];
  let n = 1;
  for (const item of raw) {
    const normalized = normalizeScriptDeliverySpan(item, `d${n}`);
    if (!normalized) continue;
    out.push(normalized);
    n += 1;
  }
  return out.slice(0, 32);
}

export interface ScriptDraftNotes {
  narrator?: NarratorSuggestion;
  sourceMode?: "ai" | "pasted" | "edited";
  generatedAt?: string;
  updatedAt?: string;
  revision?: number;
  lastInstruction?: string;
  lastChangeSummary?: string;
  review?: ScriptReview;
  delivery?: ScriptDeliveryAnalysis;
}

export const narratorSuggestionSchema = z.object({
  voiceTone: z.string().min(1).max(60),
  ttsModel: z.string().min(1).max(120),
  ttsVoice: z.string().min(1).max(60),
  rationale: z.string().max(400).default(""),
  deliveryNotes: z.string().max(400).optional().default(""),
});

const scriptSuggestionSchema = z.object({
  id: z.string().min(1).max(20),
  quote: z.string().min(1).max(500),
  issue: z.string().min(1).max(500),
  recommendation: z.string().min(1).max(500),
  severity: z.enum(["high", "medium", "low"]),
  category: z.string().min(1).max(40),
});

const scriptReviewSchema = z.object({
  generatedAt: z.string(),
  instruction: z.string().max(2000).optional(),
  overallSummary: z.string().max(1200),
  strengths: z.array(z.string().max(300)).max(6).optional(),
  suggestions: z.array(scriptSuggestionSchema).max(20),
});

const scriptDeliverySpanSchema = z.object({
  id: z.string().min(1).max(20),
  quote: z.string().min(1).max(200),
  kind: z.enum(["hook", "question", "stat", "contrast", "emotion", "punch", "cta"]),
  hint: z.string().min(1).max(300),
});

const scriptDeliveryAnalysisSchema = z.object({
  generatedAt: z.string(),
  overallPace: z.string().max(600).optional(),
  spans: z.array(scriptDeliverySpanSchema).max(40),
});

export const scriptDraftNotesSchema = z
  .object({
    narrator: narratorSuggestionSchema.optional(),
    sourceMode: z.enum(["ai", "pasted", "edited"]).optional(),
    generatedAt: z.string().optional(),
    updatedAt: z.string().optional(),
    revision: z.number().int().min(0).max(10_000).optional(),
    lastInstruction: z.string().max(2000).optional(),
    lastChangeSummary: z.string().max(800).optional(),
    review: scriptReviewSchema.optional(),
    delivery: scriptDeliveryAnalysisSchema.optional(),
  })
  .strict();

export function parseScriptDraftNotes(raw: string | null | undefined): ScriptDraftNotes {
  if (!raw) return {};
  try {
    const parsed = scriptDraftNotesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function serializeScriptDraftNotes(notes: ScriptDraftNotes): string {
  return JSON.stringify(notes);
}

/** Narrator for Script Studio — saved suggestion or project voice settings. */
export function resolveScriptNarrator(
  project: Pick<
    Project,
    "voiceTone" | "ttsModel" | "ttsVoice" | "llmModel" | "imageModel" | "videoModel"
  >,
  notes: ScriptDraftNotes,
): NonNullable<ScriptDraftNotes["narrator"]> {
  if (notes.narrator) return notes.narrator;
  const models = resolveProjectApiModels(project);
  return {
    voiceTone: project.voiceTone || "Warm",
    ttsModel: models.ttsModel,
    ttsVoice: models.ttsVoice,
    rationale: "",
    deliveryNotes: "",
  };
}

export type ScriptDraftStatus = "none" | "draft" | "applied";

export interface ScriptVersionMeta {
  version: number;
  source: string;
  summary: string | null;
  wordCount: number;
  createdAt: string;
  isCurrent: boolean;
}

export const SCRIPT_VERSION_SOURCE_LABELS: Record<string, string> = {
  ai_generate: "AI generated",
  refine: "AI refined",
  paste: "Pasted",
  manual_checkpoint: "Checkpoint",
  restore: "Restored",
  applied_snapshot: "Applied",
  initial: "Initial",
};

export function scriptVersionSourceLabel(source: string): string {
  return SCRIPT_VERSION_SOURCE_LABELS[source] ?? source;
}

export function normalizeScriptDraftStatus(value: string | null | undefined): ScriptDraftStatus {
  if (value === "draft" || value === "applied") return value;
  return "none";
}

/** Strip CR, trim trailing blank lines, collapse 3+ blank lines to 2. */
export function normalizeScriptText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}

export const SCRIPT_PAUSE_LINE_RE = /^\[pause(?:\s+(\d+(?:\.\d+)?)\s*s)?\]$/i;
export const SCRIPT_PAUSE_DASH_RE = /^-{3,}$/;

export const DEFAULT_SCRIPT_PAUSE_SECONDS = 0.6;
export const DEFAULT_SPEECH_GAP_SECONDS = 0.4;

export type ScriptNarrationSegment =
  | { kind: "speech"; text: string }
  | { kind: "pause"; pauseSeconds: number };

function parsePauseSeconds(block: string): number | null {
  const trimmed = block.trim();
  if (!trimmed) return null;
  const tagged = SCRIPT_PAUSE_LINE_RE.exec(trimmed);
  if (tagged) {
    const raw = tagged[1] ? Number.parseFloat(tagged[1]) : DEFAULT_SCRIPT_PAUSE_SECONDS;
    return Math.min(5, Math.max(0.2, Number.isFinite(raw) ? raw : DEFAULT_SCRIPT_PAUSE_SECONDS));
  }
  if (SCRIPT_PAUSE_DASH_RE.test(trimmed)) {
    return DEFAULT_SCRIPT_PAUSE_SECONDS;
  }
  return null;
}

/** Split script into spoken lines and explicit pause markers (line-only `[pause]`, `[pause 1s]`, or `---`). */
export function parseScriptNarrationSegments(script: string): ScriptNarrationSegment[] {
  const normalized = normalizeScriptText(script);
  if (!normalized) return [];

  const segments: ScriptNarrationSegment[] = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const pauseSeconds = parsePauseSeconds(block);
    if (pauseSeconds !== null) {
      segments.push({ kind: "pause", pauseSeconds });
      continue;
    }
    const text = block.replace(/\s+/g, " ").trim();
    if (text) segments.push({ kind: "speech", text });
  }
  return segments;
}

export function splitScriptIntoParagraphs(script: string): string[] {
  return parseScriptNarrationSegments(script)
    .filter((segment): segment is Extract<ScriptNarrationSegment, { kind: "speech" }> => {
      return segment.kind === "speech";
    })
    .map((segment) => segment.text);
}

/** Raw paragraph blocks as written (preserves inner line breaks). */
export function splitScriptIntoDisplayBlocks(script: string): string[] {
  const normalized = normalizeScriptText(script);
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/);
}

/** Count speech vs pause blocks — used to validate outline extraction. */
export function countScriptStructure(script: string): { speech: number; pauses: number } {
  const segments = parseScriptNarrationSegments(script);
  return {
    speech: segments.filter((s) => s.kind === "speech").length,
    pauses: segments.filter((s) => s.kind === "pause").length,
  };
}

/**
 * Deterministic fallback: one beat line per paragraph, preserving pauses and order.
 * Does not invent or drop beats.
 */
export function compressScriptToOutlineBeats(
  script: string,
  options: OutlineOptions = DEFAULT_OUTLINE_OPTIONS,
): string {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const maxWords = outlineBeatMaxWords(options);
  const speechBlocks = blocks.filter((block) => {
    const trimmed = block.trim();
    return trimmed && parsePauseSeconds(block) === null;
  });
  const speechTotal = speechBlocks.length;
  const out: string[] = [];
  let speechIndex = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (parsePauseSeconds(block) !== null) {
      out.push(trimmed);
      continue;
    }

    speechIndex += 1;
    const isFirst = speechIndex === 1;
    const isLast = speechIndex === speechTotal;
    const flat = trimmed.replace(/\s+/g, " ");
    const words = flat.split(/\s+/);

    if (options.protectCta && isLikelyCtaParagraph(flat)) {
      out.push(flat);
      continue;
    }

    const voiceHeadroom =
      options.preserveVoice && options.beatLength === "balanced" && (isFirst || isLast)
        ? 12
        : 0;
    const effectiveMax = maxWords + voiceHeadroom;

    if (words.length <= effectiveMax) {
      out.push(flat);
      continue;
    }

    const firstSentence = flat.match(/^(.+?[.!?])(?:\s|$)/)?.[1]?.trim();
    if (options.preserveVoice && isFirst && firstSentence) {
      const firstWords = firstSentence.split(/\s+/).length;
      if (firstWords <= Math.max(maxWords, 22)) {
        out.push(firstSentence);
        continue;
      }
    }

    if (firstSentence && firstSentence.split(/\s+/).length <= maxWords) {
      out.push(firstSentence);
      continue;
    }

    out.push(`${words.slice(0, maxWords).join(" ")}…`);
  }

  return out.join("\n\n");
}

export type ScriptSegmentRole = "intro" | "middle" | "climax" | "cta" | "pause";

export interface ScriptSegmentMarker {
  role: ScriptSegmentRole;
  label: string;
  /** Block text as shown in the editor (may include [pause] lines). */
  displayText: string;
}

export function buildScriptSegmentMarkers(script: string): ScriptSegmentMarker[] {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const speechBlockCount = blocks.filter((block) => {
    const trimmed = block.trim();
    return trimmed && parsePauseSeconds(block) === null;
  }).length;

  const markers: ScriptSegmentMarker[] = [];
  let speechIndex = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const pauseSeconds = parsePauseSeconds(block);
    if (pauseSeconds !== null) {
      markers.push({
        role: "pause",
        label: "Pausa",
        displayText: trimmed,
      });
      continue;
    }

    speechIndex += 1;
    if (speechBlockCount <= 1) {
      markers.push({ role: "intro", label: "Gancho", displayText: trimmed });
      continue;
    }
    if (speechIndex === 1) {
      markers.push({ role: "intro", label: "Intro", displayText: trimmed });
      continue;
    }
    if (speechIndex === speechBlockCount) {
      markers.push({ role: "cta", label: "CTA", displayText: trimmed });
      continue;
    }
    if (speechBlockCount >= 4 && speechIndex === speechBlockCount - 1) {
      markers.push({ role: "climax", label: "Clímax", displayText: trimmed });
      continue;
    }
    markers.push({ role: "middle", label: "Meio", displayText: trimmed });
  }

  return markers;
}

export function countWords(input: string): number {
  if (!input) return 0;
  const matches = input.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function estimateNarrationSeconds(
  input: string,
  wpm: number = DEFAULT_WORDS_PER_MINUTE,
): number {
  const segments = parseScriptNarrationSegments(input);
  if (segments.length === 0) {
    const words = countWords(input);
    if (words === 0) return 0;
    return Math.max(1, Math.round((words / wpm) * 60));
  }

  let total = 0;
  let speechSegments = 0;
  for (const segment of segments) {
    if (segment.kind === "pause") {
      total += segment.pauseSeconds;
      continue;
    }
    speechSegments += 1;
    total += Math.max(1, (countWords(segment.text) / wpm) * 60);
    if (speechSegments > 1) total += DEFAULT_SPEECH_GAP_SECONDS;
  }
  return Math.max(1, Math.round(total));
}

export interface ScriptStats {
  characters: number;
  words: number;
  paragraphs: number;
  pauses: number;
  estimatedSeconds: number;
}

export function computeScriptStats(script: string): ScriptStats {
  const normalized = normalizeScriptText(script);
  const segments = parseScriptNarrationSegments(normalized);
  const paragraphs = segments.filter((segment) => segment.kind === "speech").length;
  const pauses = segments.filter((segment) => segment.kind === "pause").length;
  const words = segments
    .filter((segment): segment is Extract<ScriptNarrationSegment, { kind: "speech" }> => {
      return segment.kind === "speech";
    })
    .reduce((total, segment) => total + countWords(segment.text), 0);
  return {
    characters: normalized.length,
    words,
    paragraphs,
    pauses,
    estimatedSeconds: estimateNarrationSeconds(normalized),
  };
}

/** Short excerpt for narrator voice preview (~10 seconds). */
export function buildNarratorPreviewText(
  script: string,
  maxWords: number = NARRATOR_PREVIEW_WORDS,
): string {
  const normalized = normalizeScriptText(script);
  const paragraphs = splitScriptIntoParagraphs(normalized);
  const source = paragraphs[0] ?? normalized;
  if (!source.trim()) {
    return "This is how your narrator will sound — clear, natural, and ready to carry your story.";
  }
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export type ScriptHighlightSegment =
  | { type: "text"; value: string }
  | {
      type: "mark";
      value: string;
      suggestionId: string;
      severity: ScriptSuggestionSeverity;
    };

/** Split script into plain + highlighted spans for review UI. */
export function buildScriptHighlightSegments(
  script: string,
  suggestions: ScriptSuggestion[],
): ScriptHighlightSegment[] {
  if (!script || suggestions.length === 0) {
    return [{ type: "text", value: script }];
  }

  type Match = {
    start: number;
    end: number;
    suggestion: ScriptSuggestion;
  };

  const matches: Match[] = [];
  for (const suggestion of suggestions) {
    const quote = suggestion.quote.trim();
    if (!quote) continue;
    let from = 0;
    while (from < script.length) {
      const idx = script.indexOf(quote, from);
      if (idx === -1) break;
      matches.push({
        start: idx,
        end: idx + quote.length,
        suggestion,
      });
      from = idx + quote.length;
    }
  }

  if (matches.length === 0) {
    return [{ type: "text", value: script }];
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  const merged: Match[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (!last || m.start >= last.end) {
      merged.push(m);
    }
  }

  const segments: ScriptHighlightSegment[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) {
      segments.push({ type: "text", value: script.slice(cursor, m.start) });
    }
    segments.push({
      type: "mark",
      value: script.slice(m.start, m.end),
      suggestionId: m.suggestion.id,
      severity: m.suggestion.severity,
    });
    cursor = m.end;
  }
  if (cursor < script.length) {
    segments.push({ type: "text", value: script.slice(cursor) });
  }
  return segments;
}

export function severityHighlightClass(severity: ScriptSuggestionSeverity): string {
  switch (severity) {
    case "high":
      return "bg-destructive/25";
    case "medium":
      return "bg-warning/25";
    default:
      return "bg-accent/20";
  }
}

/** Minimal continuous storyboard from script segments (speech + visual pause holds). */
export function buildFallbackBlocksFromScript(script: string): ScriptApplyBlock[] {
  const segments = parseScriptNarrationSegments(script);
  const speechCount = segments.filter((segment) => segment.kind === "speech").length;
  if (speechCount === 0) return [];

  const blocks: ScriptApplyBlock[] = [];
  let speechIndex = 0;
  let pauseIndex = 0;
  let narrationIndex = 0;

  for (const segment of segments) {
    if (segment.kind === "pause") {
      pauseIndex += 1;
      blocks.push({
        narrativeText: "",
        visualPrompt:
          "Atmospheric visual hold — slow gentle motion, let the image breathe without narration.",
        durationSeconds: Math.max(1, Math.round(segment.pauseSeconds)),
        segmentType: "development",
        narrationGroupId: `pause${pauseIndex}`,
        locationTag: null,
        characterName: null,
      });
      continue;
    }

    narrationIndex += 1;
    speechIndex += 1;
    const words = countWords(segment.text);
    const seconds = Math.max(4, Math.round((words / DEFAULT_WORDS_PER_MINUTE) * 60));
    blocks.push({
      narrativeText: segment.text,
      visualPrompt: "",
      durationSeconds: seconds,
      segmentType:
        speechIndex === 1 ? "intro" : speechIndex === speechCount ? "resolution" : "development",
      narrationGroupId: `n${narrationIndex}`,
      locationTag: null,
      characterName: null,
    });
  }

  return blocks;
}
