import type { Project } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import {
  buildScriptVideoSearchSystemPrompt,
  buildScriptVideoSearchUserPrompt,
} from "./script-prompts";
import {
  DEFAULT_VIDEO_SEARCH_LIMIT,
  orientationForVideoFormat,
  searchVideosWithFallback,
  videoSearchProviderLabel,
  type VideoSearchResult,
} from "./video-search";
import type { ScriptKeywordImageMatch } from "./script-studio";
import { uniqueKeywordLabel } from "./script-studio";
import { sanitizeStockSearchQuery } from "./stock-search-query";

function toVideoKeywordMatch(
  keyword: string,
  results: VideoSearchResult[],
  selectedId?: string | null,
): ScriptKeywordImageMatch {
  return {
    keyword,
    mediaKind: "video",
    selectedId: selectedId ?? results[0]?.id ?? null,
    results: results.map((r) => ({
      id: r.id,
      previewUrl: r.previewUrl,
      fullUrl: r.downloadUrl,
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      provider: r.provider,
      width: r.width,
      height: r.height,
      attribution: r.attribution,
    })),
  };
}

function fallbackVideoQuery(paragraphText: string): string {
  const terms = paragraphText
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ")
    .trim();
  return sanitizeStockSearchQuery(
    terms || paragraphText.trim().slice(0, 60) || "documentary nature b-roll",
  );
}

async function extractVideoSearchQuery(input: {
  project: Pick<Project, "storyDescription" | "genre" | "visualStyle" | "videoFormat" | "cutPace">;
  paragraphText: string;
  llmModel: string;
}): Promise<{ query: string; keywords: string[] }> {
  const fallback = fallbackVideoQuery(input.paragraphText);
  const genreHint = sanitizeStockSearchQuery(input.project.genre ?? "");
  const keywordsFromFallback = [
    fallback,
    genreHint && genreHint !== fallback ? genreHint : null,
  ].filter((k): k is string => Boolean(k));

  if (!input.project.storyDescription?.trim() && input.paragraphText.trim().length < 20) {
    return { query: fallback, keywords: keywordsFromFallback };
  }

  try {
    const llmPromise = chatCompletion({
      messages: [
        { role: "system", content: buildScriptVideoSearchSystemPrompt() },
        {
          role: "user",
          content: buildScriptVideoSearchUserPrompt({
            storyDescription: input.project.storyDescription,
            genre: input.project.genre,
            visualStyle: input.project.visualStyle,
            videoFormat: input.project.videoFormat,
            cutPace: input.project.cutPace,
            paragraphText: input.paragraphText,
          }),
        },
      ],
      model: input.llmModel,
      temperature: 0.25,
      response_format: { type: "json_object" },
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("LLM timeout")), 8000);
    });
    const raw = await Promise.race([llmPromise, timeoutPromise]);
    const parsed = extractJson<{ query?: unknown; keywords?: unknown }>(raw);
    const query =
      typeof parsed.query === "string" && parsed.query.trim().length > 2
        ? sanitizeStockSearchQuery(parsed.query)
        : "";
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 1)
          .map((k) => sanitizeStockSearchQuery(k))
          .filter((k) => k.length > 2)
          .slice(0, 4)
      : [];
    if (!query) {
      return { query: fallback, keywords: keywords.length > 0 ? keywords : keywordsFromFallback };
    }
    return {
      query,
      keywords: [
        query,
        ...keywords.filter((k) => k.toLowerCase() !== query.toLowerCase()),
        ...keywordsFromFallback,
      ]
        .filter((k, i, arr) => arr.indexOf(k) === i)
        .slice(0, 4),
    };
  } catch {
    return { query: fallback, keywords: keywordsFromFallback };
  }
}

async function searchVideosForKeyword(
  keyword: string,
  videoFormat?: string | null,
): Promise<VideoSearchResult[]> {
  const orientation = orientationForVideoFormat(videoFormat);
  return searchVideosWithFallback(keyword, DEFAULT_VIDEO_SEARCH_LIMIT, orientation);
}

export async function runScriptCustomKeywordVideoSearch(input: {
  keyword: string;
  speechIndex: number;
  textKey: string;
  existingKeywords?: ScriptKeywordImageMatch[];
  videoFormat?: string | null;
}): Promise<ScriptKeywordImageMatch | null> {
  const raw = input.keyword.trim().slice(0, 120);
  if (!raw) return null;
  const label = uniqueKeywordLabel(`video · ${raw}`, input.existingKeywords ?? []);
  const results = await searchVideosForKeyword(
    sanitizeStockSearchQuery(raw) || raw,
    input.videoFormat,
  );
  if (results.length === 0) return null;
  return toVideoKeywordMatch(label, results);
}

/** Contextual stock video for this narration paragraph (fast Pexels search + optional LLM refine). */
export async function runScriptParagraphVideoSearch(input: {
  project: Pick<
    Project,
    "storyDescription" | "genre" | "visualStyle" | "videoFormat" | "cutPace"
  >;
  paragraphText: string;
  speechIndex: number;
  textKey: string;
  existingKeywords?: ScriptKeywordImageMatch[];
  llmModel: string;
}): Promise<{ keyword: string; match: ScriptKeywordImageMatch; searchQuery: string } | null> {
  const fallback = fallbackVideoQuery(input.paragraphText);
  const genreHint = sanitizeStockSearchQuery(input.project.genre ?? "");
  const quickKeywords = [fallback, genreHint].filter(
    (k, index, arr) => Boolean(k) && arr.indexOf(k) === index,
  );

  let results: VideoSearchResult[] = [];
  let usedQuery = fallback;
  for (const candidate of quickKeywords) {
    results = await searchVideosForKeyword(candidate, input.project.videoFormat);
    if (results.length > 0) {
      usedQuery = candidate;
      break;
    }
  }

  if (results.length === 0) {
    const { query, keywords } = await extractVideoSearchQuery({
      project: input.project,
      paragraphText: input.paragraphText,
      llmModel: input.llmModel,
    });
    for (const candidate of keywords) {
      results = await searchVideosForKeyword(candidate, input.project.videoFormat);
      if (results.length > 0) {
        usedQuery = candidate;
        break;
      }
    }
    if (results.length === 0 && query) {
      results = await searchVideosForKeyword(query, input.project.videoFormat);
      usedQuery = query;
    }
  }

  if (results.length === 0) return null;

  const selectedId = results[0]!.id;

  const label = uniqueKeywordLabel(
    `video · ${usedQuery.slice(0, 48)}`,
    input.existingKeywords ?? [],
  );
  return {
    keyword: label,
    searchQuery: usedQuery,
    match: toVideoKeywordMatch(label, results, selectedId),
  };
}

export function scriptVideoSearchProviderLabel(): string {
  return videoSearchProviderLabel();
}
