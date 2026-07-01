import { chatCompletion, extractJson } from "./openrouter/llm";
import { normalizeProjectScriptLanguage, type ProjectScriptLanguage } from "./project-language";
import {
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
  buildTopPicksSystemPrompt,
  buildTopPicksUserPrompt,
  buildTrendQuerySystemPrompt,
  buildTrendQueryUserPrompt,
  buildTrendSynthesisSystemPrompt,
  buildTrendSynthesisUserPrompt,
} from "./story-prompts";
import {
  buildSocialSuggestionSystemPrompt,
  buildSocialSuggestionUserPrompt,
} from "./social-prompts";
import {
  searchWeb,
  serperWebSearchConfigured,
  webSearchConfigured,
  webSearchLocaleForLanguage,
  webSearchProviderLabel,
  type WebSearchSnippet,
} from "./web-search";
import {
  buildFallbackTrendQueries,
  fetchFreshTrendSnippets,
  groupSnippetsByQuery,
  trendSearchContext,
} from "./trend-search";

export interface StoryIdea {
  title: string;
  summary: string;
}

export interface TrendStoryIdea extends StoryIdea {
  trendTopic?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType?: "news" | "search" | "youtube";
}

export interface TrendSuggestionsMeta {
  provider: string;
  queries: string[];
  fetchedAt: string;
  configured: boolean;
  freshnessWindow?: string;
  asOf?: string;
  error?: string;
}

export interface SuggestProjectInput {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  targetDurationSeconds?: number;
  videoFormat?: string;
  projectIdentity?: string;
  scriptLanguage?: ProjectScriptLanguage;
  contentType?: "video" | "social";
  postFormat?: string;
  postKind?: string;
  slideCount?: number;
  socialAspectRatio?: string;
}

export type StoryIdeaSource = "ai" | "trend";

export interface StoryIdeaCandidate {
  id: string;
  source: StoryIdeaSource;
  title: string;
  summary: string;
  trendTopic?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType?: "news" | "search" | "youtube";
}

export interface TopStoryPick {
  rank: 1 | 2 | 3;
  candidateId: string;
  source: StoryIdeaSource;
  title: string;
  summary: string;
  rationale: string;
  trendTopic?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType?: "news" | "search" | "youtube";
}

const IDEA_COUNT = 5;
const TOP_PICK_COUNT = 3;

function normalizeStoryIdeas(raw: unknown): StoryIdea[] {
  if (!Array.isArray(raw)) return [];
  const out: StoryIdea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { title?: unknown; summary?: unknown };
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const summary = typeof o.summary === "string" ? o.summary.trim() : "";
    if (!title || !summary) continue;
    out.push({ title: title.slice(0, 120), summary: summary.slice(0, 600) });
    if (out.length >= IDEA_COUNT) break;
  }
  return out;
}

function normalizeTrendStoryIdeas(raw: unknown): TrendStoryIdea[] {
  if (!Array.isArray(raw)) return [];
  const out: TrendStoryIdea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as {
      title?: unknown;
      summary?: unknown;
      trend_topic?: unknown;
      trendTopic?: unknown;
      source_url?: unknown;
      sourceUrl?: unknown;
      source_title?: unknown;
      sourceTitle?: unknown;
      source_type?: unknown;
      sourceType?: unknown;
    };
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const summary = typeof o.summary === "string" ? o.summary.trim() : "";
    if (!title || !summary) continue;
    const trendTopic =
      (typeof o.trend_topic === "string" ? o.trend_topic : typeof o.trendTopic === "string" ? o.trendTopic : "")
        .trim()
        .slice(0, 80) || undefined;
    const sourceUrl =
      (typeof o.source_url === "string" ? o.source_url : typeof o.sourceUrl === "string" ? o.sourceUrl : "")
        .trim()
        .slice(0, 500) || undefined;
    const sourceTitle =
      (typeof o.source_title === "string"
        ? o.source_title
        : typeof o.sourceTitle === "string"
          ? o.sourceTitle
          : ""
      )
        .trim()
        .slice(0, 200) || undefined;
    const rawType =
      typeof o.source_type === "string"
        ? o.source_type
        : typeof o.sourceType === "string"
          ? o.sourceType
          : "";
    const sourceType =
      rawType === "news" || rawType === "search" || rawType === "youtube" ? rawType : undefined;
    out.push({
      title: title.slice(0, 120),
      summary: summary.slice(0, 600),
      trendTopic,
      sourceUrl,
      sourceTitle,
      sourceType,
    });
    if (out.length >= IDEA_COUNT) break;
  }
  return out;
}

