import { z } from "zod";
import type { Project } from "./db/schema";
import { resolveProjectApiModels } from "./project-api-models";
import type { ScriptPremiereManifest } from "./script-premiere-manifest";
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

export interface ScriptPronunciationHint {
  id: string;
  /** Verbatim word/phrase from the script (display form). */
  written: string;
  /** Phonetic respelling for TTS — not shown in the document. */
  spoken: string;
  /** e.g. pt-BR, es, fr */
  lang?: string;
  note?: string;
}

export interface ScriptPronunciationAnalysis {
  generatedAt: string;
  summary?: string;
  hints: ScriptPronunciationHint[];
}

export interface ScriptResearchItem {
  id: string;
  text: string;
  sourceUrl?: string;
  sourceTitle?: string;
  /** Set when woven into the script via Add. */
  addedAt?: string;
}

export interface ScriptResearchFactCheck {
  id: string;
  quote: string;
  status: "correct" | "wrong" | "unverified";
  note: string;
  sourceUrl?: string;
}

export interface ScriptResearchAnalysis {
  generatedAt: string;
  provider: string;
  summary?: string;
  queries: string[];
  facts: ScriptResearchItem[];
  curiosities: ScriptResearchItem[];
  factChecks?: ScriptResearchFactCheck[];
}

export function normalizeScriptPronunciationHint(
  item: unknown,
  fallbackId: string,
): ScriptPronunciationHint | null {
  const o = item as Partial<ScriptPronunciationHint>;
  const written = typeof o.written === "string" ? o.written.trim().slice(0, 120) : "";
  const spoken = typeof o.spoken === "string" ? o.spoken.trim().slice(0, 120) : "";
  if (written.length < 2 || spoken.length < 2) return null;
  return {
    id:
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 20)
        : fallbackId.slice(0, 20),
    written,
    spoken,
    lang:
      typeof o.lang === "string" && o.lang.trim()
        ? o.lang.trim().slice(0, 12)
        : undefined,
    note:
      typeof o.note === "string" && o.note.trim()
        ? o.note.trim().slice(0, 200)
        : undefined,
  };
}

export function normalizeScriptPronunciationHints(raw: unknown): ScriptPronunciationHint[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptPronunciationHint[] = [];
  const seen = new Set<string>();
  let n = 1;
  for (const item of raw) {
    const normalized = normalizeScriptPronunciationHint(item, `p${n}`);
    if (!normalized) continue;
    const key = normalized.written.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    n += 1;
  }
  return out.slice(0, 48);
}

function normalizeScriptResearchItem(
  item: unknown,
  fallbackId: string,
): ScriptResearchItem | null {
  const o = item as Partial<ScriptResearchItem> & {
    source_url?: string;
    source_title?: string;
  };
  const text = typeof o.text === "string" ? o.text.trim().slice(0, 400) : "";
  if (text.length < 8) return null;
  const sourceUrl =
    (typeof o.sourceUrl === "string" && o.sourceUrl.trim()) ||
    (typeof o.source_url === "string" && o.source_url.trim()) ||
    undefined;
  const sourceTitle =
    (typeof o.sourceTitle === "string" && o.sourceTitle.trim()) ||
    (typeof o.source_title === "string" && o.source_title.trim()) ||
    undefined;
  return {
    id:
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 20)
        : fallbackId.slice(0, 20),
    text,
    sourceUrl: sourceUrl?.slice(0, 500),
    sourceTitle: sourceTitle?.slice(0, 200),
    addedAt:
      typeof o.addedAt === "string" && o.addedAt.trim()
        ? o.addedAt.trim().slice(0, 40)
        : undefined,
  };
}

function normalizeScriptResearchItems(raw: unknown, max: number): ScriptResearchItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptResearchItem[] = [];
  let n = 1;
  for (const item of raw) {
    const normalized = normalizeScriptResearchItem(item, `r${n}`);
    if (!normalized) continue;
    out.push(normalized);
    n += 1;
  }
  return out.slice(0, max);
}

