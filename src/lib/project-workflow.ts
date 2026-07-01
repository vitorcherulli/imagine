import type { Project, StoryBlock, YoutubeMetadata } from "./db/schema";
import { blockRequiresNarrationAudio } from "./cut-pace";
import { parsePauseSecondsFromBlock } from "./script-pause";
import { countPronunciationHintsInScript } from "./script-pronunciation";
import {
  keywordMatchIsVideo,
  normalizeScriptDraftStatus,
  type ScriptDraftNotes,
  type ScriptDraftStatus,
} from "./script-studio";
import { listScriptSpeechParagraphs, narrationClipForSpeechIndex } from "./script-narration-utils";

export type ProjectWorkflowStepId =
  | "project"
  | "script"
  | "pronunciation"
  | "music_pauses"
  | "media"
  | "narration"
  | "timeline"
  | "edit"
  | "youtube"
  | "export";

export type ProjectWorkflowStepStatus = "complete" | "current" | "pending";

export type ProjectWorkflowAction =
  | { type: "view"; view: "script" | "timeline" }
  | { type: "script_section"; sectionId: string }
  | { type: "youtube" }
  | { type: "export_hint" };

export interface ProjectWorkflowStep {
  id: ProjectWorkflowStepId;
  label: string;
  shortLabel: string;
  description: string;
  status: ProjectWorkflowStepStatus;
  action: ProjectWorkflowAction;
  detail?: string;
}

export interface ProjectWorkflowState {
  steps: ProjectWorkflowStep[];
  completedCount: number;
  currentStepId: ProjectWorkflowStepId | null;
  progressPercent: number;
}

function scriptHasPauseMarkers(script: string): boolean {
  return script
    .split(/\n{2,}/)
    .some((block) => parsePauseSecondsFromBlock(block) != null);
}

function countImportedScriptMedia(notes: ScriptDraftNotes): {
  photos: number;
  videos: number;
} {
  let photos = 0;
  let videos = 0;
  for (const entry of notes.paragraphImages ?? []) {
    for (const kw of entry.keywords) {
      if (!kw.importedUrl?.trim()) continue;
      if (keywordMatchIsVideo(kw)) videos += 1;
      else photos += 1;
    }
  }
  return { photos, videos };
}

function narrationProgress(script: string, notes: ScriptDraftNotes): {
  ready: number;
  total: number;
} {
  const paragraphs = listScriptSpeechParagraphs(script);
  const clips = notes.paragraphNarration ?? [];
  let ready = 0;
  for (const paragraph of paragraphs) {
    const clip = narrationClipForSpeechIndex(clips, paragraph.speechIndex, paragraph.textKey);
    if (clip?.audioUrl?.trim()) ready += 1;
  }
  return { ready, total: paragraphs.length };
}

function hasYoutubePackage(metadata: Pick<
  YoutubeMetadata,
  "thumbnailUrl" | "selectedTitle" | "description"
> | null | undefined): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.thumbnailUrl?.trim() ||
      metadata.selectedTitle?.trim() ||
      metadata.description?.trim(),
  );
}

function timelineEditReady(blocks: StoryBlock[]): boolean {
  if (blocks.length === 0) return false;
  const speechGroupsNeedingAudio = new Set<string>();
  for (const block of blocks) {
    if (!blockRequiresNarrationAudio(block)) continue;
    const groupId = block.narrationGroupId?.trim();
    if (groupId) speechGroupsNeedingAudio.add(groupId);
  }
  for (const groupId of speechGroupsNeedingAudio) {
    const lead =
      blocks.find(
        (block) =>
          block.narrationGroupId?.trim() === groupId && block.narrativeText.trim(),
      ) ?? blocks.find((block) => block.narrationGroupId?.trim() === groupId);
    if (!lead?.audioUrl?.trim()) return false;
  }
  return true;
}

