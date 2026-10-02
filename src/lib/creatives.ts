/**
 * Ad creative library: naming convention, Meta Ads CSV parsing and status suggestions.
 * Client-safe (no Node imports).
 *
 * File / ad name: C013_PRODUCT_Angle_FORMAT[-Creator]_RATIO_v1[_EN]
 */

export const CREATIVE_FORMATS = {
  IMG: "Static image",
  CARR: "Carousel",
  VID: "Edited / motion video",
  UGC: "Person on camera (UGC)",
} as const;
export type CreativeFormat = keyof typeof CREATIVE_FORMATS;

export const CREATIVE_RATIOS = {
  "9x16": "Stories / Reels",
  "4x5": "Feed (recommended)",
  "1x1": "Square feed",
  "2x3": "Feed — Meta crops it to 4:5",
  "16x9": "Landscape / YouTube",
} as const;
export type CreativeRatio = keyof typeof CREATIVE_RATIOS;

export const CREATIVE_LANGUAGES = ["PT", "EN", "ES"] as const;

export const CREATIVE_STATUSES = {
  winner: "Winner",
  validated: "Validated",
  testing: "Testing",
  pause: "Pause",
  untested: "Not tested",
  archived: "Archived",
} as const;
export type CreativeStatus = keyof typeof CREATIVE_STATUSES;

export const DEFAULT_MIN_SPEND = 100;

/** C = criativo. Names with the earlier P prefix are still recognized. */
export const CREATIVE_CODE_PREFIX = "C";

const NAME_RE =
  /^[CP](\d{3,})_([A-Z0-9]+)_([A-Za-z0-9]+)_(IMG|CARR|VID|UGC)(?:-([A-Za-z0-9]+))?_(\d+x\d+)_v(\d+)(?:_([A-Z]{2}))?$/;

export function isCreativeFormat(v: unknown): v is CreativeFormat {
  return typeof v === "string" && v in CREATIVE_FORMATS;
}

export function isCreativeRatio(v: unknown): v is CreativeRatio {
  return typeof v === "string" && v in CREATIVE_RATIOS;
}

export function isCreativeStatus(v: unknown): v is CreativeStatus {
  return typeof v === "string" && v in CREATIVE_STATUSES;
}

export function creativeCode(code: number): string {
  return `${CREATIVE_CODE_PREFIX}${String(code).padStart(3, "0")}`;
}

/** "Atenda 24h sem funcionário" → "Atenda24hSemFuncionario" */
export function toNameSlug(text: string, max = 28): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .slice(0, max);
}

export function toProductCode(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 16);
}

export function ratioFromSize(width?: number | null, height?: number | null): CreativeRatio | null {
  if (!width || !height) return null;
  const r = width / height;
  let best: CreativeRatio = "1x1";
  let bestDiff = Infinity;
  for (const key of Object.keys(CREATIVE_RATIOS) as CreativeRatio[]) {
    const [w, h] = key.split("x").map(Number);
    const diff = Math.abs(w / h - r);
    if (diff < bestDiff) {
      best = key;
      bestDiff = diff;
    }
  }
  return best;
}

export type CreativeNameParts = {
  code: number;
  product: string;
  angle: string;
  format: CreativeFormat;
  creator?: string | null;
  aspectRatio: string;
  version: number;
  language?: string | null;
};

export function buildCreativeName(p: CreativeNameParts): string {
  const product = toProductCode(p.product) || "GERAL";
  const angle = toNameSlug(p.angle) || "Angulo";
  const creator = p.format === "UGC" && p.creator ? `-${toNameSlug(p.creator, 16)}` : "";
  const lang = p.language && p.language !== "PT" ? `_${p.language}` : "";
  return `${creativeCode(p.code)}_${product}_${angle}_${p.format}${creator}_${p.aspectRatio}_v${p.version}${lang}`;
}

/** Ad name for Meta: one ad can carry every size of a version, so the ratio is left out. */
export function buildAdName(p: Omit<CreativeNameParts, "aspectRatio">): string {
  const product = toProductCode(p.product) || "GERAL";
  const angle = toNameSlug(p.angle) || "Angulo";
  const creator = p.format === "UGC" && p.creator ? `-${toNameSlug(p.creator, 16)}` : "";
  const lang = p.language && p.language !== "PT" ? `_${p.language}` : "";
  return `${creativeCode(p.code)}_${product}_${angle}_${p.format}${creator}_v${p.version}${lang}`;
}

export function parseCreativeName(nameWithoutExt: string): CreativeNameParts | null {
  const m = NAME_RE.exec(nameWithoutExt.trim());
  if (!m) return null;
  return {
    code: Number(m[1]),
    product: m[2],
    angle: m[3],
    format: m[4] as CreativeFormat,
    creator: m[5] ?? null,
    aspectRatio: m[6],
    version: Number(m[7]),
    language: m[8] ?? "PT",
  };
}

