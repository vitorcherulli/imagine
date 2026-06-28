import { z } from "zod";

export type OutlineBeatLength = "short" | "balanced";

export interface OutlineOptions {
  /** short = telegraphic planning beats; balanced = more detail per beat */
  beatLength: OutlineBeatLength;
  /** Keep hooks, closings and vivid lines verbatim when possible */
  preserveVoice: boolean;
  /** Sponsor / partner / CTA paragraphs stay nearly full */
  protectCta: boolean;
}

export const DEFAULT_OUTLINE_OPTIONS: OutlineOptions = {
  beatLength: "balanced",
  preserveVoice: true,
  protectCta: true,
};

export const OUTLINE_OPTIONS_STORAGE_KEY = "imagine-script-outline-options";

const outlineOptionsSchema = z.object({
  beatLength: z.enum(["short", "balanced"]),
  preserveVoice: z.boolean(),
  protectCta: z.boolean(),
});

export function normalizeOutlineOptions(
  raw?: Partial<OutlineOptions> | null,
): OutlineOptions {
  const parsed = outlineOptionsSchema.safeParse({
    ...DEFAULT_OUTLINE_OPTIONS,
    ...raw,
  });
  return parsed.success ? parsed.data : DEFAULT_OUTLINE_OPTIONS;
}

export function outlineBeatMaxWords(options: OutlineOptions): number {
  return options.beatLength === "short" ? 15 : 28;
}

/** Sponsor, partner or description CTA blocks — keep full when protectCta is on. */
export function isLikelyCtaParagraph(text: string): boolean {
  const lower = text.toLowerCase();
  const signals = [
    "link in the description",
    "made possible by",
    "sponsor",
    "partner",
    "visit the link",
    "leave your email",
    "explore the full itinerary",
    "chance to win",
    "turismo",
    "agency",
    "360go",
    "description, leave",
  ];
  return signals.some((s) => lower.includes(s));
}

export function readOutlineOptions(): OutlineOptions {
  if (typeof window === "undefined") return DEFAULT_OUTLINE_OPTIONS;
  try {
    const raw = window.localStorage.getItem(OUTLINE_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_OUTLINE_OPTIONS;
    return normalizeOutlineOptions(JSON.parse(raw) as Partial<OutlineOptions>);
  } catch {
    return DEFAULT_OUTLINE_OPTIONS;
  }
}

export function writeOutlineOptions(options: OutlineOptions): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      OUTLINE_OPTIONS_STORAGE_KEY,
      JSON.stringify(normalizeOutlineOptions(options)),
    );
  } catch {
    // ignore
  }
}

export function outlineOptionsPromptLines(options: OutlineOptions): string[] {
  const max = outlineBeatMaxWords(options);
  const lines = [
    `- Beat length: ${options.beatLength === "short" ? "SHORT" : "BALANCED"} — max ~${max} words per speech beat.`,
  ];
  if (options.preserveVoice) {
    lines.push(
      "- Preserve voice: keep memorable hooks, closings and vivid metaphors verbatim when possible — do not flatten iconic lines.",
    );
  }
  if (options.protectCta) {
    lines.push(
      "- Protect CTA/sponsor blocks: paragraphs about partners, agencies, links, email or giveaways must stay nearly complete — never drop commercial details.",
    );
  }
  return lines;
}
