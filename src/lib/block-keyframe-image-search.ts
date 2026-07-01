import type { Project, StoryBlock } from "@/lib/db/schema";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildBlockKeyframeSearchSystemPrompt,
  buildBlockKeyframeSearchUserPrompt,
} from "@/lib/script-prompts";
import {
  formatLocationTag,
  formatStyleBibleForPrompt,
  parseStyleBible,
} from "@/lib/style-bible";
import {
  isStoryBlockPause,
  PAUSE_VISUAL_PROMPT,
  resolveNeighborVisualBlock,
} from "@/lib/script-pause";
import { sortBlocksByPosition } from "@/lib/timeline-free-edit";

export interface BlockKeyframeSearchContext {
  storyDescription: string;
  genre: string;
  visualStyle: string;
  editorialLine: string | null;
  location: string | null;
  segmentType: string;
  narrativeText: string;
  visualPrompt: string;
  neighborHint: string | null;
  isPauseBlock: boolean;
}

export interface BlockKeyframeSearchSuggestion {
  query: string;
  keywords: string[];
  context: BlockKeyframeSearchContext;
  source: "llm" | "fallback";
}

const STOCK_SEARCH_STOP = new Set([
  "atmospheric",
  "visual",
  "hold",
  "slow",
  "gentle",
  "motion",
  "image",
  "breathe",
  "music",
  "swells",
  "narration",
  "resumes",
  "next",
  "cut",
  "cinematic",
  "documentary",
  "scene",
  "lighting",
  "camera",
  "mood",
  "warm",
  "amber",
  "rim",
  "deep",
  "teal",
  "shadows",
]);

function isGenericVisualPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed === PAUSE_VISUAL_PROMPT) return true;
  return /atmospheric visual hold|music swells|let the image breathe/i.test(trimmed);
}

function narrationForBlock(block: StoryBlock, blocks: StoryBlock[]): string {
  if (block.narrativeText.trim()) return block.narrativeText.trim();
  const groupId = block.narrationGroupId?.trim();
  if (!groupId) return "";
  const group = sortBlocksByPosition(blocks).filter((b) => b.narrationGroupId === groupId);
  return group.find((b) => b.narrativeText.trim())?.narrativeText.trim() ?? "";
}

function neighborContext(block: StoryBlock, blocks: StoryBlock[]): string | null {
  const sorted = sortBlocksByPosition(blocks);
  const idx = sorted.findIndex((b) => b.id === block.id);
  if (idx < 0) return null;
  const hints: string[] = [];
  for (let i = idx - 1; i >= 0 && hints.length < 2; i -= 1) {
    const b = sorted[i]!;
    const text = b.visualPrompt.trim() || b.narrativeText.trim();
    if (text && !isGenericVisualPrompt(text)) hints.unshift(text.slice(0, 120));
  }
  for (let i = idx + 1; i < sorted.length && hints.length < 3; i += 1) {
    const b = sorted[i]!;
    const text = b.visualPrompt.trim() || b.narrativeText.trim();
    if (text && !isGenericVisualPrompt(text)) hints.push(text.slice(0, 120));
  }
  return hints.length > 0 ? hints.join(" · ") : null;
}

export function buildBlockKeyframeSearchContext(
  project: Pick<
    Project,
    "storyDescription" | "genre" | "visualStyle" | "styleBible"
  >,
  block: StoryBlock,
  blocks: StoryBlock[],
): BlockKeyframeSearchContext {
  const isPauseBlock = isStoryBlockPause(block);
  const neighbor = resolveNeighborVisualBlock(sortBlocksByPosition(blocks), block);
  const bible = parseStyleBible(project.styleBible);
  const editorialLine = formatStyleBibleForPrompt(bible).trim() || null;

  let visualPrompt = block.visualPrompt.trim();
  if (isGenericVisualPrompt(visualPrompt)) {
    const fromNeighbor = neighbor.visualPrompt?.trim();
    if (fromNeighbor && !isGenericVisualPrompt(fromNeighbor)) {
      visualPrompt = fromNeighbor;
    } else {
      visualPrompt = "";
    }
  }

  const location =
    formatLocationTag(block.locationTag) ??
    formatLocationTag(neighbor.locationTag) ??
    null;

  return {
    storyDescription: project.storyDescription ?? "",
    genre: project.genre ?? "",
    visualStyle: project.visualStyle ?? "",
    editorialLine,
    location,
    segmentType: block.segmentType,
    narrativeText: narrationForBlock(block, blocks),
    visualPrompt,
    neighborHint: neighborContext(block, blocks),
    isPauseBlock,
  };
}

