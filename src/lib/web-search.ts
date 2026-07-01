import type { ProjectScriptLanguage } from "./project-language";

export interface WebSearchSnippet {
  title: string;
  url: string;
  content: string;
  sourceType?: "news" | "search" | "youtube";
  /** Raw date line from Serper (e.g. "2 hours ago", "Jun 27, 2026"). */
  publishedLabel?: string;
}

export type SerperRecency = "qdr:h" | "qdr:d" | "qdr:w";

export interface SerperSearchOptions {
  tbs?: SerperRecency;
  /** YYYY-MM-DD — only results after this date (Serper `after`). */
  after?: string;
}

export interface WebSearchLocale {
  gl: string;
  hl: string;
}

function serperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY?.trim());
}

function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export function webSearchLocaleForLanguage(lang: ProjectScriptLanguage): WebSearchLocale {
  switch (lang) {
    case "pt":
      return { gl: "br", hl: "pt" };
    case "es":
      return { gl: "es", hl: "es" };
    default:
      return { gl: "us", hl: "en" };
  }
}

function snippetSourceType(url: string, fallback: "news" | "search"): WebSearchSnippet["sourceType"] {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return fallback;
}

function recentAfterDate(daysBack = 2): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

async function searchSerper(
  endpoint: "search" | "news",
  query: string,
  limit: number,
  locale: WebSearchLocale,
  options: SerperSearchOptions = {},
): Promise<WebSearchSnippet[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  const sourceType = endpoint === "news" ? "news" : "search";
  const tbs =
    options.tbs ?? (endpoint === "news" ? "qdr:d" : "qdr:d");
  const res = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(limit, 10),
      gl: locale.gl,
      hl: locale.hl,
      tbs,
      ...(options.after ? { after: options.after } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper ${endpoint} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
    news?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
      date?: string;
      source?: string;
    }>;
  };

  const rows =
    endpoint === "news"
      ? (json.news ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.link ?? "",
          snippet: r.snippet ?? "",
          meta: [r.source, r.date].filter(Boolean).join(" · "),
        }))
      : (json.organic ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.link ?? "",
          snippet: r.snippet ?? "",
          meta: r.date ?? "",
        }));

  const out: WebSearchSnippet[] = [];
  for (const r of rows) {
    const title = r.title.trim().slice(0, 200);
    const url = r.url.trim().slice(0, 500);
    const body = [r.snippet.trim(), r.meta.trim()].filter(Boolean).join(" — ");
    const content = body.slice(0, 1200);
    const publishedLabel = r.meta.trim() || undefined;
    if (!title || !content) continue;
    out.push({
      title,
      url,
      content,
      publishedLabel,
      sourceType: snippetSourceType(url, sourceType),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchSerperWeb(
  query: string,
  limit = 5,
  locale: WebSearchLocale = { gl: "us", hl: "en" },
  options: SerperSearchOptions = {},
): Promise<WebSearchSnippet[]> {
  const q = query.trim();
  if (!q || !serperConfigured()) return [];
  return searchSerper("search", q, limit, locale, options);
}

export async function searchSerperNews(
  query: string,
  limit = 5,
  locale: WebSearchLocale = { gl: "us", hl: "en" },
  options: SerperSearchOptions = {},
): Promise<WebSearchSnippet[]> {
  const q = query.trim();
  if (!q || !serperConfigured()) return [];
  return searchSerper("news", q, limit, locale, { tbs: "qdr:d", ...options });
}

/** News filtered to the last hour or day — for live trends. */
export async function searchSerperFreshNews(
  query: string,
  limit = 5,
  locale: WebSearchLocale = { gl: "us", hl: "en" },
  recency: Extract<SerperRecency, "qdr:h" | "qdr:d"> = "qdr:d",
): Promise<WebSearchSnippet[]> {
  return searchSerperNews(query, limit, locale, { tbs: recency });
}

/** Web results from the last ~48h. */
export async function searchSerperRecentWeb(
  query: string,
  limit = 5,
  locale: WebSearchLocale = { gl: "us", hl: "en" },
): Promise<WebSearchSnippet[]> {
  return searchSerperWeb(query, limit, locale, {
    tbs: "qdr:d",
    after: recentAfterDate(2),
  });
}

async function searchTavily(query: string, limit: number): Promise<WebSearchSnippet[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(limit, 5),
      search_depth: "basic",
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (json.results ?? [])
    .map((r) => ({
      title: (r.title ?? "").trim().slice(0, 200),
      url: (r.url ?? "").trim().slice(0, 500),
      content: (r.content ?? "").trim().slice(0, 1200),
      sourceType: snippetSourceType((r.url ?? "").trim(), "search"),
    }))
    .filter((r) => r.title && r.content);
}

async function searchWikipedia(query: string, limit: number): Promise<WebSearchSnippet[]> {
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(Math.min(limit, 5)),
    format: "json",
    origin: "*",
  });

  const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?${searchParams}`);
  if (!searchRes.ok) return [];

  const searchJson = (await searchRes.json()) as {
    query?: { search?: Array<{ title?: string; pageid?: number }> };
  };
  const hits = searchJson.query?.search ?? [];
  if (hits.length === 0) return [];

  const titles = hits.map((h) => h.title).filter(Boolean).join("|");
  const extractParams = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    titles,
    format: "json",
    origin: "*",
  });

  const extractRes = await fetch(`https://en.wikipedia.org/w/api.php?${extractParams}`);
  if (!extractRes.ok) return [];

  const extractJson = (await extractRes.json()) as {
    query?: {
      pages?: Record<string, { title?: string; extract?: string; fullurl?: string }>;
    };
  };

  return Object.values(extractJson.query?.pages ?? {})
    .map((page) => ({
      title: (page.title ?? "").trim(),
      url: (page.fullurl ?? "").trim(),
      content: (page.extract ?? "").trim().slice(0, 1200),
      sourceType: "search" as const,
    }))
    .filter((r) => r.title && r.content)
    .slice(0, limit);
}

/** Search the web — Serper, then Tavily, then Wikipedia. */
export async function searchWeb(
  query: string,
  limit = 3,
  locale: WebSearchLocale = { gl: "us", hl: "en" },
): Promise<WebSearchSnippet[]> {
  const q = query.trim();
  if (!q) return [];
  if (serperConfigured()) {
    return searchSerperWeb(q, limit, locale);
  }
  if (tavilyConfigured()) {
    return searchTavily(q, limit);
  }
  return searchWikipedia(q, limit);
}

export function webSearchConfigured(): boolean {
  return serperConfigured() || tavilyConfigured();
}

export function webSearchProviderLabel(): string {
  if (serperConfigured()) return "Serper";
  if (tavilyConfigured()) return "Tavily";
  return "Wikipedia";
}

export function serperWebSearchConfigured(): boolean {
  return serperConfigured();
}