export function buildStoryCandidates(
  aiIdeas: StoryIdea[],
  trendIdeas: TrendStoryIdea[],
): StoryIdeaCandidate[] {
  return [
    ...aiIdeas.map((idea, i) => ({
      id: `ai-${i}`,
      source: "ai" as const,
      title: idea.title,
      summary: idea.summary,
    })),
    ...trendIdeas.map((idea, i) => ({
      id: `trend-${i}`,
      source: "trend" as const,
      title: idea.title,
      summary: idea.summary,
      trendTopic: idea.trendTopic,
      sourceUrl: idea.sourceUrl,
      sourceTitle: idea.sourceTitle,
      sourceType: idea.sourceType,
    })),
  ];
}

function fallbackTopPicks(candidates: StoryIdeaCandidate[]): TopStoryPick[] {
  const ordered = [...candidates];
  // Prefer one trend early, then AI, for diversity when possible.
  ordered.sort((a, b) => {
    const score = (c: StoryIdeaCandidate) => (c.source === "trend" ? 0 : 1);
    return score(a) - score(b);
  });
  return ordered.slice(0, TOP_PICK_COUNT).map((c, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    candidateId: c.id,
    source: c.source,
    title: c.title,
    summary: c.summary,
    rationale:
      i === 0
        ? "Strong fit for your genre and format — best starting point."
        : "Solid alternative worth exploring.",
    trendTopic: c.trendTopic,
    sourceUrl: c.sourceUrl,
    sourceTitle: c.sourceTitle,
    sourceType: c.sourceType,
  }));
}

function resolveTopPicks(
  raw: unknown,
  candidates: StoryIdeaCandidate[],
): TopStoryPick[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const picksRaw = (raw as { picks?: unknown })?.picks;
  if (!Array.isArray(picksRaw)) return fallbackTopPicks(candidates);

  const used = new Set<string>();
  const out: TopStoryPick[] = [];

  for (const item of picksRaw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { rank?: unknown; candidate_id?: unknown; candidateId?: unknown; rationale?: unknown };
    const rankNum = typeof o.rank === "number" ? o.rank : Number(o.rank);
    if (rankNum !== 1 && rankNum !== 2 && rankNum !== 3) continue;
    const candidateId =
      (typeof o.candidate_id === "string" ? o.candidate_id : typeof o.candidateId === "string" ? o.candidateId : "")
        .trim();
    if (!candidateId || used.has(candidateId)) continue;
    const hit = byId.get(candidateId);
    if (!hit) continue;
    const rationale =
      (typeof o.rationale === "string" ? o.rationale : "").trim().slice(0, 320) ||
      "Strong match for your project settings.";
    used.add(candidateId);
    out.push({
      rank: rankNum as 1 | 2 | 3,
      candidateId,
      source: hit.source,
      title: hit.title,
      summary: hit.summary,
      rationale,
      trendTopic: hit.trendTopic,
      sourceUrl: hit.sourceUrl,
      sourceTitle: hit.sourceTitle,
      sourceType: hit.sourceType,
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  if (out.length >= TOP_PICK_COUNT) return out.slice(0, TOP_PICK_COUNT);

  for (const c of candidates) {
    if (out.length >= TOP_PICK_COUNT) break;
    if (used.has(c.id)) continue;
    used.add(c.id);
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      candidateId: c.id,
      source: c.source,
      title: c.title,
      summary: c.summary,
      rationale: "Added to complete the top 3 lineup.",
      trendTopic: c.trendTopic,
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      sourceType: c.sourceType,
    });
  }

  return out.slice(0, TOP_PICK_COUNT);
}

export async function rankTopStoryPicks(
  input: SuggestProjectInput,
  aiIdeas: StoryIdea[],
  trendIdeas: TrendStoryIdea[],
): Promise<TopStoryPick[]> {
  const candidates = buildStoryCandidates(aiIdeas, trendIdeas);
  if (candidates.length === 0) return [];
  if (candidates.length <= TOP_PICK_COUNT) return fallbackTopPicks(candidates);

  const scriptLanguage = normalizeProjectScriptLanguage(input.scriptLanguage);
  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildTopPicksSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildTopPicksUserPrompt({
            genre: input.genre,
            visualStyle: input.visualStyle,
            voiceTone: input.voiceTone,
            targetDurationSeconds: input.targetDurationSeconds ?? 30,
            videoFormat: input.videoFormat,
            projectIdentity: input.projectIdentity,
            scriptLanguage,
            candidates: candidates.map((c) => ({
              id: c.id,
              source: c.source,
              title: c.title,
              summary: c.summary,
              ...(c.trendTopic ? { trend_topic: c.trendTopic } : {}),
            })),
          }),
        },
      ],
      temperature: 0.25,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ picks?: unknown }>(raw);
    return resolveTopPicks(parsed, candidates);
  } catch {
    return fallbackTopPicks(candidates);
  }
}