/** First C### found anywhere in an ad name (ads may carry extra suffixes like "| LAL 1%"). P### is the legacy prefix. */
export function codeFromAdName(adName: string): number | null {
  const m = /(?:^|[^A-Za-z0-9])[CP](\d{3,})(?!\d)/.exec(adName);
  return m ? Number(m[1]) : null;
}

/** "C013_EXTRATOR_VendeB2B_IMG_v2_EN" → 2. Null when the ad name carries no version. */
export function versionFromAdName(adName: string): number | null {
  const m = /(?:^|[^A-Za-z0-9])[CP]\d{3,}[^\s]*?[_-]v(\d+)(?![0-9])/i.exec(adName);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Meta Ads Manager CSV export

export type MetaAdRow = {
  adName: string;
  code: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
};

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\ufeff/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** Accepts "1.234,56", "1,234.56", "R$ 12,30", "3,85%". */
export function parseLocaleNumber(v: string | undefined): number | null {
  if (v == null) return null;
  let s = v.replace(/[R$%\s\u00a0]/g, "");
  if (!s || s === "-") return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const normHeader = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const META_COLUMNS: Record<keyof Omit<MetaAdRow, "code">, ((h: string) => boolean)[]> = {
  adName: [(h) => h.startsWith("nome do anuncio"), (h) => h === "ad name"],
  spend: [(h) => h.startsWith("valor usado"), (h) => h.startsWith("amount spent"), (h) => h.startsWith("gasto")],
  impressions: [(h) => h === "impressoes", (h) => h === "impressions"],
  clicks: [
    (h) => h.startsWith("cliques no link"),
    (h) => h.startsWith("link clicks"),
    (h) => h === "cliques",
    (h) => h === "clicks",
  ],
  results: [(h) => h === "resultados", (h) => h === "results", (h) => h === "leads"],
};

const PERIOD_COLUMNS = {
  start: (h: string) => h.startsWith("inicio dos relatorios") || h === "reporting starts",
  end: (h: string) => h.startsWith("termino dos relatorios") || h.startsWith("fim dos relatorios") || h === "reporting ends",
};

/** "2026-09-01" or "01/09/2026" → "2026-09-01". */
function parseReportDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null;
}

export type MetaAdsExport = {
  rows: MetaAdRow[];
  /** Reporting range from the export, when it has the "Reporting starts / ends" columns. */
  periodStart: string | null;
  periodEnd: string | null;
  error?: string;
};

export function parseMetaAdsCsv(text: string): MetaAdsExport {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], periodStart: null, periodEnd: null, error: "The file has no data rows." };
  const headers = table[0].map(normHeader);
  const startIdx = headers.findIndex(PERIOD_COLUMNS.start);
  const endIdx = headers.findIndex(PERIOD_COLUMNS.end);
  const dates = (i: number) =>
    i < 0 ? [] : table.slice(1).map((r) => parseReportDate(r[i])).filter((d): d is string => !!d).sort();
  const starts = dates(startIdx);
  const ends = dates(endIdx);
  const periodStart = starts[0] ?? null;
  const periodEnd = ends[ends.length - 1] ?? null;
  const idx: Partial<Record<keyof typeof META_COLUMNS, number>> = {};
  for (const [key, tests] of Object.entries(META_COLUMNS) as [keyof typeof META_COLUMNS, ((h: string) => boolean)[]][]) {
    for (const test of tests) {
      const i = headers.findIndex(test);
      if (i >= 0) {
        idx[key] = i;
        break;
      }
    }
  }
  if (idx.adName == null) {
    return { rows: [], periodStart, periodEnd, error: 'Could not find the "Ad name" / "Nome do anúncio" column.' };
  }
  const num = (row: string[], key: keyof typeof META_COLUMNS) =>
    idx[key] == null ? 0 : parseLocaleNumber(row[idx[key]!]) ?? 0;
  const rows = table.slice(1).map((row) => {
    const adName = (row[idx.adName!] ?? "").trim();
    return {
      adName,
      code: codeFromAdName(adName),
      spend: num(row, "spend"),
      impressions: num(row, "impressions"),
      clicks: num(row, "clicks"),
      results: num(row, "results"),
    };
  });
  return { rows: rows.filter((r) => r.adName), periodStart, periodEnd };
}

// ---------------------------------------------------------------------------
// Performance

export type CreativePerformance = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number | null;
  cpa: number | null;
  ads: number;
};