function normalizeScriptResearchFactCheck(
  item: unknown,
  fallbackId: string,
): ScriptResearchFactCheck | null {
  const o = item as Partial<ScriptResearchFactCheck>;
  const quote = typeof o.quote === "string" ? o.quote.trim().slice(0, 300) : "";
  const note = typeof o.note === "string" ? o.note.trim().slice(0, 400) : "";
  if (quote.length < 5 || note.length < 5) return null;
  const statuses = new Set(["correct", "wrong", "unverified"]);
  const status =
    typeof o.status === "string" && statuses.has(o.status)
      ? (o.status as ScriptResearchFactCheck["status"])
      : "unverified";
  return {
    id:
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().slice(0, 20)
        : fallbackId.slice(0, 20),
    quote,
    status,
    note,
    sourceUrl:
      typeof o.sourceUrl === "string" && o.sourceUrl.trim()
        ? o.sourceUrl.trim().slice(0, 500)
        : undefined,
  };
}

export function normalizeScriptResearchAnalysis(
  raw: unknown,
  provider: string,
): ScriptResearchAnalysis | null {
  const o = raw as Partial<ScriptResearchAnalysis> & {
    facts?: unknown;
    curiosities?: unknown;
    fact_checks?: unknown;
  };
  const facts = normalizeScriptResearchItems(o.facts, 16);
  const curiosities = normalizeScriptResearchItems(o.curiosities, 12);
  const factChecksRaw = o.factChecks ?? o.fact_checks;
  const factChecks = Array.isArray(factChecksRaw)
    ? factChecksRaw
        .map((item, i) => normalizeScriptResearchFactCheck(item, `fc${i + 1}`))
        .filter((x): x is ScriptResearchFactCheck => !!x)
        .slice(0, 12)
    : undefined;

  if (facts.length === 0 && curiosities.length === 0 && !factChecks?.length) {
    return null;
  }

  const queries = Array.isArray(o.queries)
    ? o.queries
        .filter((q): q is string => typeof q === "string" && q.trim().length > 2)
        .map((q) => q.trim().slice(0, 120))
        .slice(0, 8)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    provider: provider.slice(0, 40),
    summary:
      typeof o.summary === "string" && o.summary.trim()
        ? o.summary.trim().slice(0, 800)
        : undefined,
    queries,
    facts,
    curiosities,
    factChecks: factChecks?.length ? factChecks : undefined,
  };
}

export function countResearchItemsAdded(research: ScriptResearchAnalysis | undefined): {
  added: number;
  total: number;
} {
  if (!research) return { added: 0, total: 0 };
  const items = [...research.facts, ...research.curiosities];
  return {
    added: items.filter((i) => i.addedAt).length,
    total: items.length,
  };
}