async function planTrendQueries(
  input: SuggestProjectInput,
  ctx: ReturnType<typeof trendSearchContext>,
): Promise<string[]> {
  const scriptLanguage = normalizeProjectScriptLanguage(input.scriptLanguage);
  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildTrendQuerySystemPrompt() },
        {
          role: "user",
          content: buildTrendQueryUserPrompt({
            genre: input.genre,
            visualStyle: input.visualStyle,
            voiceTone: input.voiceTone,
            videoFormat: input.videoFormat,
            projectIdentity: input.projectIdentity,
            scriptLanguage,
            todayIso: ctx.todayIso,
            monthYearLabel: ctx.monthYearLabel,
          }),
        },
      ],
      temperature: 0.35,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ queries?: unknown }>(raw);
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((q): q is string => typeof q === "string" && q.trim().length > 2)
          .map((q) => q.trim().slice(0, 120))
          .slice(0, 3)
      : [];
    if (queries.length > 0) {
      const lead = buildFallbackTrendQueries(input.genre, scriptLanguage, ctx)[0]!;
      return [...new Set([lead, ...queries])].slice(0, 4);
    }
  } catch {
    // fall through to deterministic queries
  }
  return buildFallbackTrendQueries(input.genre, scriptLanguage, ctx);
}

async function fetchTrendSearchResults(
  queries: string[],
  language: ProjectScriptLanguage,
): Promise<Array<{ query: string; snippets: WebSearchSnippet[] }>> {
  const locale = webSearchLocaleForLanguage(language);
  const ctx = trendSearchContext();
  const useSerper = serperWebSearchConfigured();

  if (useSerper) {
    const allSnippets = await fetchFreshTrendSnippets({ queries, locale, ctx });
    const grouped = groupSnippetsByQuery(queries, allSnippets, ctx);
    if (grouped.length > 0) return grouped;
  }

  const out: Array<{ query: string; snippets: WebSearchSnippet[] }> = [];
  for (const query of queries) {
    const snippets = await searchWeb(query, 4, locale).catch(() => [] as WebSearchSnippet[]);
    if (snippets.length > 0) {
      out.push({ query, snippets: snippets.slice(0, 6) });
    }
  }
  return out;
}

