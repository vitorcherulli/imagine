import type { ScriptApplyBlock } from "./script-prompts";
import { clampContinuousCutDuration } from "./cut-pace";
import { PAUSE_VISUAL_PROMPT } from "@/lib/script-pause";
import {
  countWords,
  DEFAULT_WORDS_PER_MINUTE,
  paragraphImageSearchForSpeech,
  parseScriptNarrationSegments,
  type ScriptDraftNotes,
  type ScriptKeywordImageMatch,
} from "./script-studio";
import {
  narrationClipForSpeechIndex,
  scriptParagraphTextKey,
  speechIndexFromNarrationGroupId,
} from "./script-narration-utils";
import type { ScriptParagraphNarrationClip } from "./script-studio";

function visualPromptForKeyword(keyword: ScriptKeywordImageMatch): string {
  const selected =
    keyword.results.find((r) => r.id === keyword.selectedId) ?? keyword.results[0];
  const detail = selected?.sourceTitle?.trim() || keyword.keyword;
  return `Documentary reference — ${keyword.keyword}. ${detail}`.slice(0, 400);
}

function collectGroupBlocks(
  blocks: ScriptApplyBlock[],
  startIndex: number,
  groupId: string,
): { groupBlocks: ScriptApplyBlock[]; nextIndex: number } {
  const groupBlocks: ScriptApplyBlock[] = [];
  let i = startIndex;
  while (i < blocks.length && blocks[i]!.narrationGroupId === groupId) {
    groupBlocks.push(blocks[i]!);
    i += 1;
  }
  return { groupBlocks, nextIndex: i };
}

function rebuildGroupForImportedImages(input: {
  groupId: string;
  groupBlocks: ScriptApplyBlock[];
  speechIndex: number;
  notes: ScriptDraftNotes;
  cutPace: string | null | undefined;
  paragraphClips?: ScriptParagraphNarrationClip[];
}): ScriptApplyBlock[] {
  const imageEntry = paragraphImageSearchForSpeech(input.notes, input.speechIndex);
  const importedKeywords =
    imageEntry?.keywords.filter((kw) => Boolean(kw.importedUrl?.trim())) ?? [];
  const wantCount = Math.max(1, importedKeywords.length);

  const lead =
    input.groupBlocks.find((b) => b.narrativeText.trim()) ?? input.groupBlocks[0]!;
  const clip =
    lead.narrativeText.trim() && input.paragraphClips
      ? narrationClipForSpeechIndex(
          input.paragraphClips,
          input.speechIndex,
          scriptParagraphTextKey(lead.narrativeText),
        )
      : null;
  const totalDuration = clip
    ? Math.max(4, Math.ceil(clip.durationSeconds))
    : Math.max(
        4,
        input.groupBlocks.reduce((sum, block) => sum + block.durationSeconds, 0),
      );

  const baseCut = clampContinuousCutDuration(
    Math.round(totalDuration / wantCount),
    input.cutPace,
  );

  const out: ScriptApplyBlock[] = [];
  let remaining = totalDuration;

  for (let visualIndex = 0; visualIndex < wantCount; visualIndex += 1) {
    const isLead = visualIndex === 0;
    const isLast = visualIndex === wantCount - 1;
    const durationSeconds = isLast ? remaining : Math.min(remaining - 1, baseCut);
    remaining -= durationSeconds;

    const keyword = importedKeywords[visualIndex];
    out.push({
      narrativeText: isLead ? lead.narrativeText : "",
      visualPrompt: keyword
        ? visualPromptForKeyword(keyword)
        : lead.visualPrompt ||
          `Visual cut ${visualIndex + 1} — cinematic B-roll matching the narration.`,
      durationSeconds: Math.max(1, durationSeconds),
      segmentType: isLead ? lead.segmentType : "development",
      narrationGroupId: input.groupId,
      locationTag: lead.locationTag ?? null,
      characterName: lead.characterName ?? null,
    });
  }

  return out;
}

/**
 * Continuous narration: one visual block per imported reference photo,
 * all sharing the same narrationGroupId (n1, n2, …).
 */