export function computeProjectWorkflow(input: {
  project: Pick<Project, "title" | "storyDescription">;
  scriptDraft: string;
  scriptStatus: ScriptDraftStatus;
  notes: ScriptDraftNotes;
  blocks: StoryBlock[];
  exportCount: number;
  youtubeMetadata?: Pick<
    YoutubeMetadata,
    "thumbnailUrl" | "selectedTitle" | "description"
  > | null;
}): ProjectWorkflowState {
  const script = input.scriptDraft.trim();
  const scriptStatus = normalizeScriptDraftStatus(input.scriptStatus);
  const pronunciationHints = countPronunciationHintsInScript(
    script,
    input.notes.pronunciation?.hints,
  );
  const hasPronunciation =
    pronunciationHints > 0 || (input.notes.pronunciation?.hints?.length ?? 0) > 0;
  const hasMusicPauses =
    (input.notes.musicPauses?.insertions?.length ?? 0) > 0 || scriptHasPauseMarkers(script);
  const importedMedia = countImportedScriptMedia(input.notes);
  const hasMedia = importedMedia.photos + importedMedia.videos > 0;
  const narration = narrationProgress(script, input.notes);
  const hasNarration =
    narration.total > 0
      ? narration.ready >= narration.total
      : (input.notes.paragraphNarration?.length ?? 0) > 0;
  const hasTimeline = input.blocks.length > 0;
  const timelineApplied = scriptStatus === "applied" || hasTimeline;
  const editReady = timelineEditReady(input.blocks);
  const hasYoutube = hasYoutubePackage(input.youtubeMetadata);
  const hasExport = input.exportCount > 0;

  const checks: Record<ProjectWorkflowStepId, boolean> = {
    project: true,
    script: script.length >= 80,
    pronunciation: hasPronunciation,
    music_pauses: hasMusicPauses,
    media: hasMedia,
    narration: hasNarration,
    timeline: timelineApplied,
    edit: editReady,
    youtube: hasYoutube,
    export: hasExport,
  };

  const definitions: Array<
    Omit<ProjectWorkflowStep, "status"> & { complete: boolean }
  > = [
    {
      id: "project",
      label: "Criar projeto",
      shortLabel: "Projeto",
      description: "Brief, formato e elenco definidos.",
      action: { type: "view", view: "script" },
      complete: checks.project,
      detail: input.project.title,
    },
    {
      id: "script",
      label: "Gerar roteiro",
      shortLabel: "Roteiro",
      description: "Escreva ou gere a narração no Script Studio.",
      action: { type: "script_section", sectionId: "source" },
      complete: checks.script,
      detail: script.length > 0 ? `${Math.round(script.length / 5)} palavras` : undefined,
    },
    {
      id: "pronunciation",
      label: "Pronúncia",
      shortLabel: "Pronúncia",
      description: "Analise termos difíceis e fixe a fala do locutor.",
      action: { type: "script_section", sectionId: "pronunciation" },
      complete: checks.pronunciation,
      detail: hasPronunciation ? `${pronunciationHints || input.notes.pronunciation?.hints?.length} termo(s)` : undefined,
    },
    {
      id: "music_pauses",
      label: "Pausas de música",
      shortLabel: "Pausas",
      description: "Marque respiros musicais entre trechos da narração.",
      action: { type: "script_section", sectionId: "pauses" },
      complete: checks.music_pauses,
      detail: hasMusicPauses
        ? `${input.notes.musicPauses?.insertions?.length ?? 0} pausa(s)`
        : undefined,
    },
    {
      id: "media",
      label: "Fotos e vídeos",
      shortLabel: "Mídia",
      description: "Importe referências por parágrafo (web, IA ou stock).",
      action: { type: "script_section", sectionId: "reference-images" },
      complete: checks.media,
      detail: hasMedia
        ? `${importedMedia.photos} foto(s) · ${importedMedia.videos} vídeo(s)`
        : undefined,
    },
    {
      id: "narration",
      label: "Narração e entrega",
      shortLabel: "Narração",
      description: "Grave a voz por parágrafo e ajuste ênfase de fala.",
      action: { type: "script_section", sectionId: "delivery" },
      complete: checks.narration,
      detail:
        narration.total > 0
          ? `${narration.ready}/${narration.total} parágrafo(s)`
          : undefined,
    },
    {
      id: "timeline",
      label: "Aplicar na timeline",
      shortLabel: "Timeline",
      description: "Envie roteiro, mídia e áudio para os blocos do vídeo.",
      action: { type: "script_section", sectionId: "actions" },
      complete: checks.timeline,
      detail: hasTimeline ? `${input.blocks.length} bloco(s)` : undefined,
    },
    {
      id: "edit",
      label: "Conferir edição",
      shortLabel: "Edição",
      description: "Keyframes, vídeos, áudio e cortes alinhados na timeline.",
      action: { type: "view", view: "timeline" },
      complete: checks.edit,
      detail: hasTimeline ? `${input.blocks.filter((b) => b.videoUrl).length}/${input.blocks.length} com vídeo` : undefined,
    },
    {
      id: "youtube",
      label: "Capa e metadados",
      shortLabel: "YouTube",
      description: "Thumbnail, título e descrição para publicar.",
      action: { type: "youtube" },
      complete: checks.youtube,
    },
    {
      id: "export",
      label: "Exportar vídeo",
      shortLabel: "Export",
      description: "Render final em MP4 quando todos os blocos estiverem prontos.",
      action: { type: "export_hint" },
      complete: checks.export,
      detail: hasExport ? `${input.exportCount} export(s)` : undefined,
    },
  ];

  const firstIncomplete = definitions.find((step) => !step.complete);
  const currentStepId = firstIncomplete?.id ?? definitions[definitions.length - 1]!.id;

  const steps: ProjectWorkflowStep[] = definitions.map((step) => ({
    id: step.id,
    label: step.label,
    shortLabel: step.shortLabel,
    description: step.description,
    action: step.action,
    detail: step.detail,
    status: step.complete
      ? "complete"
      : step.id === currentStepId
        ? "current"
        : "pending",
  }));

  const completedCount = steps.filter((step) => step.status === "complete").length;

  return {
    steps,
    completedCount,
    currentStepId,
    progressPercent: Math.round((completedCount / steps.length) * 100),
  };
}
