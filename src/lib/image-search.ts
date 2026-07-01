export type ImageSearchProvider = "google" | "serper" | "pexels" | "wikimedia";

export interface ImageSearchResult {
  id: string;
  previewUrl: string;
  fullUrl: string;
  sourceUrl: string;
  sourceTitle?: string;
  provider: ImageSearchProvider;
  width?: number;
  height?: number;
  attribution?: string;
}

function serperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY?.trim());
}

function pexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

function googleImageSearchConfigStatus(): {
  hasCseId: boolean;
  hasApiKey: boolean;
} {
  const apiKey = (
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ?? process.env.GOOGLE_API_KEY
  )?.trim();
  return {
    hasCseId: Boolean(process.env.GOOGLE_CSE_ID?.trim()),
    hasApiKey: Boolean(apiKey),
  };
}

function googleImageSearchConfigured(): boolean {
  const { hasCseId, hasApiKey } = googleImageSearchConfigStatus();
  return hasCseId && hasApiKey;
}

export function getGoogleImageSearchConfigStatus(): {
  configured: boolean;
  hasCseId: boolean;
  hasApiKey: boolean;
} {
  const status = googleImageSearchConfigStatus();
  return { ...status, configured: status.hasCseId && status.hasApiKey };
}

export function imageSearchProviderLabel(): string {
  const parts: string[] = [];
  if (serperConfigured()) parts.push("Google (Serper)");
  else if (googleImageSearchConfigured()) parts.push("Google");
  if (pexelsConfigured()) parts.push("Pexels");
  parts.push("Wikimedia");
  return parts.join(" + ");
}

export function isSerperImageSearchConfigured(): boolean {
  return serperConfigured();
}

export function isGoogleImageSearchConfigured(): boolean {
  return googleImageSearchConfigured();
}

export function isPexelsImageSearchConfigured(): boolean {
  return pexelsConfigured();
}

export function imageSearchProvidersStatus(): ImageSearchProvidersStatus {
  return {
    serper: serperConfigured(),
    google: googleImageSearchConfigured(),
    googleImages: serperConfigured() || googleImageSearchConfigured(),
    pexels: pexelsConfigured(),
    wikimedia: true,
  };
}

export function stockImageSearchLabel(): string {
  const parts: string[] = [];
  if (pexelsConfigured()) parts.push("Pexels");
  parts.push("Wikimedia");
  return parts.join(" + ");
}

export type ImageSearchGroupId = "serper" | "google" | "pexels" | "wikimedia";

export interface ImageSearchProvidersStatus {
  serper: boolean;
  google: boolean;
  /** True when Google Images is available (Serper or legacy CSE). */
  googleImages: boolean;
  pexels: boolean;
  wikimedia: true;
}

export interface ImageSearchGroup {
  id: ImageSearchGroupId;
  label: string;
  /** False when API keys are missing on the server. */
  configured: boolean;
  results: ImageSearchResult[];
  /** Set when the source is configured but the request failed. */
  errorMessage?: string;
}

export interface ImageSearchGroupedResponse {
  groups: ImageSearchGroup[];
  providers: ImageSearchProvidersStatus;
  /** Flat list — Google/Serper, then Pexels, then Wikimedia. */
  results: ImageSearchResult[];
}

export function imageProviderDisplayLabel(provider: ImageSearchProvider | string): string {
  switch (provider) {
    case "google":
      return "Google";
    case "serper":
      return "Google";
    case "pexels":
      return "Pexels";
    case "wikimedia":
      return "Wikimedia";
    default:
      return provider;
  }
}

export type ImageSearchOrientation = "landscape" | "portrait" | "square";