export async function generateAiStoryIdeas(input: SuggestProjectInput): Promise<StoryIdea[]> {
  const scriptLanguage = normalizeProjectScriptLanguage(input.scriptLanguage);
  const isSocial = input.contentType === "social";

  const raw = await chatCompletion({
    messages: [
      {
        role: "system",
        content: isSocial
          ? buildSocialSuggestionSystemPrompt(scriptLanguage)
          : buildSuggestionSystemPrompt(scriptLanguage),
      },
      {
        role: "user",
        content: isSocial
          ? buildSocialSuggestionUserPrompt({
              genre: input.genre,
              visualStyle: input.visualStyle,
              voiceTone: input.voiceTone,
              postFormat: input.postFormat,
              postKind: input.postKind,
              slideCount: input.slideCount,
              socialAspectRatio: input.socialAspectRatio,
              projectIdentity: input.projectIdentity,
              scriptLanguage,
            })
          : buildSuggestionUserPrompt({
              ...input,
              targetDurationSeconds: input.targetDurationSeconds ?? 30,
              scriptLanguage,
            }),
      },
    ],
    temperature: 0.95,
    response_format: { type: "json_object" },
  });
  const json = extractJson<{ ideas?: unknown }>(raw);
  return normalizeStoryIdeas(json.ideas);
}

export async function runTrendStoryIdeas(input: SuggestProjectInput): Promise<{
  trends: TrendStoryIdea[];
  meta: TrendSuggestionsMeta;
}> {
  const scriptLanguage = normalizeProjectScriptLanguage(input.scriptLanguage);
  const fetchedAt = new Date().toISOString();
  const ctx = trendSearchContext();
  const provider = webSearchProviderLabel();
  const configured = webSearchConfigured();

  if (!configured) {
    return {
      trends: [],
      meta: {
        provider,
        queries: [],
        fetchedAt,
        configured: false,
        error:
          "Web search not configured. Add SERPER_API_KEY (recommended) or TAVILY_API_KEY to .env.local.",
      },
    };
  }

  try {
    const queries = await planTrendQueries(input, ctx);
    const searchResults = await fetchTrendSearchResults(queries, scriptLanguage);

    if (searchResults.length === 0) {
      return {
        trends: [],
        meta: {
          provider,
          queries,
          fetchedAt,
          configured: true,
          freshnessWindow: ctx.freshnessWindow,
          asOf: ctx.todayIso,
          error: "No fresh trend results found. Try another genre or language.",
        },
      };
    }

    const synthRaw = await chatCompletion({
      messages: [
        { role: "system", content: buildTrendSynthesisSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildTrendSynthesisUserPrompt({
            genre: input.genre,
            visualStyle: input.visualStyle,
            voiceTone: input.voiceTone,
            targetDurationSeconds: input.targetDurationSeconds ?? 30,
            videoFormat: input.videoFormat,
            projectIdentity: input.projectIdentity,
            scriptLanguage,
            todayIso: ctx.todayIso,
            monthYearLabel: ctx.monthYearLabel,
            freshnessWindow: ctx.freshnessWindow,
            searchResults: searchResults.map((group) => ({
              query: group.query,
              snippets: group.snippets.map((s) => ({
                title: s.title,
                url: s.url,
                content: s.content,
                sourceType: s.sourceType,
                publishedLabel: s.publishedLabel,
              })),
            })),
          }),
        },
      ],
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    const synth = extractJson<{ trends?: unknown }>(synthRaw);
    const trends = normalizeTrendStoryIdeas(synth.trends);

    return {
      trends,
      meta: {
        provider,
        queries,
        fetchedAt,
        configured: true,
        freshnessWindow: ctx.freshnessWindow,
        asOf: ctx.todayIso,
        ...(trends.length === 0
          ? { error: "Could not turn fresh search results into video pitches. Try again." }
          : {}),
      },
    };
  } catch (err) {
    return {
      trends: [],
      meta: {
        provider,
        queries: [],
        fetchedAt,
        configured: true,
        freshnessWindow: ctx.freshnessWindow,
        asOf: ctx.todayIso,
        error: err instanceof Error ? err.message : "Trend search failed",
      },
    };
  }
}
