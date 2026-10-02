/**
 * Suggests code, version, product, angle and format for a batch of loose creative files,
 * based on file names, folders and what the library already has. Client-safe.
 */
import {
  parseCreativeName,
  toNameSlug,
  toProductCode,
  type CreativeFormat,
  type CreativeRatio,
} from "@/lib/creatives";

export type ImportInput = {
  key: string;
  path: string;
  name: string;
  isVideo: boolean;
  ratio: CreativeRatio | null;
};

export type ImportSuggestion = {
  key: string;
  code: number;
  version: number;
  product: string;
  angle: string;
  format: CreativeFormat;
  creator: string;
  language: string;
};

export type ImportContext = {
  products: string[];
  creators: string[];
  nextCode: number;
  /** Folder the user is in — used when nothing in the path names a product. */
  defaultProduct?: string;
};

const NOISE = new Set([
  "img", "image", "imagem", "imagens", "foto", "video", "videos", "gpt", "chatgpt", "ia", "final", "copy",
  "copia", "novo", "nova", "new", "ugc", "story", "stories", "feed", "reels", "reel", "post", "ad", "ads",
  "anuncio", "criativo", "criativos", "editado", "edit", "versao", "fluencer", "influencer", "foco", "geral",
  "pt", "en", "es", "png", "jpg", "mp4", "mov",
]);

const GENERIC_FOLDERS = new Set([
  "criativos", "creatives", "ugc", "videos", "video", "imagens", "images", "stories", "feed", "reels",
  "trafego pago", "ads", "anuncios", "novos", "finais", "final", "aprovados", "publicados",
]);

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Name with copy counters and size markers removed — files sharing it are sizes of one piece. */
function groupKey(name: string): string {
  return norm(baseName(name))
    .replace(/\(\d+\)/g, " ")
    .replace(/\b\d{3,4}\s*x\s*\d{3,4}\b/g, " ")
    .replace(/\b(9x16|4x5|1x1|2x3|16x9|story|stories|feed|reels|square|quadrado|vertical|horizontal)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function guessLanguage(name: string): string {
  const w = words(name);
  const joined = norm(name);
  if (w.includes("en") || /\d(en)\b/.test(joined) || /\b(english|ingles)\b/.test(joined)) return "EN";
  if (w.includes("es") || /\b(espanol|espanhol|spanish)\b/.test(joined)) return "ES";
  return "PT";
}

function guessProduct(input: ImportInput, products: string[]): string {
  const tokens = [...words(input.path), ...words(input.name)].map((t) => t.toUpperCase());
  const known = products.find((p) => tokens.some((t) => t === p || (p.length >= 4 && t.startsWith(p))));
  if (known) return known;
  const folders = input.path.split(/[\\/]/).slice(0, -1).reverse();
  const folder = folders.find((f) => f.trim() && !GENERIC_FOLDERS.has(norm(f).trim()));
  return folder ? toProductCode(folder) : "";
}

function guessCreator(input: ImportInput, creators: string[]): string {
  const tokens = words(`${input.path} ${input.name}`);
  return creators.find((c) => tokens.includes(norm(c))) ?? "";
}

/** Words of the name minus old codes ("A2.1 -"), copy counters, sizes and versions. */
function nameWords(name: string): string[] {
  return baseName(name)
    .replace(/^\s*[A-Za-z]{0,2}\d+(?:\.\d+)*\s*[-_.]?\s*/, "")
    .replace(/\(\d+\)/g, " ")
    .replace(/\b\d{3,4}\s*x\s*\d{3,4}\b/gi, " ")
    .replace(/\bv\d+\b/gi, " ")
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w));
}

function guessAngle(name: string, product: string, creator: string): string {
  const all = nameWords(name);
  const withoutCreator = all.filter((w) => norm(w) !== norm(creator));
  const specific = withoutCreator.filter((w) => !NOISE.has(norm(w)) && norm(w) !== norm(product));
  const meaningful = withoutCreator.filter((w) => !NOISE.has(norm(w)));
  return toNameSlug((specific.length ? specific : meaningful.length ? meaningful : all).join(" "));
}

