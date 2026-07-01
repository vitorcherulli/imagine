import type { ProjectScriptLanguage } from "./project-language";
import {
  searchSerperFreshNews,
  searchSerperRecentWeb,
  type WebSearchLocale,
  type WebSearchSnippet,
} from "./web-search";

export interface TrendSearchContext {
  todayIso: string;
  year: number;
  monthLabel: string;
  monthYearLabel: string;
  freshnessWindow: "24h";
}

export function trendSearchContext(now = new Date()): TrendSearchContext {
  const year = now.getUTCFullYear();
  const monthLabel = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return {
    todayIso: now.toISOString().slice(0, 10),
    year,
    monthLabel,
    monthYearLabel: `${monthLabel} ${year}`,
    freshnessWindow: "24h",
  };
}

function genreToken(genre: string): string {
  return genre.trim() || "video";
}

export function buildFallbackTrendQueries(
  genre: string,
  language: ProjectScriptLanguage,
  ctx: TrendSearchContext = trendSearchContext(),
): string[] {
  const g = genreToken(genre);
  const { monthYearLabel, year } = ctx;
  if (language === "pt") {
    return [
      `${g} notícias hoje ${monthYearLabel}`,
      `assuntos em alta ${g} Brasil hoje`,
      `site:youtube.com ${g} viral ${year}`,
    ];
  }
  if (language === "es") {
    return [
      `${g} noticias hoy ${monthYearLabel}`,
      `temas virales ${g} hoy`,
      `site:youtube.com ${g} viral ${year}`,
    ];
  }
  return [
    `${g} breaking news today ${monthYearLabel}`,
    `trending ${g} news last 24 hours`,
    `site:youtube.com ${g} viral ${year}`,
  ];
}

/** Drop last-year roundups and undated stale headlines when we want "right now". */
export function isLikelyStaleTrendSnippet(
  snippet: WebSearchSnippet,
  ctx: TrendSearchContext = trendSearchContext(),
): boolean {
  const blob = `${snippet.title} ${snippet.content} ${snippet.publishedLabel ?? ""}`.toLowerCase();
  const freshSignals = [
    /\b(\d+\s*(hour|minute|min|hr)s?\s+ago)\b/,
    /\b(today|yesterday|just now|hours ago)\b/,
    /\b(1|2|3)\s+days?\s+ago\b/,
    new RegExp(`\\b${ctx.year}\\b`),
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/,
  ];
  if (freshSignals.some((re) => re.test(blob))) return false;

  const prevYear = ctx.year - 1;
  if (new RegExp(`\\b${prevYear}\\b`).test(snippet.title)) return true;
  if (/\b(best of|roundup|year in review|annual trends|predictions for)\b/i.test(snippet.title)) {
    return true;
  }
  return false;
}

function dedupeSnippets(snippets: WebSearchSnippet[]): WebSearchSnippet[] {
  const seen = new Set<string>();
  const out: WebSearchSnippet[] = [];
  for (const s of snippets) {
    const key = s.url || s.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function preferFreshSnippets(
  snippets: WebSearchSnippet[],
  ctx: TrendSearchContext,
  limit: number,
): WebSearchSnippet[] {
  const fresh: WebSearchSnippet[] = [];
  const rest: WebSearchSnippet[] = [];
  for (const s of snippets) {
    if (isLikelyStaleTrendSnippet(s, ctx)) rest.push(s);
    else fresh.push(s);
  }
  return dedupeSnippets([...fresh, ...rest]).slice(0, limit);
}

/**
 * Pull breaking + same-day signals: news (hour/day) + recent web, per query.
 */
export async function fetchFreshTrendSnippets(input: {
  queries: string[];
  locale: WebSearchLocale;
  ctx?: TrendSearchContext;
  perQueryLimit?: number;
}): Promise<WebSearchSnippet[]> {
  const ctx = input.ctx ?? trendSearchContext();
  const perQuery = input.perQueryLimit ?? 5;
  const batches = await Promise.all(
    input.queries.map(async (query) => {
      const [newsHour, newsDay, web] = await Promise.all([
        searchSerperFreshNews(query, perQuery, input.locale, "qdr:h").catch(() => []),
        searchSerperFreshNews(query, perQuery, input.locale, "qdr:d").catch(() => []),
        searchSerperRecentWeb(query, perQuery, input.locale).catch(() => []),
      ]);
      return dedupeSnippets([...newsHour, ...newsDay, ...web]);
    }),
  );

  return preferFreshSnippets(dedupeSnippets(batches.flat()), ctx, 24);
}

export function groupSnippetsByQuery(
  queries: string[],
  snippets: WebSearchSnippet[],
  ctx: TrendSearchContext = trendSearchContext(),
): Array<{ query: string; snippets: WebSearchSnippet[] }> {
  const used = new Set<string>();
  const groups: Array<{ query: string; snippets: WebSearchSnippet[] }> = [];

  for (const query of queries) {
    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3 && !t.startsWith("site:"));
    const matched = snippets.filter((s) => {
      if (used.has(s.url || s.title)) return false;
      const blob = `${s.title} ${s.content}`.toLowerCase();
      return qTokens.some((t) => blob.includes(t));
    });
    for (const s of matched) used.add(s.url || s.title);
    if (matched.length > 0) {
      groups.push({
        query,
        snippets: preferFreshSnippets(matched, ctx, 6),
      });
    }
  }

  const leftovers = snippets.filter((s) => !used.has(s.url || s.title));
  if (leftovers.length > 0) {
    groups.push({
      query: `Breaking · ${ctx.monthYearLabel}`,
      snippets: preferFreshSnippets(leftovers, ctx, 8),
    });
  }

  return groups;
}