export function researchContextForPrompt(
  research: ScriptResearchAnalysis | undefined,
): Record<string, unknown> | undefined {
  if (!research) return undefined;
  if (!research.facts.length && !research.curiosities.length) return undefined;
  return {
    summary: research.summary,
    verified_facts: research.facts.map((f) => ({
      text: f.text,
      source: f.sourceTitle ?? f.sourceUrl,
    })),
    curiosities: research.curiosities.map((c) => ({
      text: c.text,
      source: c.sourceTitle ?? c.sourceUrl,
    })),
    ...(research.factChecks?.length
      ? {
          fact_checks: research.factChecks.map((fc) => ({
            quote: fc.quote,
            status: fc.status,
            note: fc.note,
            source: fc.sourceUrl,
          })),
        }
      : {}),
    usage_rules: [
      "Use ONLY these verified facts and curiosities — do not invent statistics or superlatives.",
      "Weave 2–6 details naturally; keep speakable sentences and word budget.",
      "If a fact_check marks a quote as wrong, fix or soften that claim.",
    ],
  };
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

export interface ScriptParagraphNarrationClip {
  speechIndex: number;
  textKey: string;
  audioUrl: string;
  durationSeconds: number;
  generatedAt: string;
}

export interface ScriptImageSearchHit {
  id: string;
  previewUrl: string;
  fullUrl: string;
  sourceUrl: string;
  sourceTitle?: string;
  provider: string;
  width?: number;
  height?: number;
  attribution?: string;
}

export type ScriptReferenceMediaKind = "image" | "video";

export interface ScriptKeywordImageMatch {
  keyword: string;
  mediaKind?: ScriptReferenceMediaKind;
  selectedId: string | null;
  results: ScriptImageSearchHit[];
  importedUrl?: string;
  /** Cached thumbnail — survives even if results[] is trimmed on reload. */
  importedPreviewUrl?: string;
  importedAt?: string;
}

export function keywordMatchIsVideo(match: ScriptKeywordImageMatch): boolean {
  return match.mediaKind === "video";
}

export function countParagraphVideosImported(search: ScriptParagraphImageSearch | undefined): {
  imported: number;
  total: number;
} {
  if (!search) return { imported: 0, total: 0 };
  const videos = search.keywords.filter((k) => keywordMatchIsVideo(k));
  return {
    total: videos.length,
    imported: videos.filter((k) => Boolean(k.importedUrl?.trim())).length,
  };
}

/** True when the bubble can show a photo (search hit or already imported). */
export function keywordImageMatchIsVisible(match: ScriptKeywordImageMatch): boolean {
  return Boolean(match.importedUrl?.trim() || match.importedPreviewUrl?.trim() || match.results.length > 0);
}

export function resolveKeywordImagePreviewUrl(match: ScriptKeywordImageMatch): string | null {
  const isLikelyVideoUrl = (url: string) => /\.mp4(\?|#|$)/i.test(url.split("?")[0] ?? url);

  if (keywordMatchIsVideo(match)) {
    if (match.importedPreviewUrl?.trim()) {
      const url = match.importedPreviewUrl.trim();
      if (!isLikelyVideoUrl(url)) return url;
    }
    const selected =
      match.results.find((r) => r.id === match.selectedId) ?? match.results[0];
    const preview = selected?.previewUrl?.trim();
    if (preview && !isLikelyVideoUrl(preview)) return preview;
    return null;
  }
  if (match.importedPreviewUrl?.trim()) return match.importedPreviewUrl.trim();
  if (match.importedUrl?.trim()) return match.importedUrl.trim();
  const selected =
    match.results.find((r) => r.id === match.selectedId) ?? match.results[0];
  return selected?.previewUrl?.trim() || selected?.fullUrl?.trim() || null;
}

/** Local or remote MP4 for script reference video playback. */
export function resolveKeywordVideoPlaybackUrl(match: ScriptKeywordImageMatch): string | null {
  if (!keywordMatchIsVideo(match)) return null;
  if (match.importedUrl?.trim()) return match.importedUrl.trim();
  const selected =
    match.results.find((r) => r.id === match.selectedId) ?? match.results[0];
  const candidate = selected?.fullUrl?.trim() || selected?.previewUrl?.trim();
  if (candidate && /\.mp4(\?|#|$)/i.test(candidate.split("?")[0] ?? candidate)) {
    return candidate;
  }
  return null;
}

export function resolveKeywordImageExpandedUrl(match: ScriptKeywordImageMatch): string | null {
  if (keywordMatchIsVideo(match)) {
    const poster = resolveKeywordImagePreviewUrl(match);
    if (poster) return poster;
    return resolveKeywordVideoPlaybackUrl(match);
  }
  const selected =
    match.results.find((r) => r.id === match.selectedId) ?? match.results[0];
  return selected?.fullUrl?.trim() || selected?.previewUrl?.trim() || null;
}

export interface ScriptParagraphImageSearch {
  /** 0-based speech paragraph; omit when pauseIndex is set. */
  speechIndex?: number;
  /** 0-based pause hold; omit for speech paragraphs. */
  pauseIndex?: number;
  textKey: string;
  searchedAt: string;
  provider: string;
  keywords: ScriptKeywordImageMatch[];
}

import type { ScriptMusicPausesAnalysis } from "./script-music-pauses";
export type { ScriptMusicPausesAnalysis } from "./script-music-pauses";

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
  pronunciation?: ScriptPronunciationAnalysis;
  musicPauses?: ScriptMusicPausesAnalysis;
  research?: ScriptResearchAnalysis;
  paragraphNarration?: ScriptParagraphNarrationClip[];
  paragraphImages?: ScriptParagraphImageSearch[];
  premiereManifest?: ScriptPremiereManifest;
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

const scriptPronunciationHintSchema = z.object({
  id: z.string().min(1).max(20),
  written: z.string().min(2).max(120),
  spoken: z.string().min(2).max(120),
  lang: z.string().max(12).optional(),
  note: z.string().max(200).optional(),
});

const scriptPronunciationAnalysisSchema = z.object({
  generatedAt: z.string(),
  summary: z.string().max(800).optional(),
  hints: z.array(scriptPronunciationHintSchema).max(48),
});

const scriptMusicPauseInsertionSchema = z.object({
  id: z.string().min(1).max(20),
  afterSpeechIndex: z.number().int().min(0).max(200),
  seconds: z.number().int().min(1).max(20),
  reason: z.string().min(1).max(200),
});

const scriptMusicPausesAnalysisSchema = z.object({
  generatedAt: z.string(),
  overallStrategy: z.string().max(600).optional(),
  insertionCount: z.number().int().min(0).max(20),
  insertions: z.array(scriptMusicPauseInsertionSchema).max(20),
});

const scriptResearchItemSchema = z.object({
  id: z.string().min(1).max(20),
  text: z.string().min(8).max(400),
  sourceUrl: z.string().max(500).optional(),
  sourceTitle: z.string().max(200).optional(),
  addedAt: z.string().max(40).optional(),
});

const scriptResearchFactCheckSchema = z.object({
  id: z.string().min(1).max(20),
  quote: z.string().min(5).max(300),
  status: z.enum(["correct", "wrong", "unverified"]),
  note: z.string().min(5).max(400),
  sourceUrl: z.string().max(500).optional(),
});

const scriptResearchAnalysisSchema = z.object({
  generatedAt: z.string(),
  provider: z.string().max(40),
  summary: z.string().max(800).optional(),
  queries: z.array(z.string().max(120)).max(8),
  facts: z.array(scriptResearchItemSchema).max(16),
  curiosities: z.array(scriptResearchItemSchema).max(12),
  factChecks: z.array(scriptResearchFactCheckSchema).max(12).optional(),
});

const scriptParagraphNarrationClipSchema = z.object({
  speechIndex: z.number().int().min(0).max(200),
  textKey: z.string().min(1).max(500),
  audioUrl: z.string().min(1).max(2000),
  durationSeconds: z.number().min(0).max(600),
  generatedAt: z.string(),
});

const scriptImageSearchHitSchema = z.object({
  id: z.string().min(1).max(80),
  previewUrl: z.string().min(1).max(2000),
  fullUrl: z.string().min(1).max(2000),
  sourceUrl: z.string().max(2000).optional(),
  sourceTitle: z.string().max(500).optional(),
  provider: z.string().max(40).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  attribution: z.string().max(300).optional(),
});

const scriptKeywordImageMatchSchema = z.object({
  keyword: z.string().min(1).max(80),
  mediaKind: z.enum(["image", "video"]).optional(),
  selectedId: z.string().max(80).nullable(),
  results: z.array(scriptImageSearchHitSchema).max(12),
  importedUrl: z.string().max(2000).optional(),
  importedPreviewUrl: z.string().max(2000).optional(),
  importedAt: z.string().optional(),
});

const scriptParagraphImageSearchSchema = z
  .object({
    speechIndex: z.number().int().min(0).max(200).optional(),
    pauseIndex: z.number().int().min(0).max(200).optional(),
    textKey: z.string().min(1).max(500),
    searchedAt: z.string(),
    provider: z.string().max(80),
    keywords: z.array(scriptKeywordImageMatchSchema).max(12),
  })
  .refine(
    (data) =>
      (data.speechIndex !== undefined && data.pauseIndex === undefined) ||
      (data.pauseIndex !== undefined && data.speechIndex === undefined),
    { message: "Exactly one of speechIndex or pauseIndex is required" },
  );

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
    pronunciation: scriptPronunciationAnalysisSchema.optional(),
    musicPauses: scriptMusicPausesAnalysisSchema.optional(),
    research: scriptResearchAnalysisSchema.optional(),
    paragraphNarration: z.array(scriptParagraphNarrationClipSchema).max(200).optional(),
    paragraphImages: z.array(scriptParagraphImageSearchSchema).max(200).optional(),
    premiereManifest: z.unknown().optional(),
  })
  .strip();

function preserveHeavyScriptNotes(
  notes: ScriptDraftNotes,
  parsed: ScriptDraftNotes,
): ScriptDraftNotes {
  return {
    ...parsed,
    ...(notes.paragraphImages?.length && !parsed.paragraphImages?.length
      ? { paragraphImages: notes.paragraphImages }
      : {}),
    ...(notes.paragraphNarration?.length && !parsed.paragraphNarration?.length
      ? { paragraphNarration: notes.paragraphNarration }
      : {}),
    ...(notes.premiereManifest && !parsed.premiereManifest
      ? { premiereManifest: notes.premiereManifest }
      : {}),
  };
}

/** Normalize notes before API PUT — drops unknown keys and coerces defaults. */
export function sanitizeScriptDraftNotesForApi(
  notes: ScriptDraftNotes,
): ScriptDraftNotes {
  const parsed = scriptDraftNotesSchema.safeParse(notes);
  if (parsed.success) return preserveHeavyScriptNotes(notes, parsed.data as ScriptDraftNotes);
  const narratorOnly = notes.narrator
    ? narratorSuggestionSchema.safeParse(notes.narrator)
    : null;
  if (narratorOnly?.success) {
    return preserveHeavyScriptNotes(notes, {
      narrator: narratorOnly.data as ScriptDraftNotes["narrator"],
    });
  }
  return preserveHeavyScriptNotes(notes, {});
}

export function parseScriptDraftNotes(raw: string | null | undefined): ScriptDraftNotes {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw) as ScriptDraftNotes;
    const parsed = scriptDraftNotesSchema.safeParse(json);
    if (parsed.success) return preserveHeavyScriptNotes(json, parsed.data as ScriptDraftNotes);
    return json;
  } catch {
    return {};
  }
}