export function suggestImport(inputs: ImportInput[], ctx: ImportContext): ImportSuggestion[] {
  const groups = new Map<string, ImportInput[]>();
  for (const input of [...inputs].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))) {
    const key = groupKey(input.name);
    groups.set(key, [...(groups.get(key) ?? []), input]);
  }

  const out = new Map<string, ImportSuggestion>();
  let code = ctx.nextCode;
  for (const files of groups.values()) {
    const named = files.map((f) => ({ f, parsed: parseCreativeName(baseName(f.name)) }));
    const groupCode = named.find((n) => n.parsed)?.parsed?.code ?? code++;
    const usedRatios = new Map<number, Set<string>>();
    const lead = files[0];
    const product = guessProduct(lead, ctx.products) || ctx.defaultProduct || "";
    const creator = guessCreator(lead, ctx.creators);
    const angle = guessAngle(lead.name, product, creator) || "Angulo";

    for (const { f, parsed } of named) {
      if (parsed) {
        out.set(f.key, {
          key: f.key,
          code: parsed.code,
          version: parsed.version,
          product: parsed.product,
          angle: parsed.angle,
          format: parsed.format,
          creator: parsed.creator ?? "",
          language: parsed.language ?? "PT",
        });
        continue;
      }
      const lowered = norm(f.path);
      const format: CreativeFormat = f.isVideo
        ? creator || /\bugc\b/.test(lowered)
          ? "UGC"
          : "VID"
        : /carross?e?l|carousel/.test(lowered)
          ? "CARR"
          : "IMG";
      const explicitVersion = Number(/\bv(\d+)\b/i.exec(baseName(f.name))?.[1]) || 0;
      let version = explicitVersion || 1;
      if (f.ratio) {
        while (!explicitVersion && usedRatios.get(version)?.has(f.ratio)) version++;
        usedRatios.set(version, (usedRatios.get(version) ?? new Set()).add(f.ratio));
      }

      out.set(f.key, {
        key: f.key,
        code: groupCode,
        version,
        product,
        angle,
        format,
        creator,
        language: guessLanguage(f.name),
      });
    }
  }
  return inputs.map((i) => out.get(i.key)!);
}

/** What the vision model says about one file (see /api/creatives/analyze). */
export type ContentAnalysis = {
  key: string;
  product: string;
  angle: string;
  hook: string;
  format: CreativeFormat | null;
  creator: string;
  language: string | null;
  group: string | null;
  variant: string | null;
  note: string;
};

export type ConceptAssignInput = {
  key: string;
  ratio: CreativeRatio | null;
  /** Concept id — "C005" joins that library concept, anything else is a new concept. */
  group: string;
  /** Same design in another size; files sharing it share the version. */
  variant: string;
};

/**
 * Codes and versions from a grouping: one code per group (new codes counted from `nextCode`),
 * one version per variant (after the library's latest), and a variant that repeats a ratio
 * spills into a new version so names never collide.
 */
export function assignConcepts(
  items: ConceptAssignInput[],
  ctx: { libraryVersions: Map<number, number>; nextCode: number; reservedCodes?: Iterable<number> },
): Map<string, { code: number; version: number }> {
  const fixedCode = (group: string) => {
    const m = /^[CP](\d{3,})$/.exec(group);
    return m && ctx.libraryVersions.has(Number(m[1])) ? Number(m[1]) : null;
  };
  const reserved = new Set(ctx.reservedCodes ?? []);
  let next = ctx.nextCode;
  const newCode = () => {
    while (reserved.has(next)) next++;
    return next++;
  };
  const codeOf = new Map<string, number>();
  const versions = new Map<number, { next: number; byVariant: Map<string, number>; ratios: Map<number, Set<string>> }>();
  const out = new Map<string, { code: number; version: number }>();

  for (const it of items) {
    let code = codeOf.get(it.group);
    if (code === undefined) {
      code = fixedCode(it.group) ?? newCode();
      codeOf.set(it.group, code);
    }
    let state = versions.get(code);
    if (!state) {
      state = { next: (ctx.libraryVersions.get(code) ?? 0) + 1, byVariant: new Map(), ratios: new Map() };
      versions.set(code, state);
    }
    const ratio = it.ratio ?? "1x1";
    let version = state.byVariant.get(it.variant);
    if (version === undefined || state.ratios.get(version)?.has(ratio)) {
      version = state.next++;
      state.byVariant.set(it.variant, version);
    }
    state.ratios.set(version, (state.ratios.get(version) ?? new Set()).add(ratio));
    out.set(it.key, { code, version });
  }
  return out;
}
