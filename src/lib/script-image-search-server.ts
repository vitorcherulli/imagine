import type { Project } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { imageSearchProviderLabel, searchImages, type ImageSearchResult } from "./image-search";
import {
  buildScriptImageKeywordsSystemPrompt,
  buildScriptImageKeywordsUserPrompt,
} from "./script-prompts";
import type { ScriptKeywordImageMatch, ScriptParagraphImageSearch } from "./script-studio";
import { uniqueKeywordLabel } from "./script-studio";

function fallbackKeywords(paragraphText: string): string[] {
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
    if (picked.length >= 5) break;
  }
  if (picked.length === 0) {
    const snippet = paragraphText.trim().slice(0, 48);
    return snippet ? [snippet] : ["landscape"];
  }
  return picked.slice(0, 5);
}

async function extractKeywords(input: {
  project: Pick<Project, "storyDescription" | "genre">;
  paragraphText: string;
  llmModel: string;
}): Promise<string[]> {
  if (!input.project.storyDescription?.trim() && input.paragraphText.trim().length < 20) {
    return fallbackKeywords(input.paragraphText);
  }

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptImageKeywordsSystemPrompt() },
        {
          role: "user",
          content: buildScriptImageKeywordsUserPrompt({
            storyDescription: input.project.storyDescription,
            genre: input.project.genre,
            paragraphText: input.paragraphText,
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
          .slice(0, 5)
      : [];
    return keywords.length > 0 ? keywords : fallbackKeywords(input.paragraphText);
  } catch {
    return fallbackKeywords(input.paragraphText);
  }
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

async function searchImagesForKeyword(keyword: string): Promise<ImageSearchResult[]> {
  let results = await searchImages(keyword, 6);
  if (results.length === 0) {
    const shorter = keyword.split(/\s+/).slice(0, 2).join(" ").trim();
    if (shorter && shorter !== keyword) {
      results = await searchImages(shorter, 6);
    }
  }
  if (results.length === 0) {
    const first = keyword.split(/\s+/)[0]?.trim();
    if (first && first.length > 3 && first !== keyword) {
      results = await searchImages(first, 6);
    }
  }
  return results;
}

/** Search the web for one explicit keyword/phrase (user-directed). */
export async function runScriptCustomKeywordImageSearch(input: {
  keyword: string;
  speechIndex?: number;
  pauseIndex?: number;
  textKey: string;
  existingKeywords?: ScriptKeywordImageMatch[];
}): Promise<ScriptKeywordImageMatch | null> {
  const raw = input.keyword.trim().slice(0, 120);
  if (!raw) return null;
  const label = uniqueKeywordLabel(raw, input.existingKeywords ?? []);
  const results = await searchImagesForKeyword(raw);
  if (results.length === 0) return null;
  return toKeywordMatch(label, results);
}

export async function runScriptParagraphImageSearch(input: {
  project: Pick<Project, "storyDescription" | "genre">;
  paragraphText: string;
  speechIndex?: number;
  pauseIndex?: number;
  textKey: string;
  llmModel: string;
}): Promise<ScriptParagraphImageSearch> {
  const keywords = await extractKeywords({
    project: input.project,
    paragraphText: input.paragraphText,
    llmModel: input.llmModel,
  });

  const keywordMatches: ScriptKeywordImageMatch[] = [];
  for (const keyword of keywords) {
    const results = await searchImagesForKeyword(keyword);
    if (results.length > 0) {
      keywordMatches.push(toKeywordMatch(keyword, results));
    }
  }

  return {
    ...(input.pauseIndex !== undefined
      ? { pauseIndex: input.pauseIndex }
      : { speechIndex: input.speechIndex ?? 0 }),
    textKey: input.textKey,
    searchedAt: new Date().toISOString(),
    provider: imageSearchProviderLabel(),
    keywords: keywordMatches,
  };
}

export function countParagraphImagesImported(search: ScriptParagraphImageSearch | undefined): {
  imported: number;
  total: number;
} {
  if (!search) return { imported: 0, total: 0 };
  const total = search.keywords.length;
  const imported = search.keywords.filter((k) => Boolean(k.importedUrl)).length;
  return { imported, total };
}
