/** Clean noisy labels before Pexels / stock API search. */
export function sanitizeStockSearchQuery(raw: string): string {
  let q = raw.trim();
  if (!q) return "";

  q = q.replace(/^documentary reference\s*[—–-]\s*/i, "");
  q = q.replace(/^(?:stock\s+)?video\s*[·•\-]\s*/i, "");
  q = q.replace(/\s*[·•]\s*video\s*$/i, "");
  q = q.replace(/\s+on\s+p(?:exels)?\.?$/i, "");
  q = q.replace(/\s+k\s+on\s+p\.?$/i, "");

  const terms = q
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 8)
    .join(" ")
    .trim();

  return (terms || q.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim()).slice(0, 120);
}

export function pickBestStockSearchQuery(candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const cleaned = sanitizeStockSearchQuery(candidate ?? "");
    if (cleaned.length >= 3) return cleaned;
  }
  return "";
}