async function searchPexels(
  query: string,
  limit: number,
  orientation: ImageSearchOrientation = "landscape",
): Promise<ImageSearchResult[]> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query: query.slice(0, 120),
    per_page: String(Math.min(limit, 8)),
    orientation,
  });

  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pexels search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    photos?: Array<{
      id?: number;
      alt?: string;
      photographer?: string;
      url?: string;
      src?: { medium?: string; large?: string; large2x?: string; original?: string };
      width?: number;
      height?: number;
    }>;
  };

  const out: ImageSearchResult[] = [];
  for (const photo of json.photos ?? []) {
    const full =
      photo.src?.large2x ?? photo.src?.large ?? photo.src?.original ?? photo.src?.medium;
    const preview = photo.src?.medium ?? full;
    if (!full || !preview || photo.id == null) continue;
    out.push({
      id: `pexels-${photo.id}`,
      previewUrl: preview,
      fullUrl: full,
      sourceUrl: photo.url ?? "https://www.pexels.com",
      sourceTitle: photo.alt?.trim() || query,
      provider: "pexels",
      width: photo.width,
      height: photo.height,
      attribution: photo.photographer ? `Photo by ${photo.photographer} / Pexels` : "Pexels",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchWikimedia(query: string, limit: number): Promise<ImageSearchResult[]> {
  const searchParams = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query.slice(0, 120),
    gsrnamespace: "6",
    gsrlimit: String(Math.min(limit * 2, 10)),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: "1280",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${searchParams}`, {
    headers: {
      "User-Agent": "ImagineScriptStudio/1.0 (documentary reference search)",
    },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid?: number;
          title?: string;
          imageinfo?: Array<{
            thumburl?: string;
            url?: string;
            width?: number;
            height?: number;
            extmetadata?: {
              ImageDescription?: { value?: string };
              Artist?: { value?: string };
            };
          }>;
        }
      >;
    };
  };

  const out: ImageSearchResult[] = [];
  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const uploadUrl = info?.url;
    const thumb1280 = info?.thumburl;
    if (!uploadUrl || !thumb1280 || page.pageid == null) continue;
    const title = (page.title ?? "").replace(/^File:/, "");
    const preview240 =
      thumb1280.replace(/\/(\d+)px-/, "/240px-") ?? thumb1280;
    const desc = info.extmetadata?.ImageDescription?.value?.replace(/<[^>]+>/g, "").trim();
    const artist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim();
    out.push({
      id: `wiki-${page.pageid}`,
      previewUrl: preview240,
      fullUrl: thumb1280,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      sourceTitle: desc?.slice(0, 200) || title,
      provider: "wikimedia",
      width: info.width,
      height: info.height,
      attribution: artist ? `${artist} / Wikimedia Commons` : "Wikimedia Commons",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchSerperImages(
  query: string,
  limit: number,
  orientation: ImageSearchOrientation = "landscape",
): Promise<ImageSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query.slice(0, 120),
      num: Math.min(Math.max(limit, 10), 100),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper image search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    images?: Array<{
      title?: string;
      imageUrl?: string;
      thumbnailUrl?: string;
      link?: string;
      source?: string;
      imageWidth?: number;
      imageHeight?: number;
    }>;
  };

  const out: ImageSearchResult[] = [];
  for (const [index, item] of (json.images ?? []).entries()) {
    const fullUrl = item.imageUrl?.trim();
    const previewUrl = item.thumbnailUrl?.trim() ?? fullUrl;
    if (!fullUrl || !previewUrl) continue;

    const width = item.imageWidth;
    const height = item.imageHeight;
    if (!matchesImageOrientation(width, height, orientation)) continue;

    const pageUrl = item.link?.trim() || fullUrl;
    out.push({
      id: `serper-${index}-${fullUrl.slice(-24).replace(/[^a-zA-Z0-9]+/g, "-")}`,
      previewUrl,
      fullUrl,
      sourceUrl: pageUrl,
      sourceTitle: item.title?.trim()?.slice(0, 200) || query,
      provider: "serper",
      width,
      height,
      attribution: item.source ? `${item.source} · Google Images (Serper)` : "Google Images (Serper)",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchSerperImagesSafe(
  query: string,
  limit: number,
  orientation: ImageSearchOrientation,
): Promise<{ results: ImageSearchResult[]; errorCode: string | null }> {
  try {
    const results = await searchSerperImages(query, limit, orientation);
    return { results, errorCode: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("403")) return { results: [], errorCode: "serper_auth" };
    return { results: [], errorCode: "serper_error" };
  }
}

export function serperImageSearchErrorMessage(code: string | null): string | undefined {
  if (code === "serper_auth") {
    return "Serper recusou a chave (401/403). Confira SERPER_API_KEY em serper.dev/api-keys.";
  }
  if (code === "serper_error") {
    return "Busca Serper falhou — tente de novo ou use Pexels/Wikimedia.";
  }
  return undefined;
}

function matchesImageOrientation(
  width: number | undefined,
  height: number | undefined,
  orientation: ImageSearchOrientation,
): boolean {
  if (!width || !height) return true;
  const ratio = width / height;
  if (orientation === "portrait") return ratio < 0.92;
  if (orientation === "landscape") return ratio > 1.08;
  return ratio > 0.85 && ratio < 1.18;
}

function googleImageId(link: string, index: number): string {
  const tail = link.split("?")[0]!.slice(-48).replace(/[^a-zA-Z0-9]+/g, "-");
  return `google-${index}-${tail || index}`;
}

const GOOGLE_JSON_API_CLOSED =
  "This project does not have the access to Custom Search JSON API";

function parseGoogleSearchError(text: string): string | null {
  if (text.includes(GOOGLE_JSON_API_CLOSED)) {
    return "google_json_api_closed";
  }
  if (text.includes("403")) return "google_api_forbidden";
  return null;
}

export function googleImageSearchErrorMessage(code: string | null): string | undefined {
  if (code === "google_json_api_closed") {
    return [
      "O Google fechou a Custom Search JSON API para projetos/contas novas no Cloud.",
      "Ativar a API no console não basta — só clientes antigos ainda têm acesso (até jan/2027).",
      "Use Pexels + Wikimedia (abas ao lado) ou integre uma API alternativa (Serper, Brave, etc.).",
    ].join(" ");
  }
  if (code === "google_api_forbidden") {
    return "Google recusou a busca (403). Confira se a API key é do projeto Papo e se Custom Search API está ativa.";
  }
  return undefined;
}

async function searchGoogleImages(
  query: string,
  limit: number,
  orientation: ImageSearchOrientation = "landscape",
): Promise<ImageSearchResult[]> {
  const apiKey = (
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ?? process.env.GOOGLE_API_KEY
  )?.trim();
  const cx = process.env.GOOGLE_CSE_ID?.trim();
  if (!apiKey || !cx) return [];

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query.slice(0, 120),
    searchType: "image",
    num: String(Math.min(limit, 10)),
    safe: "active",
    imgSize: "large",
    imgType: "photo",
  });

  const res = await fetch(`https://customsearch.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google image search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    items?: Array<{
      title?: string;
      link?: string;
      displayLink?: string;
      image?: {
        contextLink?: string;
        thumbnailLink?: string;
        width?: number;
        height?: number;
      };
    }>;
  };

  const out: ImageSearchResult[] = [];
  for (const [index, item] of (json.items ?? []).entries()) {
    const fullUrl = item.link?.trim();
    const previewUrl = item.image?.thumbnailLink?.trim() ?? fullUrl;
    if (!fullUrl || !previewUrl) continue;
    if (fullUrl.includes("gstatic.com/images?q=tbn:") && !item.image?.thumbnailLink) continue;

    const width = item.image?.width;
    const height = item.image?.height;
    if (!matchesImageOrientation(width, height, orientation)) continue;

    const pageUrl = item.image?.contextLink?.trim() || `https://${item.displayLink ?? "google.com"}`;
    out.push({
      id: googleImageId(fullUrl, index),
      previewUrl,
      fullUrl,
      sourceUrl: pageUrl,
      sourceTitle: item.title?.trim()?.slice(0, 200) || query,
      provider: "google",
      width,
      height,
      attribution: item.displayLink ? `Image via ${item.displayLink}` : "Google Images",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchGoogleImagesSafe(
  query: string,
  limit: number,
  orientation: ImageSearchOrientation,
): Promise<{ results: ImageSearchResult[]; errorCode: string | null }> {
  try {
    const results = await searchGoogleImages(query, limit, orientation);
    return { results, errorCode: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = parseGoogleSearchError(msg);
    if (code) return { results: [], errorCode: code };
    throw err;
  }
}

/** Search Google, Pexels and Wikimedia in parallel; one group per source. */
export async function searchImagesGrouped(
  query: string,
  limitPerGroup = 6,
  orientation: ImageSearchOrientation = "landscape",
): Promise<ImageSearchGroupedResponse> {
  const q = query.trim();
  const providers = imageSearchProvidersStatus();
  if (!q) {
    return { groups: buildEmptyImageSearchGroups(providers), providers, results: [] };
  }

  const perGroup = Math.max(2, Math.min(limitPerGroup, 10));

  const serperHit = providers.serper
    ? await searchSerperImagesSafe(q, perGroup, orientation)
    : { results: [] as ImageSearchResult[], errorCode: null };
  const googleHit =
    !providers.serper && providers.google
      ? await searchGoogleImagesSafe(q, perGroup, orientation)
      : { results: [] as ImageSearchResult[], errorCode: null };

  const [pexels, wiki] = await Promise.all([
    providers.pexels ? searchPexels(q, perGroup, orientation) : Promise.resolve([]),
    searchWikimedia(q, perGroup),
  ]);

  const groups: ImageSearchGroup[] = [];

  if (providers.serper) {
    groups.push({
      id: "serper",
      label: "Google",
      configured: true,
      results: serperHit.results,
      errorMessage: serperImageSearchErrorMessage(serperHit.errorCode),
    });
  } else if (providers.google) {
    groups.push({
      id: "google",
      label: "Google",
      configured: true,
      results: googleHit.results,
      errorMessage: googleImageSearchErrorMessage(googleHit.errorCode),
    });
  } else {
    groups.push({
      id: "serper",
      label: "Google",
      configured: false,
      results: [],
    });
  }

  groups.push(
    { id: "pexels", label: "Pexels", configured: providers.pexels, results: pexels },
    { id: "wikimedia", label: "Wikimedia", configured: true, results: wiki },
  );

  const results = [...serperHit.results, ...googleHit.results, ...pexels, ...wiki];
  return { groups, providers, results };
}

function buildEmptyImageSearchGroups(
  providers: ImageSearchProvidersStatus,
): ImageSearchGroup[] {
  const googleGroup: ImageSearchGroup = providers.serper
    ? { id: "serper", label: "Google", configured: true, results: [] }
    : providers.google
      ? { id: "google", label: "Google", configured: true, results: [] }
      : { id: "serper", label: "Google", configured: false, results: [] };

  return [
    googleGroup,
    { id: "pexels", label: "Pexels", configured: providers.pexels, results: [] },
    { id: "wikimedia", label: "Wikimedia", configured: true, results: [] },
  ];
}

/** Search reference photos — Google + Pexels when configured, plus Wikimedia. */
export async function searchImages(
  query: string,
  limit = 4,
  orientation: ImageSearchOrientation = "landscape",
): Promise<ImageSearchResult[]> {
  const perGroup = Math.max(2, Math.ceil(limit / 2));
  const grouped = await searchImagesGrouped(query, perGroup, orientation);
  return grouped.results.slice(0, limit);
}
