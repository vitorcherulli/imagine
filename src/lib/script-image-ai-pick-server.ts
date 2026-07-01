import type { Project } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import {
  imageSearchProviderLabel,
  searchImages,
  type ImageSearchOrientation,
  type ImageSearchResult,
} from "./image-search";
import {
  estimateParagraphReferenceImageCount,
  estimateSpeechParagraphDurationSeconds,
} from "./script-image-count";
import { importScriptKeywordImageMatches } from "./script-image-import-server";
import {
  buildScriptImageKeywordsSystemPrompt,
  buildScriptImageKeywordsUserPrompt,
  buildScriptImageRankSystemPrompt,
  buildScriptImageRankUserPrompt,
} from "./script-prompts";
import type {
  ScriptKeywordImageMatch,
  ScriptParagraphImageSearch,
  ScriptParagraphNarrationClip,
} from "./script-studio";
import { normalizeVideoFormat } from "./video-format";

function fallbackKeywords(paragraphText: string, count: number): string[] {
  const words = paragraphText
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const stop = new Set([
    "that",
    "this",
    "with",
    "from",
    "they",
    "their",
    "there",
    "where",
    "when",
    "which",
    "while",
    "about",
    "into",
    "through",
    "between",
    "across",
    "beneath",
    "above",
    "below",
    "would",
    "could",
    "should",
    "being",
    "have",
    "has",
    "had",
    "were",
    "was",
    "are",
    "is",
    "the",
    "and",
    "for",
    "not",
    "but",
    "you",
    "your",
    "more",
    "than",
    "also",
    "only",
    "just",
    "very",
    "like",
    "some",
    "such",
    "each",
    "other",
    "what",
    "them",
    "then",
    "here",
    "over",
    "under",
    "after",
    "before",
    "para",
    "como",
    "mais",
    "muito",
    "essa",
    "esse",
    "esta",
    "este",
    "aquela",
    "aquele",
    "onde",
    "quando",
    "porque",
    "entre",
    "sobre",
    "desde",
    "ainda",
    "assim",
    "todos",
    "todas",
  ]);
  const picked: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (stop.has(lower)) continue;
    if (/^\d/.test(lower)) continue;
    picked.push(word.slice(0, 40));
    if (picked.length >= count) break;
  }
  if (picked.length === 0) {
    const snippet = paragraphText.trim().slice(0, 48);
    return snippet ? [snippet] : ["landscape"];
  }
  return picked.slice(0, count);
}

function orientationForVideoFormat(videoFormat?: string | null): ImageSearchOrientation {
  return normalizeVideoFormat(videoFormat) === "vertical" ? "portrait" : "landscape";
}

function toKeywordMatch(keyword: string, results: ImageSearchResult[]): ScriptKeywordImageMatch {
  return {
    keyword,
    selectedId: results[0]?.id ?? null,
    results: results.map((r) => ({
      id: r.id,
      previewUrl: r.previewUrl,
      fullUrl: r.fullUrl,
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      provider: r.provider,
      width: r.width,
      height: r.height,
      attribution: r.attribution,
    })),
  };
}

async function searchImagesForKeyword(
  keyword: string,
  orientation: ImageSearchOrientation,
): Promise<ImageSearchResult[]> {
  let results = await searchImages(keyword, 8, orientation);
  if (results.length === 0) {
    const shorter = keyword.split(/\s+/).slice(0, 2).join(" ").trim();
    if (shorter && shorter !== keyword) {
      results = await searchImages(shorter, 8, orientation);
    }
  }
  if (results.length === 0) {
    const first = keyword.split(/\s+/)[0]?.trim();
    if (first && first.length > 3 && first !== keyword) {
      results = await searchImages(first, 8, orientation);
    }
  }
  return results;
}

