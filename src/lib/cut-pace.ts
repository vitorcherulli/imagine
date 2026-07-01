import type { LucideIcon } from "lucide-react";
import { Clapperboard, Gauge, Rabbit, Turtle } from "lucide-react";
import type { Project, StoryBlock } from "./db/schema";
import { isStoryBlockPause } from "@/lib/script-pause";

export type CutPaceId = "calm" | "balanced" | "dynamic" | "hyper";
export type NarrationModeId = "continuous";

export const NARRATION_MODE_LABEL = "Continuous";

export interface CutPaceOption {
  id: CutPaceId;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const CUT_PACE_OPTIONS: CutPaceOption[] = [
  {
    id: "calm",
    label: "Calm",
    hint: "Longer shots, fewer cuts",
    icon: Turtle,
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "Standard editing pace",
    icon: Gauge,
  },
  {
    id: "dynamic",
    label: "Dynamic",
    hint: "More cuts, scenes change quickly",
    icon: Clapperboard,
  },
  {
    id: "hyper",
    label: "Hyper",
    hint: "Many cuts, Reels/TikTok style",
    icon: Rabbit,
  },
];

export interface CutPaceSpec {
  visualMin: number;
  visualMax: number;
  continuousCutMin: number;
  continuousCutMax: number;
  cutsPerUnitMin: number;
  cutsPerUnitMax: number;
  blockDivisor: number;
}

const SPECS: Record<CutPaceId, CutPaceSpec> = {
  calm: {
    visualMin: 8,
    visualMax: 10,
    continuousCutMin: 5,
    continuousCutMax: 8,
    cutsPerUnitMin: 1,
    cutsPerUnitMax: 2,
    blockDivisor: 9,
  },
  balanced: {
    visualMin: 6,
    visualMax: 10,
    continuousCutMin: 4,
    continuousCutMax: 6,
    cutsPerUnitMin: 2,
    cutsPerUnitMax: 3,
    blockDivisor: 8,
  },
  dynamic: {
    visualMin: 4,
    visualMax: 6,
    continuousCutMin: 2,
    continuousCutMax: 4,
    cutsPerUnitMin: 3,
    cutsPerUnitMax: 5,
    blockDivisor: 5,
  },
  hyper: {
    visualMin: 2,
    visualMax: 4,
    continuousCutMin: 1,
    continuousCutMax: 3,
    cutsPerUnitMin: 4,
    cutsPerUnitMax: 7,
    blockDivisor: 3,
  },
};

export function normalizeCutPace(value: string | null | undefined): CutPaceId {
  if (value && value in SPECS) return value as CutPaceId;
  return "balanced";
}

export function normalizeNarrationMode(_value: string | null | undefined): NarrationModeId {
  return "continuous";
}

export function getCutPaceSpec(cutPace: string | null | undefined): CutPaceSpec {
  return SPECS[normalizeCutPace(cutPace)];
}

export function clampVisualDuration(seconds: number, cutPace: string | null | undefined): number {
  const spec = getCutPaceSpec(cutPace);
  return Math.min(spec.visualMax, Math.max(spec.visualMin, Math.round(seconds)));
}

export function clampContinuousCutDuration(
  seconds: number,
  cutPace: string | null | undefined,
): number {
  const spec = getCutPaceSpec(cutPace);
  return Math.min(spec.continuousCutMax, Math.max(spec.continuousCutMin, Math.round(seconds)));
}

export function estimatedBlockCount(
  targetSeconds: number,
  cutPace: string | null | undefined,
  _narrationMode?: string | null | undefined,
): number {
  const spec = getCutPaceSpec(cutPace);
  const units = Math.max(3, Math.ceil(targetSeconds / 12));
  const cutsPerUnit = Math.round((spec.cutsPerUnitMin + spec.cutsPerUnitMax) / 2);
  return Math.min(40, units * cutsPerUnit);
}

export function buildCutPacePromptLines(
  project: Pick<Project, "cutPace" | "narrationMode" | "targetDurationSeconds">,
): string[] {
  const pace = normalizeCutPace(project.cutPace);
  const spec = getCutPaceSpec(pace);
  const estBlocks = estimatedBlockCount(project.targetDurationSeconds, pace);
  const lines = [
    `Cut pace: ${pace} — visual shots should feel ${pace === "calm" ? "lingering and cinematic" : pace === "hyper" ? "fast, punchy and social-native" : pace === "dynamic" ? "energetic with frequent scene changes" : "balanced"}.`,
    "Narration mode: continuous.",
    `- Output a flat "blocks" array where consecutive blocks may share a narrationGroupId (e.g. "n1", "n2").`,
    `- Only the FIRST block in each narrationGroupId has narrativeText (8–14 seconds of voice-over when spoken).`,
    `- Subsequent blocks in the same group have narrativeText as "" (empty) — visual cuts only.`,
    `- Visual-cut durationSeconds MUST be between ${spec.continuousCutMin} and ${spec.continuousCutMax} seconds.`,
    `- Each narration group needs ${spec.cutsPerUnitMin}–${spec.cutsPerUnitMax} visual cuts.`,
    `- Aim for ~${estBlocks} total blocks (visual cuts) across ~${Math.ceil(estBlocks / ((spec.cutsPerUnitMin + spec.cutsPerUnitMax) / 2))} narration groups.`,
    `- The group's visual cuts should vary angle, framing or micro-action while the narration plays continuously.`,
    "- Total durationSeconds across all blocks must be within ±10% of target_total_duration_seconds.",
    "- Exactly one 'intro', one 'climax', one 'resolution' segmentType across the whole film (assign to narration leads in continuous mode).",
  ];

  return lines;
}

export function isVisualCutOnly(block: Pick<StoryBlock, "narrationGroupId" | "narrativeText">): boolean {
  return !!block.narrationGroupId?.trim() && !block.narrativeText.trim();
}

export function blockRequiresNarrationAudio(
  block: Pick<StoryBlock, "narrationGroupId" | "narrativeText">,
): boolean {
  return block.narrativeText.trim().length > 0;
}

export interface NarrationPlayback {
  lead: StoryBlock;
  audioOffset: number;
  groupStartTime: number;
  groupDuration: number;
}

export function getBlockStartTime(blocks: StoryBlock[], blockId: string): number {
  let elapsed = 0;
  for (const block of blocks) {
    if (block.id === blockId) return elapsed;
    elapsed += block.durationSeconds;
  }
  return elapsed;
}

export function resolveNarrationPlayback(
  blocks: StoryBlock[],
  activeBlock: StoryBlock | null,
): NarrationPlayback | null {
  if (!activeBlock || isStoryBlockPause(activeBlock)) return null;

  const groupId = activeBlock.narrationGroupId?.trim();
  if (groupId) {
    const group = blocks
      .filter((b) => b.narrationGroupId === groupId)
      .sort((a, b) => a.position - b.position);
    const lead = group.find((b) => b.narrativeText.trim()) ?? group[0];
    if (!lead) return null;
    const idx = group.findIndex((b) => b.id === activeBlock.id);
    const audioOffset = group.slice(0, Math.max(0, idx)).reduce((s, b) => s + b.durationSeconds, 0);
    const groupDuration = group.reduce((s, b) => s + b.durationSeconds, 0);
    return {
      lead,
      audioOffset,
      groupStartTime: getBlockStartTime(blocks, group[0]!.id),
      groupDuration,
    };
  }

  if (activeBlock.narrativeText.trim() || activeBlock.audioUrl) {
    return {
      lead: activeBlock,
      audioOffset: 0,
      groupStartTime: getBlockStartTime(blocks, activeBlock.id),
      groupDuration: activeBlock.durationSeconds,
    };
  }

  return null;
}

export function buildCaptionTimelineBlocks(
  blocks: StoryBlock[],
  segmentDurations: number[],
): Array<{ narrativeText: string; durationSeconds: number }> {
  const result: Array<{ narrativeText: string; durationSeconds: number }> = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    const groupId = block.narrationGroupId?.trim();
    if (groupId) {
      const group: StoryBlock[] = [];
      let duration = 0;
      while (i < blocks.length && blocks[i]?.narrationGroupId === groupId) {
        group.push(blocks[i]!);
        duration += segmentDurations[i] ?? blocks[i]!.durationSeconds;
        i += 1;
      }
      const lead = group.find((b) => b.narrativeText.trim()) ?? group[0];
      result.push({ narrativeText: lead?.narrativeText ?? "", durationSeconds: duration });
    } else {
      result.push({
        narrativeText: block.narrativeText,
        durationSeconds: segmentDurations[i] ?? block.durationSeconds,
      });
      i += 1;
    }
  }
  return result;
}

export interface ExportAudioPlan {
  audioPath: string;
  audioTrimStart: number;
  needsAudio: boolean;
}

export function planExportAudio(
  blocks: StoryBlock[],
  block: StoryBlock,
): ExportAudioPlan | null {
  if (!blockRequiresNarrationAudio(block) && block.narrationGroupId) {
    const playback = resolveNarrationPlayback(blocks, block);
    if (!playback?.lead.audioUrl) return null;
    return {
      audioPath: playback.lead.audioUrl,
      audioTrimStart: playback.audioOffset,
      needsAudio: true,
    };
  }

  if (block.audioUrl) {
    return { audioPath: block.audioUrl, audioTrimStart: 0, needsAudio: true };
  }

  const playback = resolveNarrationPlayback(blocks, block);
  if (playback?.lead.audioUrl) {
    return {
      audioPath: playback.lead.audioUrl,
      audioTrimStart: playback.audioOffset,
      needsAudio: true,
    };
  }

  return null;
}