function extractConcreteTerms(text: string, maxWords = 8): string[] {
  const words = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const picked: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOCK_SEARCH_STOP.has(lower)) continue;
    picked.push(word);
    if (picked.length >= maxWords) break;
  }
  return picked;
}

export function fallbackBlockKeyframeSearchSuggestion(
  context: BlockKeyframeSearchContext,
): BlockKeyframeSearchSuggestion {
  const parts: string[] = [];
  if (context.location) parts.push(context.location);
  if (context.genre.trim()) parts.push(context.genre.trim());

  const narrativeTerms = extractConcreteTerms(context.narrativeText, 6);
  if (narrativeTerms.length > 0) {
    parts.push(narrativeTerms.join(" "));
  } else {
    const visualTerms = extractConcreteTerms(context.visualPrompt, 6);
    if (visualTerms.length > 0) parts.push(visualTerms.join(" "));
  }

  if (parts.length === 0 && context.storyDescription.trim()) {
    parts.push(...extractConcreteTerms(context.storyDescription, 5));
  }

  const query = parts.join(" ").trim().slice(0, 100) || "landscape nature";
  const keywords: string[] = [];
  if (context.location && !query.toLowerCase().includes(context.location.toLowerCase())) {
    keywords.push(context.location);
  }
  if (context.narrativeText.trim()) {
    const phrase = extractConcreteTerms(context.narrativeText, 4).join(" ");
    if (phrase && phrase !== query) keywords.push(phrase);
  }
  if (context.visualPrompt.trim()) {
    const phrase = extractConcreteTerms(context.visualPrompt, 4).join(" ");
    if (phrase && phrase !== query) keywords.push(phrase);
  }
  if (context.genre.trim()) keywords.push(context.genre.trim());

  const uniqueKeywords = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 5);

  return {
    query,
    keywords: uniqueKeywords.length > 0 ? uniqueKeywords : [query],
    context,
    source: "fallback",
  };
}

export async function suggestBlockKeyframeSearchQuery(input: {
  project: Pick<
    Project,
    "storyDescription" | "genre" | "visualStyle" | "styleBible"
  >;
  block: StoryBlock;
  blocks: StoryBlock[];
  llmModel: string;
}): Promise<BlockKeyframeSearchSuggestion> {
  const context = buildBlockKeyframeSearchContext(input.project, input.block, input.blocks);
  const hasSignal =
    context.narrativeText.trim().length > 10 ||
    context.visualPrompt.trim().length > 10 ||
    Boolean(context.location) ||
    context.storyDescription.trim().length > 20;

  if (!hasSignal) {
    return fallbackBlockKeyframeSearchSuggestion(context);
  }

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildBlockKeyframeSearchSystemPrompt() },
        {
          role: "user",
          content: buildBlockKeyframeSearchUserPrompt({
            storyDescription: context.storyDescription,
            genre: context.genre,
            visualStyle: context.visualStyle,
            editorialLine: context.editorialLine,
            location: context.location,
            segmentType: context.segmentType,
            narrativeText: context.narrativeText,
            visualPrompt: context.visualPrompt,
            neighborHint: context.neighborHint,
            isPauseBlock: context.isPauseBlock,
          }),
        },
      ],
      model: input.llmModel,
      temperature: 0.25,
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ query?: unknown; keywords?: unknown }>(raw);
    const query =
      typeof parsed.query === "string" && parsed.query.trim().length > 2
        ? parsed.query.trim().slice(0, 120)
        : "";
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 1)
          .map((k) => k.trim().slice(0, 80))
          .slice(0, 5)
      : [];

    if (!query) {
      return fallbackBlockKeyframeSearchSuggestion(context);
    }

    const mergedKeywords = [
      query,
      ...keywords.filter((k) => k.toLowerCase() !== query.toLowerCase()),
    ].slice(0, 5);

    return {
      query,
      keywords: mergedKeywords,
      context,
      source: "llm",
    };
  } catch {
    return fallbackBlockKeyframeSearchSuggestion(context);
  }
}