async function extractKeywords(input: {
  project: Pick<Project, "storyDescription" | "genre" | "visualStyle" | "cutPace">;
  paragraphText: string;
  llmModel: string;
  targetCount: number;
  durationSeconds: number;
}): Promise<string[]> {
  const count = Math.max(1, Math.min(8, input.targetCount));
  if (!input.project.storyDescription?.trim() && input.paragraphText.trim().length < 20) {
    return fallbackKeywords(input.paragraphText, count);
  }

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptImageKeywordsSystemPrompt(count) },
        {
          role: "user",
          content: buildScriptImageKeywordsUserPrompt({
            storyDescription: input.project.storyDescription,
            genre: input.project.genre,
            visualStyle: input.project.visualStyle,
            cutPace: input.project.cutPace,
            paragraphText: input.paragraphText,
            targetCount: count,
            durationSeconds: input.durationSeconds,
          }),
        },
      ],
      model: input.llmModel,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ keywords?: unknown }>(raw);
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 1)
          .map((k) => k.trim().slice(0, 60))
          .slice(0, count)
      : [];
    return keywords.length > 0 ? keywords : fallbackKeywords(input.paragraphText, count);
  } catch {
    return fallbackKeywords(input.paragraphText, count);
  }
}

function fallbackRankSelections(
  slots: ScriptKeywordImageMatch[],
  videoFormat: string | null | undefined,
): ScriptKeywordImageMatch[] {
  const vertical = normalizeVideoFormat(videoFormat) === "vertical";
  const usedIds = new Set<string>();

  return slots.map((slot) => {
    const ranked = [...slot.results].sort((a, b) => {
      const score = (item: (typeof slot.results)[number]) => {
        let s = 0;
        if (item.provider === "google" || item.provider === "serper" || item.provider === "pexels") s += 1;
        if (item.width && item.height) {
          const ratio = item.width / item.height;
          if (vertical && ratio < 1) s += 2;
          if (!vertical && ratio >= 1.2) s += 2;
        }
        return s;
      };
      return score(b) - score(a);
    });

    const pick =
      ranked.find((r) => !usedIds.has(r.id)) ??
      ranked[0];
    if (pick) usedIds.add(pick.id);
    return {
      ...slot,
      selectedId: pick?.id ?? slot.selectedId,
    };
  });
}

async function rankImageSelections(input: {
  project: Pick<
    Project,
    "storyDescription" | "genre" | "visualStyle" | "videoFormat" | "cutPace"
  >;
  paragraphText: string;
  durationSeconds: number;
  targetCount: number;
  slots: ScriptKeywordImageMatch[];
  llmModel: string;
}): Promise<ScriptKeywordImageMatch[]> {
  const withResults = input.slots.filter((s) => s.results.length > 0);
  if (withResults.length === 0) return input.slots;

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptImageRankSystemPrompt() },
        {
          role: "user",
          content: buildScriptImageRankUserPrompt({
            storyDescription: input.project.storyDescription,
            genre: input.project.genre,
            visualStyle: input.project.visualStyle,
            videoFormat: input.project.videoFormat,
            cutPace: input.project.cutPace,
            paragraphText: input.paragraphText,
            durationSeconds: input.durationSeconds,
            targetCount: input.targetCount,
            slots: withResults.map((slot) => ({
              keyword: slot.keyword,
              candidates: slot.results.map((r) => ({
                id: r.id,
                title: r.sourceTitle ?? slot.keyword,
                provider: r.provider,
                width: r.width,
                height: r.height,
              })),
            })),
          }),
        },
      ],
      model: input.llmModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ selections?: unknown }>(raw);
    const selections = Array.isArray(parsed.selections)
      ? parsed.selections.filter(
          (item): item is { keyword: string; imageId: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { keyword?: unknown }).keyword === "string" &&
            typeof (item as { imageId?: unknown }).imageId === "string",
        )
      : [];

    const byKeyword = new Map(
      selections.map((s) => [s.keyword.trim().toLowerCase(), s.imageId.trim()]),
    );
    const usedIds = new Set<string>();

    return input.slots.map((slot) => {
      const pickedId = byKeyword.get(slot.keyword.trim().toLowerCase());
      const candidate =
        (pickedId
          ? slot.results.find((r) => r.id === pickedId && !usedIds.has(r.id))
          : undefined) ??
        slot.results.find((r) => !usedIds.has(r.id)) ??
        slot.results[0];
      if (candidate) usedIds.add(candidate.id);
      return {
        ...slot,
        selectedId: candidate?.id ?? slot.selectedId,
      };
    });
  } catch {
    return fallbackRankSelections(input.slots, input.project.videoFormat);
  }
}