export function expandBlocksForImportedImages(
  blocks: ScriptApplyBlock[],
  notes: ScriptDraftNotes,
  cutPace: string | null | undefined,
  paragraphClips?: ScriptParagraphNarrationClip[],
): ScriptApplyBlock[] {
  const hasImported = (notes.paragraphImages ?? []).some((entry) =>
    entry.keywords.some((kw) => Boolean(kw.importedUrl?.trim())),
  );
  if (!hasImported || blocks.length === 0) return blocks;

  const result: ScriptApplyBlock[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index]!;
    const groupId = block.narrationGroupId;
    const speechIndex = speechIndexFromNarrationGroupId(groupId);
    const { groupBlocks, nextIndex } = collectGroupBlocks(blocks, index, groupId);

    if (speechIndex === null) {
      result.push(...groupBlocks);
      index = nextIndex;
      continue;
    }

    const importedCount =
      paragraphImageSearchForSpeech(notes, speechIndex)?.keywords.filter((kw) =>
        Boolean(kw.importedUrl?.trim()),
      ).length ?? 0;

    if (importedCount === 0) {
      result.push(...groupBlocks);
      index = nextIndex;
      continue;
    }

    result.push(
      ...rebuildGroupForImportedImages({
        groupId,
        groupBlocks,
        speechIndex,
        notes,
        cutPace,
        paragraphClips,
      }),
    );
    index = nextIndex;
  }

  return result;
}

export function importedImageCountsBySpeechIndex(
  notes: ScriptDraftNotes,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of notes.paragraphImages ?? []) {
    if (entry.pauseIndex !== undefined || entry.speechIndex === undefined) continue;
    const n = entry.keywords.filter((kw) => Boolean(kw.importedUrl?.trim())).length;
    if (n > 0) counts.set(entry.speechIndex, n);
  }
  return counts;
}

export function hasImportedReferenceImages(notes: ScriptDraftNotes): boolean {
  return importedImageCountsBySpeechIndex(notes).size > 0;
}

/**
 * Build storyboard blocks directly from script paragraphs + imported photos.
 * Skips the LLM so each speech paragraph keeps one narrationGroupId (n1, n2…)
 * with N visual cuts when N reference photos were imported.
 */
export function buildDeterministicApplyBlocks(
  script: string,
  notes: ScriptDraftNotes,
  cutPace: string | null | undefined,
  paragraphClips?: ScriptParagraphNarrationClip[],
): ScriptApplyBlock[] {
  const segments = parseScriptNarrationSegments(script);
  const speechCount = segments.filter((segment) => segment.kind === "speech").length;
  if (speechCount === 0) return [];

  const blocks: ScriptApplyBlock[] = [];
  let speechIndex = 0;
  let pauseIndex = 0;
  let narrationIndex = 0;

  for (const segment of segments) {
    if (segment.kind === "section") {
      continue;
    }

    if (segment.kind === "pause") {
      pauseIndex += 1;
      blocks.push({
        narrativeText: "",
        visualPrompt: PAUSE_VISUAL_PROMPT,
        durationSeconds: Math.max(1, Math.round(segment.pauseSeconds)),
        segmentType: "development",
        narrationGroupId: `pause${pauseIndex}`,
        locationTag: null,
        characterName: null,
      });
      continue;
    }

    narrationIndex += 1;
    const groupId = `n${narrationIndex}`;
    const importedCount =
      paragraphImageSearchForSpeech(notes, speechIndex)?.keywords.filter((kw) =>
        Boolean(kw.importedUrl?.trim()),
      ).length ?? 0;

    const segmentType =
      speechIndex === 0
        ? "intro"
        : speechIndex === speechCount - 1
          ? "resolution"
          : "development";

    const leadBlock: ScriptApplyBlock = {
      narrativeText: segment.text,
      visualPrompt: "",
      durationSeconds: Math.max(
        4,
        Math.round((countWords(segment.text) / DEFAULT_WORDS_PER_MINUTE) * 60),
      ),
      segmentType,
      narrationGroupId: groupId,
      locationTag: null,
      characterName: null,
    };

    if (importedCount > 0) {
      blocks.push(
        ...rebuildGroupForImportedImages({
          groupId,
          groupBlocks: [leadBlock],
          speechIndex,
          notes,
          cutPace,
          paragraphClips,
        }),
      );
    } else {
      blocks.push(leadBlock);
    }

    speechIndex += 1;
  }

  return blocks;
}