export function serializeScriptDraftNotes(notes: ScriptDraftNotes): string {
  return JSON.stringify(notes);
}

/** Narrator for Script Studio — project voice settings + script delivery notes. */
export function resolveScriptNarrator(
  project: Pick<
    Project,
    "voiceTone" | "ttsModel" | "ttsVoice" | "llmModel" | "imageModel" | "videoModel"
  >,
  notes: ScriptDraftNotes,
): NonNullable<ScriptDraftNotes["narrator"]> {
  const models = resolveProjectApiModels(project);
  const fromProject = {
    voiceTone: project.voiceTone || "Warm",
    ttsModel: models.ttsModel,
    ttsVoice: models.ttsVoice,
    rationale: "",
    deliveryNotes: "",
  };
  if (!notes.narrator) return fromProject;
  return {
    ...fromProject,
    rationale: notes.narrator.rationale ?? "",
    deliveryNotes: notes.narrator.deliveryNotes ?? "",
    // Project row is source of truth for engine + voice (synced on every change in Script Studio).
    voiceTone: project.voiceTone || notes.narrator.voiceTone || fromProject.voiceTone,
    ttsModel: models.ttsModel,
    ttsVoice: models.ttsVoice,
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
  music_pauses: "Music moments (AI)",
  paste: "Pasted",
  manual_checkpoint: "Checkpoint",
  autosave: "Auto-saved",
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

import {
  DEFAULT_SCRIPT_PAUSE_SECONDS,
  MAX_SCRIPT_PAUSE_SECONDS,
  PAUSE_VISUAL_PROMPT,
  parsePauseSecondsFromBlock,
  SCRIPT_PAUSE_DASH_RE,
  SCRIPT_PAUSE_LINE_RE,
} from "@/lib/script-pause";
import { parseSectionTitleFromBlock } from "@/lib/script-sections";

export {
  DEFAULT_SCRIPT_PAUSE_SECONDS,
  MAX_SCRIPT_PAUSE_SECONDS,
  SCRIPT_PAUSE_DASH_RE,
  SCRIPT_PAUSE_LINE_RE,
} from "@/lib/script-pause";

export const DEFAULT_SPEECH_GAP_SECONDS = 0.4;

export type ScriptNarrationSegment =
  | { kind: "speech"; text: string }
  | { kind: "pause"; pauseSeconds: number }
  | { kind: "section"; title: string };

function parsePauseSeconds(block: string): number | null {
  return parsePauseSecondsFromBlock(block);
}

function parseSectionTitle(block: string): string | null {
  return parseSectionTitleFromBlock(block);
}

/** Split script into spoken lines, pauses, and visual section markers. */
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

    const sectionTitle = parseSectionTitle(block);
    if (sectionTitle !== null) {
      segments.push({ kind: "section", title: sectionTitle });
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

/** Count speech vs pause vs section blocks — used to validate outline extraction. */
export function countScriptStructure(script: string): {
  speech: number;
  pauses: number;
  sections: number;
} {
  const segments = parseScriptNarrationSegments(script);
  return {
    speech: segments.filter((s) => s.kind === "speech").length,
    pauses: segments.filter((s) => s.kind === "pause").length,
    sections: segments.filter((s) => s.kind === "section").length,
  };
}

/** Split one speech line into sentence-sized units — keeps every word. */
export function splitIntoSpeakableSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const matches = flat.match(/[^.!?]+(?:[.!?]+|$)/g);
  if (!matches?.length) return [flat];
  return matches.map((part) => part.trim()).filter(Boolean);
}

/** Word count across speech segments — used to verify lossless formatting. */
export function countScriptSpeechWords(script: string): number {
  return parseScriptNarrationSegments(script)
    .filter((segment): segment is Extract<ScriptNarrationSegment, { kind: "speech" }> => {
      return segment.kind === "speech";
    })
    .reduce((sum, segment) => sum + segment.text.split(/\s+/).filter(Boolean).length, 0);
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
    return trimmed && parsePauseSeconds(block) === null && parseSectionTitle(block) === null;
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

    if (parseSectionTitle(block) !== null) {
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

export type ScriptSegmentRole = "intro" | "middle" | "climax" | "cta" | "pause" | "section";

export interface ScriptSegmentMarker {
  role: ScriptSegmentRole;
  label: string;
  /** Block text as shown in the editor (may include [pause] lines). */
  displayText: string;
  /** 0-based speech paragraph index; omitted for pause-only blocks. */
  speechIndex?: number;
  /** 0-based pause index when role === "pause". */
  pauseIndex?: number;
  /** Parsed title when role === "section". */
  sectionTitle?: string;
}

export function buildScriptSegmentMarkers(script: string): ScriptSegmentMarker[] {
  const blocks = splitScriptIntoDisplayBlocks(script);
  const speechBlockCount = blocks.filter((block) => {
    const trimmed = block.trim();
    return trimmed && parsePauseSeconds(block) === null && parseSectionTitle(block) === null;
  }).length;

  const markers: ScriptSegmentMarker[] = [];
  let speechIndex = 0;
  let pauseIndex = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const pauseSeconds = parsePauseSeconds(block);
    if (pauseSeconds !== null) {
      const idx = pauseIndex;
      pauseIndex += 1;
      markers.push({
        role: "pause",
        label: "Pausa",
        displayText: trimmed,
        pauseIndex: idx,
      });
      continue;
    }

    const sectionTitle = parseSectionTitle(block);
    if (sectionTitle !== null) {
      markers.push({
        role: "section",
        label: "Capítulo",
        displayText: trimmed,
        sectionTitle,
      });
      continue;
    }

    const idx = speechIndex;
    speechIndex += 1;
    const speechMarker = (role: ScriptSegmentRole, label: string): ScriptSegmentMarker => ({
      role,
      label,
      displayText: trimmed,
      speechIndex: idx,
    });

    if (speechBlockCount <= 1) {
      markers.push(speechMarker("intro", "Gancho"));
      continue;
    }
    if (idx === 0) {
      markers.push(speechMarker("intro", "Intro"));
      continue;
    }
    if (idx === speechBlockCount - 1) {
      markers.push(speechMarker("cta", "CTA"));
      continue;
    }
    if (speechBlockCount >= 4 && idx === speechBlockCount - 2) {
      markers.push(speechMarker("climax", "Clímax"));
      continue;
    }
    markers.push(speechMarker("middle", "Meio"));
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
    if (segment.kind === "section") continue;
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
    if (segment.kind === "section") continue;

    if (segment.kind === "pause") {
      pauseIndex += 1;
      blocks.push({
        narrativeText: "",
        visualPrompt: PAUSE_VISUAL_PROMPT,
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

export function paragraphImageSearchForSpeech(
  notes: ScriptDraftNotes,
  speechIndex: number,
  textKey?: string,
): ScriptParagraphImageSearch | undefined {
  const list = notes.paragraphImages ?? [];
  const match = list.find(
    (entry) =>
      entry.pauseIndex === undefined &&
      entry.speechIndex === speechIndex &&
      (!textKey || !entry.textKey || entry.textKey === textKey),
  );
  return match ?? list.find((entry) => entry.pauseIndex === undefined && entry.speechIndex === speechIndex);
}

export function paragraphImageSearchForPause(
  notes: ScriptDraftNotes,
  pauseIndex: number,
  textKey?: string,
): ScriptParagraphImageSearch | undefined {
  const list = notes.paragraphImages ?? [];
  const match = list.find(
    (entry) =>
      entry.pauseIndex === pauseIndex &&
      (!textKey || !entry.textKey || entry.textKey === textKey),
  );
  return match ?? list.find((entry) => entry.pauseIndex === pauseIndex);
}

function paragraphImageSearchIndexKey(entry: ScriptParagraphImageSearch): string {
  return entry.pauseIndex !== undefined ? `pause:${entry.pauseIndex}` : `speech:${entry.speechIndex ?? -1}`;
}

export function upsertParagraphImageSearch(
  notes: ScriptDraftNotes,
  entry: ScriptParagraphImageSearch,
): ScriptDraftNotes {
  const list = [...(notes.paragraphImages ?? [])];
  const key = paragraphImageSearchIndexKey(entry);
  const idx = list.findIndex((item) => paragraphImageSearchIndexKey(item) === key);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  list.sort((a, b) => {
    const aSpeech = a.speechIndex ?? 999;
    const bSpeech = b.speechIndex ?? 999;
    if (aSpeech !== bSpeech) return aSpeech - bSpeech;
    return (a.pauseIndex ?? 999) - (b.pauseIndex ?? 999);
  });
  return { ...notes, paragraphImages: list, updatedAt: new Date().toISOString() };
}

function normalizeKeywordKey(keyword: string): string {
  return keyword.trim().toLowerCase();
}

/** Pick a label that does not collide with existing keyword slots (allows multiple photos). */
export function uniqueKeywordLabel(
  base: string,
  existing: ScriptKeywordImageMatch[],
): string {
  const trimmed = base.trim().slice(0, 60);
  if (!trimmed) return "photo";
  const used = new Set(existing.map((kw) => normalizeKeywordKey(kw.keyword)));
  if (!used.has(normalizeKeywordKey(trimmed))) return trimmed;
  let n = 2;
  while (used.has(normalizeKeywordKey(`${trimmed} (${n})`))) n += 1;
  return `${trimmed} (${n})`;
}

/** Add new keyword slots without removing imported photos or prior searches. */
export function mergeParagraphImageSearch(
  existing: ScriptParagraphImageSearch | undefined,
  incoming: ScriptParagraphImageSearch,
): ScriptParagraphImageSearch {
  if (!existing) return incoming;

  const seen = new Set(existing.keywords.map((kw) => normalizeKeywordKey(kw.keyword)));
  const mergedKeywords = [...existing.keywords];

  for (const kw of incoming.keywords) {
    const key = normalizeKeywordKey(kw.keyword);
    if (seen.has(key)) continue;
    mergedKeywords.push(kw);
    seen.add(key);
  }

  return {
    ...incoming,
    keywords: mergedKeywords,
    searchedAt: incoming.searchedAt,
  };
}

/** Remove one keyword slot from a paragraph's image list. */
export function removeKeywordFromParagraphImageSearch(
  notes: ScriptDraftNotes,
  target: { speechIndex: number } | { pauseIndex: number },
  keyword: string,
): ScriptDraftNotes {
  const list = [...(notes.paragraphImages ?? [])];
  const idx =
    "pauseIndex" in target
      ? list.findIndex((item) => item.pauseIndex === target.pauseIndex)
      : list.findIndex((item) => item.speechIndex === target.speechIndex && item.pauseIndex === undefined);
  if (idx < 0) return notes;

  const entry = list[idx]!;
  const keywords = entry.keywords.filter((kw) => kw.keyword !== keyword);
  if (keywords.length === 0) {
    list.splice(idx, 1);
  } else {
    list[idx] = { ...entry, keywords };
  }

  return {
    ...notes,
    paragraphImages: list.length > 0 ? list : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Drop search-only bubbles; keep photos already imported for the timeline. */
export function keepImportedParagraphImagesOnly(
  notes: ScriptDraftNotes,
  target: { speechIndex: number } | { pauseIndex: number },
): ScriptDraftNotes {
  const list = [...(notes.paragraphImages ?? [])];
  const idx =
    "pauseIndex" in target
      ? list.findIndex((item) => item.pauseIndex === target.pauseIndex)
      : list.findIndex((item) => item.speechIndex === target.speechIndex && item.pauseIndex === undefined);
  if (idx < 0) return notes;

  const entry = list[idx]!;
  const keywords = entry.keywords.filter((kw) => Boolean(kw.importedUrl?.trim()));
  if (keywords.length === 0) {
    list.splice(idx, 1);
  } else {
    list[idx] = { ...entry, keywords };
  }

  return {
    ...notes,
    paragraphImages: list.length > 0 ? list : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Imported reference photos for a speech paragraph — used when applying to timeline. */
export function importedKeyframesForSpeechIndex(
  notes: ScriptDraftNotes,
  speechIndex: number,
): string[] {
  return importedMediaForSpeechIndex(notes, speechIndex)
    .filter((item) => item.mediaKind === "image")
    .map((item) => item.url);
}

export interface ScriptImportedMediaItem {
  url: string;
  mediaKind: ScriptReferenceMediaKind;
  previewUrl?: string;
}

export function importedMediaForSpeechIndex(
  notes: ScriptDraftNotes,
  speechIndex: number,
): ScriptImportedMediaItem[] {
  const search = paragraphImageSearchForSpeech(notes, speechIndex);
  if (!search) return [];
  return search.keywords
    .filter((kw) => Boolean(kw.importedUrl?.trim()))
    .map((kw) => ({
      url: kw.importedUrl!.trim(),
      mediaKind: kw.mediaKind ?? "image",
      previewUrl: kw.importedPreviewUrl?.trim() || undefined,
    }));
}

export function importedMediaForPauseIndex(
  notes: ScriptDraftNotes,
  pauseIndex: number,
): ScriptImportedMediaItem[] {
  const search = paragraphImageSearchForPause(notes, pauseIndex);
  if (!search) return [];
  return search.keywords
    .filter((kw) => Boolean(kw.importedUrl?.trim()))
    .map((kw) => ({
      url: kw.importedUrl!.trim(),
      mediaKind: kw.mediaKind ?? "image",
      previewUrl: kw.importedPreviewUrl?.trim() || undefined,
    }));
}