export interface ScriptParagraphAiPickResult {
  entry: ScriptParagraphImageSearch;
  targetCount: number;
  durationSeconds: number;
  keywordsAdded: number;
  importedCount: number;
  importErrors: string[];
  source: "llm" | "fallback";
}

export async function runScriptParagraphAiImagePick(input: {
  project: Pick<
    Project,
    | "storyDescription"
    | "genre"
    | "visualStyle"
    | "videoFormat"
    | "cutPace"
  >;
  projectId: string;
  userId: string;
  paragraphText: string;
  speechIndex: number;
  textKey: string;
  llmModel: string;
  narrationClip?: ScriptParagraphNarrationClip | null;
  existingEntry?: ScriptParagraphImageSearch;
  importImages?: boolean;
}): Promise<ScriptParagraphAiPickResult> {
  const durationSeconds = estimateSpeechParagraphDurationSeconds(
    input.paragraphText,
    input.narrationClip,
  );
  const targetCount = estimateParagraphReferenceImageCount(
    durationSeconds,
    input.project.cutPace,
  );
  const orientation = orientationForVideoFormat(input.project.videoFormat);

  const existingKeywords = input.existingEntry?.keywords ?? [];
  const importedKeywords = existingKeywords.filter((kw) => Boolean(kw.importedUrl?.trim()));
  const needCount = Math.max(0, targetCount - importedKeywords.length);

  if (needCount === 0) {
    const entry: ScriptParagraphImageSearch = input.existingEntry ?? {
      speechIndex: input.speechIndex,
      textKey: input.textKey,
      searchedAt: new Date().toISOString(),
      provider: imageSearchProviderLabel(),
      keywords: importedKeywords,
    };
    return {
      entry,
      targetCount,
      durationSeconds,
      keywordsAdded: 0,
      importedCount: importedKeywords.length,
      importErrors: [],
      source: "fallback",
    };
  }

  const searchKeywords = await extractKeywords({
    project: input.project,
    paragraphText: input.paragraphText,
    llmModel: input.llmModel,
    targetCount: needCount,
    durationSeconds,
  });

  const keywordMatches: ScriptKeywordImageMatch[] = [];
  for (const keyword of searchKeywords) {
    const results = await searchImagesForKeyword(keyword, orientation);
    if (results.length > 0) {
      keywordMatches.push(toKeywordMatch(keyword, results));
    }
  }

  const ranked = await rankImageSelections({
    project: input.project,
    paragraphText: input.paragraphText,
    durationSeconds,
    targetCount,
    slots: keywordMatches,
    llmModel: input.llmModel,
  });

  let keywords = [...importedKeywords, ...ranked];
  let importedCount = importedKeywords.length;
  const importErrors: string[] = [];

  if (input.importImages !== false) {
    const imported = await importScriptKeywordImageMatches(
      input.projectId,
      input.speechIndex,
      keywords,
      {
        videoFormat: input.project.videoFormat,
        userId: input.userId,
      },
    );
    keywords = imported.keywords;
    importErrors.push(...imported.importErrors);
    importedCount = keywords.filter((kw) => Boolean(kw.importedUrl?.trim())).length;
  }

  const entry: ScriptParagraphImageSearch = {
    speechIndex: input.speechIndex,
    textKey: input.textKey,
    searchedAt: new Date().toISOString(),
    provider: imageSearchProviderLabel(),
    keywords,
  };

  return {
    entry,
    targetCount,
    durationSeconds,
    keywordsAdded: ranked.length,
    importedCount,
    importErrors,
    source: "llm",
  };
}
