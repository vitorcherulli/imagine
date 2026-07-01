/** Visual section / chapter markers in the script — not narrated. */

/** `## Title` or `# Title` on its own paragraph block. */
export const SCRIPT_SECTION_HEADING_RE = /^#{1,2}\s+(.+)$/;

/** `[chapter] Title`, `[section] Title`, `[capítulo] …` */
export const SCRIPT_SECTION_TAG_RE =
  /^\[(?:chapter|section|capítulo|capitulo)\]\s*(.+)$/i;

export function parseSectionTitleFromBlock(block: string): string | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const heading = SCRIPT_SECTION_HEADING_RE.exec(trimmed);
  if (heading?.[1]) {
    const title = heading[1].trim();
    return title ? title.slice(0, 120) : null;
  }

  const tagged = SCRIPT_SECTION_TAG_RE.exec(trimmed);
  if (tagged?.[1]) {
    const title = tagged[1].trim();
    return title ? title.slice(0, 120) : null;
  }

  return null;
}

export function formatScriptSectionLine(title: string): string {
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) return "## Section";
  return `## ${trimmed}`;
}

export function countScriptSectionsInBlocks(blocks: string[]): number {
  return blocks.filter((block) => parseSectionTitleFromBlock(block)).length;
}

/** Append a visual section marker — not narrated. */
export function appendScriptSection(script: string, title: string): string {
  const line = formatScriptSectionLine(title);
  const normalized = normalizeScriptBlocks(script);
  if (!normalized) return line;
  return `${normalized}\n\n${line}\n\n`;
}

function normalizeScriptBlocks(script: string): string {
  return script.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}

function splitScriptBlocks(script: string): string[] {
  const normalized = normalizeScriptBlocks(script);
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
}

/** Remove one section marker by its index among all script blocks (matches editor markers). */
export function removeScriptSectionAtMarkerIndex(script: string, markerIndex: number): string {
  const blocks = splitScriptBlocks(script);
  if (markerIndex < 0 || markerIndex >= blocks.length) return normalizeScriptBlocks(script);
  if (!parseSectionTitleFromBlock(blocks[markerIndex]!)) return normalizeScriptBlocks(script);
  blocks.splice(markerIndex, 1);
  return blocks.join("\n\n");
}