export function summarizePerformance(rows: Pick<MetaAdRow, "spend" | "impressions" | "clicks" | "results">[]): CreativePerformance {
  const t = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      results: a.results + r.results,
    }),
    { spend: 0, impressions: 0, clicks: 0, results: 0 },
  );
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
    cpa: t.results ? t.spend / t.results : null,
    ads: rows.length,
  };
}

/** One imported Meta export, aggregated per concept and per version. */
export type MetricPeriod = {
  id: string;
  sourceFile: string;
  periodStart: string | null;
  periodEnd: string | null;
  importedAt: string;
  rows: number;
  performance: Record<number, CreativePerformance>;
  /** Keyed "code:version", from the version in each ad name. */
  versionPerformance: Record<string, CreativePerformance>;
  unmatched: string[];
};

/** Results of the period being looked at, plus the period right before it to compare with. */
export type PeriodView = {
  performance: Record<number, CreativePerformance>;
  versionPerformance: Record<string, CreativePerformance>;
  previousPerformance: Record<number, CreativePerformance>;
  metrics: {
    periodId: string | null;
    rows: number;
    unmatched: string[];
    sourceFile: string | null;
    importedAt: string | null;
  };
};

/** `periods` newest first; an unknown or null id means the newest. */
export function viewPeriod(periods: MetricPeriod[], periodId: string | null): PeriodView {
  const i = Math.max(0, periods.findIndex((p) => p.id === periodId));
  const cur = periods[i];
  return {
    performance: cur?.performance ?? {},
    versionPerformance: cur?.versionPerformance ?? {},
    previousPerformance: periods[i + 1]?.performance ?? {},
    metrics: {
      periodId: cur?.id ?? null,
      rows: cur?.rows ?? 0,
      unmatched: cur?.unmatched ?? [],
      sourceFile: cur?.sourceFile ?? null,
      importedAt: cur?.importedAt ?? null,
    },
  };
}

/** "Sep 1 – Sep 7" from the reporting range, or "Imported Oct 1" when the export had none. */
export function periodLabel(p: Pick<MetricPeriod, "periodStart" | "periodEnd" | "importedAt">): string {
  const day = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (p.periodStart && p.periodEnd) {
    return p.periodStart === p.periodEnd ? day(p.periodStart) : `${day(p.periodStart)} – ${day(p.periodEnd)}`;
  }
  return `Imported ${day(p.importedAt)}`;
}

export type PerformanceTrend = {
  /** Relative change vs the previous period: 0.3 = +30%. */
  cpaChange: number | null;
  ctrChange: number | null;
  /** Cost per result up ≥30%, CTR down ≥25%, or results stopped — with enough spend in both periods. */
  fatigue: boolean;
  /** Cost per result down ≥20%. */
  improving: boolean;
};

export function comparePerformance(
  cur: CreativePerformance | undefined,
  prev: CreativePerformance | undefined,
  minSpend = DEFAULT_MIN_SPEND,
): PerformanceTrend | null {
  if (!cur || !prev) return null;
  const change = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? (a - b) / b : null);
  const cpaChange = change(cur.cpa, prev.cpa);
  const ctrChange = change(cur.ctr, prev.ctr);
  const enough = cur.spend >= minSpend / 2 && prev.spend >= minSpend / 2;
  const stopped = cur.cpa == null && prev.cpa != null;
  return {
    cpaChange,
    ctrChange,
    fatigue: enough && (stopped || (cpaChange ?? 0) >= 0.3 || (ctrChange ?? 0) <= -0.25),
    improving: enough && (cpaChange ?? 0) <= -0.2,
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/**
 * Winner: cost per result ≥20% below the product median. Pause: ≥50% above, or spend with no result.
 * Testing: below the minimum spend. Needs at least two judged concepts in the same product to compare.
 */
export function suggestStatuses(
  concepts: { code: number; product: string }[],
  perf: Record<number, CreativePerformance | undefined>,
  minSpend = DEFAULT_MIN_SPEND,
): Record<number, CreativeStatus> {
  const byProduct: Record<string, number[]> = {};
  for (const c of concepts) {
    const p = perf[c.code];
    if (p?.cpa != null && p.spend >= minSpend) (byProduct[c.product] ??= []).push(p.cpa);
  }
  const out: Record<number, CreativeStatus> = {};
  for (const c of concepts) {
    const p = perf[c.code];
    if (!p || !p.spend) out[c.code] = "untested";
    else if (p.spend < minSpend) out[c.code] = "testing";
    else if (p.cpa == null) out[c.code] = "pause";
    else {
      const peers = byProduct[c.product] ?? [];
      if (peers.length < 2) out[c.code] = "validated";
      else {
        const med = median(peers);
        out[c.code] = p.cpa <= med * 0.8 ? "winner" : p.cpa >= med * 1.5 ? "pause" : "validated";
      }
    }
  }
  return out;
}
