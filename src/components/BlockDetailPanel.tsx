"use client";

import * as React from "react";
import {
  Loader2,
  Image as ImageIcon,
  Film,
  AudioLines,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronRight,
  Waves,
  Settings2,
  FileText,
  Volume2,
  Clock,
  UserRound,
  Link2,
  Unlink,
  FolderOpen,
  Clapperboard,
  Globe2,
  Repeat,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import type { Block, SegmentType } from "@/components/timeline/types";
import {
  avatarSelectValue,
  SEGMENT_DOT_CLASSES,
  SEGMENT_TYPES,
} from "@/components/timeline/types";
import type { Avatar } from "@/lib/db/schema";
import { getVideoFormatSpec, type VideoFormat } from "@/lib/video-format";
import { AvatarThumb } from "@/components/AvatarCastPicker";
import type { BlockMediaField } from "@/lib/block-media";
import { isVisualCutOnly } from "@/lib/cut-pace";
import {
  canLeaveNarrationGroup,
  describeSpeechNarrationGroup,
  listJoinableNarrationTargets,
  type NarrationJoinPlacement,
} from "@/lib/narration-group-reorder";
import {
  normalizeVideoShotCount,
  VIDEO_SHOT_COUNT_OPTIONS,
  videoShotCountLabel,
} from "@/lib/video-shot-prompt";
import {
  KEYFRAME_FIT_OPTIONS,
  normalizeKeyframeFitMode,
  type KeyframeFitMode,
} from "@/lib/keyframe-fit";
import { MediaLibraryPickerDialog } from "@/components/MediaLibraryPickerDialog";
import { formatBlockOpenRouterCost } from "@/components/VideoModelCostHint";
import { ReferenceImageImportDialog } from "@/components/ReferenceImageImportDialog";
import { ReferenceVideoImportDialog } from "@/components/ReferenceVideoImportDialog";
import type { ImageSearchResult } from "@/lib/image-search";
import type { VideoSearchResult } from "@/lib/video-search";
import type { BlockVideoDurationAlert } from "@/lib/video-duration-mismatch";
import {
  canStretchVideoWithSlowMotion,
  formatVideoShortLabel,
  slowMotionSpeedLabel,
  videoShortTooltip,
  type VideoRefitMode,
} from "@/lib/video-duration-mismatch";

interface Props {
  block: Block | null;
  blocks?: Block[];
  projectId: string;
  avatars: Avatar[];
  projectAvatarId: string | null;
  projectAvatarName?: string | null;
  videoFormat?: VideoFormat | string | null;
  onPatched: (
    id: string,
    patch: Partial<Block>,
    options?: { recordHistory?: boolean },
  ) => void;
  onRemoved: (id: string) => void;
  onDeleteBlock?: (id: string) => Promise<void>;
  onJoinNarration?: (
    blockId: string,
    groupId: string,
    placement: NarrationJoinPlacement,
  ) => void;
  onLeaveNarrationGroup?: (blockId: string) => void;
  /** When true, collapse the side panel to give the timeline full width. */
  timelineExpanded?: boolean;
  videoShortAlert?: BlockVideoDurationAlert | null;
  videoDurationAlerts?: Record<string, BlockVideoDurationAlert>;
}

function characterChoiceLabel(
  choice: string,
  avatars: Avatar[],
  projectAvatarName?: string | null,
): string {
  if (choice === "__inherit__") {
    return `Project default${projectAvatarName ? ` (${projectAvatarName})` : ""}`;
  }
  if (choice === "__none__") return "No character";
  return avatars.find((a) => a.id === choice)?.name ?? "Character";
}

function characterChoiceThumb(
  choice: string,
  avatars: Avatar[],
  projectAvatarId: string | null,
): { imageUrl: string | null; name?: string; fallback: "avatar" | "none" | "inherit" } {
  if (choice === "__inherit__") {
    const projectAvatar = projectAvatarId
      ? avatars.find((a) => a.id === projectAvatarId)
      : undefined;
    return {
      imageUrl: projectAvatar?.primaryImageUrl ?? null,
      name: projectAvatar?.name,
      fallback: "inherit",
    };
  }
  if (choice === "__none__") {
    return { imageUrl: null, name: "No character", fallback: "none" };
  }
  const avatar = avatars.find((a) => a.id === choice);
  return {
    imageUrl: avatar?.primaryImageUrl ?? null,
    name: avatar?.name,
    fallback: "avatar",
  };
}

type BlockPanelSectionId =
  | "setup"
  | "narration-group"
  | "content"
  | "media";

interface BlockPanelRailItem {
  id: BlockPanelSectionId;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  indicator?: "dirty" | "generating" | "error";
}

export type BlockProcessStatus = {
  kind: "busy" | "error";
  message: string;
  shortLabel: string;
};

export function getBlockProcessStatus(block: Block | null): BlockProcessStatus | null {
  if (!block) return null;
  if (block.status === "error") {
    return {
      kind: "error",
      message: block.errorMessage ?? "Generation failed",
      shortLabel: "Error",
    };
  }
  const message =
    block.status === "video_generating"
      ? "Generating video…"
      : block.status === "image_generating"
        ? "Generating keyframe…"
        : block.status === "audio_generating"
          ? "Generating narration…"
          : block.status === "generating"
            ? "Generating all media…"
            : null;
  if (!message) return null;
  const shortLabel =
    block.status === "video_generating"
      ? "Video…"
      : block.status === "image_generating"
        ? "Image…"
        : block.status === "audio_generating"
          ? "Audio…"
          : "Media…";
  return { kind: "busy", message, shortLabel };
}

export function BlockProcessStatusBanner({
  status,
  label,
}: {
  status: BlockProcessStatus;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-2.5 py-2 text-[10px] leading-snug",
        status.kind === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-warning/30 bg-warning/10 text-warning",
      )}
      role="status"
    >
      {status.kind === "error" ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      )}
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {label ? <span className="font-semibold">{label} · </span> : null}
        {status.message}
      </p>
    </div>
  );
}

function BlockPanelCollapsedRail({
  block,
  sections,
  activeSectionId,
  onOpenSection,
}: {
  block: Block | null;
  sections: BlockPanelRailItem[];
  activeSectionId: BlockPanelSectionId | null;
  onOpenSection: (sectionId: BlockPanelSectionId) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1 pb-2 pt-1 scrollbar-thin">
      {block ? (
        <span
          className="mb-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground"
          title={`Block #${block.position + 1}`}
        >
          {block.position + 1}
        </span>
      ) : null}
      {sections.map((section) => {
        const active = activeSectionId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            title={section.hint ? `${section.title} · ${section.hint}` : section.title}
            disabled={!block}
            onClick={() => onOpenSection(section.id)}
            className={cn(
              "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:text-muted-foreground",
              block && "hover:bg-muted/35",
              active && "bg-accent/15 text-accent ring-1 ring-accent/35",
            )}
          >
            {section.icon}
            {section.indicator === "dirty" ? (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />
            ) : null}
            {section.indicator === "generating" ? (
              <Loader2 className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-spin text-warning" />
            ) : null}
            {section.indicator === "error" ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-1 ring-background" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function BlockPanelFlyout({
  title,
  blockNumber,
  onClose,
  onDelete,
  children,
}: {
  title: string;
  blockNumber: number;
  onClose: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-border/50 shadow-2xl",
        "bg-panel/90 backdrop-blur-xl supports-[backdrop-filter]:bg-panel/75",
        "[html[data-theme=dark]_&]:bg-panel/80",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/50 bg-background/40 px-2.5 py-1.5 backdrop-blur-sm">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">#{blockNumber}</span>
        {onDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title="Delete block"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Close section"
          className="h-6 w-6 shrink-0"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2.5 scrollbar-thin">{children}</div>
    </div>
  );
}

export function BlockDetailPanel({
  block,
  blocks = [],
  projectId,
  avatars,
  projectAvatarId,
  projectAvatarName,
  videoFormat = "horizontal",
  onPatched,
  onRemoved,
  onDeleteBlock,
  onJoinNarration,
  onLeaveNarrationGroup,
  timelineExpanded = false,
  videoShortAlert = null,
  videoDurationAlerts = {},
}: Props) {
  const formatSpec = getVideoFormatSpec(videoFormat);
  const { toast } = useToast();
  const [narrativeText, setNarrativeText] = React.useState(block?.narrativeText ?? "");
  const [visualPrompt, setVisualPrompt] = React.useState(block?.visualPrompt ?? "");
  const [durationSeconds, setDurationSeconds] = React.useState(block?.durationSeconds ?? 8);
  const [segmentType, setSegmentType] = React.useState(block?.segmentType ?? "development");
  const [audioVolume, setAudioVolume] = React.useState(block?.audioVolume ?? 100);
  const [sceneAudioVolume, setSceneAudioVolume] = React.useState(
    block?.sceneAudioVolume ?? 60,
  );
  const [avatarChoice, setAvatarChoice] = React.useState(
    block ? avatarSelectValue(block) : "__inherit__",
  );
  const [saving, setSaving] = React.useState(false);
  const [savingVolume, setSavingVolume] = React.useState(false);
  const [savingSceneVolume, setSavingSceneVolume] = React.useState(false);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const [videoShotCount, setVideoShotCount] = React.useState(
    normalizeVideoShotCount(block?.videoShotCount),
  );
  const [savingVideoShots, setSavingVideoShots] = React.useState(false);
  const [keyframeFitMode, setKeyframeFitMode] = React.useState<KeyframeFitMode>(
    normalizeKeyframeFitMode(block?.keyframeFitMode),
  );
  const [savingKeyframeFit, setSavingKeyframeFit] = React.useState(false);
  const [uploadingKeyframe, setUploadingKeyframe] = React.useState(false);
  const [uploadingVideo, setUploadingVideo] = React.useState(false);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [videoGalleryOpen, setVideoGalleryOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [videoImportOpen, setVideoImportOpen] = React.useState(false);
  const [applyingGalleryKeyframe, setApplyingGalleryKeyframe] = React.useState(false);
  const [applyingGalleryVideo, setApplyingGalleryVideo] = React.useState(false);
  const [applyingImportKeyframe, setApplyingImportKeyframe] = React.useState(false);
  const [applyingImportVideo, setApplyingImportVideo] = React.useState(false);
  const [refittingVideo, setRefittingVideo] = React.useState(false);
  const [refittingAllVideos, setRefittingAllVideos] = React.useState(false);
  const [activeRailSection, setActiveRailSection] =
    React.useState<BlockPanelSectionId | null>(null);
  const [focusSectionId, setFocusSectionId] = React.useState<BlockPanelSectionId | null>(null);

  React.useEffect(() => {
    if (!timelineExpanded) return;
    setActiveRailSection(null);
  }, [timelineExpanded]);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef(false);
  const BLOCK_SAVE_MS = 600;
  const lastBlockIdRef = React.useRef<string | null>(block?.id ?? null);
  const lastServerRef = React.useRef<{
    narrativeText: string;
    visualPrompt: string;
    durationSeconds: number;
    segmentType: string;
    audioVolume: number;
    sceneAudioVolume: number;
    avatarChoice: string;
  } | null>(
    block
      ? {
          narrativeText: block.narrativeText,
          visualPrompt: block.visualPrompt,
          durationSeconds: block.durationSeconds,
          segmentType: block.segmentType,
          audioVolume: block.audioVolume ?? 100,
          sceneAudioVolume: block.sceneAudioVolume ?? 60,
          avatarChoice: avatarSelectValue(block),
        }
      : null,
  );

  // Reset all fields when switching blocks. While staying on the same block,
  // accept fresh server values for any field the user hasn't edited locally.
  React.useEffect(() => {
    if (!block) return;
    const isNewBlock = lastBlockIdRef.current !== block.id;
    const prev = lastServerRef.current;
    const next = {
      narrativeText: block.narrativeText,
      visualPrompt: block.visualPrompt,
      durationSeconds: block.durationSeconds,
      segmentType: block.segmentType,
      audioVolume: block.audioVolume ?? 100,
      sceneAudioVolume: block.sceneAudioVolume ?? 60,
      avatarChoice: avatarSelectValue(block),
    };

    if (isNewBlock) {
      if (lastBlockIdRef.current && prev) {
        const oldId = lastBlockIdRef.current;
        const oldDirty =
          narrativeText !== prev.narrativeText ||
          visualPrompt !== prev.visualPrompt ||
          durationSeconds !== prev.durationSeconds ||
          segmentType !== prev.segmentType;
        if (oldDirty) {
          void persistBlockFields(oldId, {
            narrativeText,
            visualPrompt,
            durationSeconds,
            segmentType,
          });
        }
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      lastBlockIdRef.current = block.id;
      setNarrativeText(next.narrativeText);
      setVisualPrompt(next.visualPrompt);
      setDurationSeconds(next.durationSeconds);
      setSegmentType(next.segmentType);
      setAudioVolume(next.audioVolume);
      setSceneAudioVolume(next.sceneAudioVolume);
      setAvatarChoice(next.avatarChoice);
      setVideoShotCount(normalizeVideoShotCount(block.videoShotCount));
      setKeyframeFitMode(normalizeKeyframeFitMode(block.keyframeFitMode));
    } else if (prev) {
      if (narrativeText === prev.narrativeText && next.narrativeText !== prev.narrativeText) {
        setNarrativeText(next.narrativeText);
      }
      if (visualPrompt === prev.visualPrompt && next.visualPrompt !== prev.visualPrompt) {
        setVisualPrompt(next.visualPrompt);
      }
      if (durationSeconds === prev.durationSeconds && next.durationSeconds !== prev.durationSeconds) {
        setDurationSeconds(next.durationSeconds);
      }
      if (segmentType === prev.segmentType && next.segmentType !== prev.segmentType) {
        setSegmentType(next.segmentType);
      }
      if (audioVolume === prev.audioVolume && next.audioVolume !== prev.audioVolume) {
        setAudioVolume(next.audioVolume);
      }
      if (
        sceneAudioVolume === prev.sceneAudioVolume &&
        next.sceneAudioVolume !== prev.sceneAudioVolume
      ) {
        setSceneAudioVolume(next.sceneAudioVolume);
      }
      if (avatarChoice === prev.avatarChoice && next.avatarChoice !== prev.avatarChoice) {
        setAvatarChoice(next.avatarChoice);
      }
      const serverShots = normalizeVideoShotCount(block.videoShotCount);
      if (!savingVideoShots && videoShotCount !== serverShots) {
        setVideoShotCount(serverShots);
      }
      const serverFit = normalizeKeyframeFitMode(block.keyframeFitMode);
      if (!savingKeyframeFit && keyframeFitMode !== serverFit) {
        setKeyframeFitMode(serverFit);
      }
    }

    lastServerRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    block?.id,
    block?.narrativeText,
    block?.visualPrompt,
    block?.durationSeconds,
    block?.segmentType,
    block?.audioVolume,
    block?.sceneAudioVolume,
    block?.avatarId,
    block?.characterName,
    block?.videoShotCount,
    block?.keyframeFitMode,
  ]);

  React.useEffect(() => {
    if (!block) return;
    const isDirty =
      narrativeText !== block.narrativeText ||
      visualPrompt !== block.visualPrompt ||
      durationSeconds !== block.durationSeconds ||
      segmentType !== block.segmentType;
    if (!isDirty) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const blockId = block.id;
    const fields = {
      narrativeText,
      visualPrompt,
      durationSeconds,
      segmentType,
    };
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      void (async () => {
        try {
          const res = await fetch(`/api/blocks/${blockId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
          onPatched(blockId, fields, { recordHistory: true });
          if (lastBlockIdRef.current === blockId) {
            lastServerRef.current = {
              ...fields,
              audioVolume,
              sceneAudioVolume,
              avatarChoice,
            };
          }
        } catch {
          // Silent auto-save — explicit save surfaces errors elsewhere.
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      })();
    }, BLOCK_SAVE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeText, visualPrompt, durationSeconds, segmentType, block?.id]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  function toggleRailSection(sectionId: BlockPanelSectionId) {
    if (!block) return;
    setActiveRailSection((prev) => (prev === sectionId ? null : sectionId));
  }

  const isVisualCut = block ? isVisualCutOnly(block) : false;
  const speechNarrationGroupId =
    block?.narrationGroupId?.trim() && /^n\d+$/.test(block.narrationGroupId.trim())
      ? block.narrationGroupId.trim()
      : null;
  const inSpeechNarrationGroup = isVisualCut && Boolean(speechNarrationGroupId);
  const joinNarrationTargets =
    onJoinNarration && block && isVisualCut
      ? listJoinableNarrationTargets(blocks, block.id)
      : [];
  const canLeaveSpeechNarration =
    Boolean(onLeaveNarrationGroup) && block ? canLeaveNarrationGroup(block) : false;
  const showNarrationGroupSection =
    Boolean(block) &&
    (inSpeechNarrationGroup || joinNarrationTargets.length > 0 || canLeaveSpeechNarration);

  React.useEffect(() => {
    if (!block) {
      setActiveRailSection(null);
      return;
    }
    setActiveRailSection((current) => {
      if (!current) return null;
      if (current === "narration-group" && !showNarrationGroupSection) return null;
      return current;
    });
  }, [block?.id, showNarrationGroupSection]);

  const dirty =
    Boolean(block) &&
    (narrativeText !== block!.narrativeText ||
      visualPrompt !== block!.visualPrompt ||
      durationSeconds !== block!.durationSeconds ||
      segmentType !== block!.segmentType);

  const mediaReadyCount = block
    ? [block.keyframeUrl, block.videoUrl, block.audioUrl, block.sceneAudioUrl].filter(Boolean)
        .length
    : 0;

  const generating =
    Boolean(block) &&
    (block!.status === "generating" || block!.status.endsWith("_generating"));

  const processStatus = getBlockProcessStatus(block);
  const lastErrorToastRef = React.useRef<string | null>(null);

  const allVideoShortAlerts = React.useMemo(
    () => Object.values(videoDurationAlerts),
    [videoDurationAlerts],
  );
  const slowMotionEligibleAlerts = React.useMemo(
    () =>
      allVideoShortAlerts.filter((alert) =>
        canStretchVideoWithSlowMotion(alert.sourceDurationSec, alert.blockDurationSec),
      ),
    [allVideoShortAlerts],
  );
  const blockById = React.useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  React.useEffect(() => {
    if (!block || block.status !== "error" || !block.errorMessage) return;
    const key = `${block.id}:${block.errorMessage}`;
    if (lastErrorToastRef.current === key) return;
    lastErrorToastRef.current = key;
    toast({
      variant: "destructive",
      title: `Block #${block.position + 1} failed`,
      description: block.errorMessage,
    });
  }, [block?.id, block?.status, block?.errorMessage, block?.position, toast]);

  const railSections = React.useMemo((): BlockPanelRailItem[] => {
    const items: BlockPanelRailItem[] = [
      {
        id: "setup",
        icon: <Settings2 className="h-4 w-4" />,
        title: "Setup",
        hint: block
          ? `${segmentType} · ${durationSeconds}s · ${audioVolume}% / ${sceneAudioVolume}%${
              videoShotCount > 1 ? ` · ${videoShotCountLabel(videoShotCount)}` : ""
            }`
          : undefined,
      },
    ];
    if (showNarrationGroupSection) {
      items.push({
        id: "narration-group",
        icon: <Link2 className="h-4 w-4" />,
        title: "Narration group",
      });
    }
    items.push(
      {
        id: "content",
        icon: <FileText className="h-4 w-4" />,
        title: "Script & visual",
        hint: dirty ? "Unsaved changes" : undefined,
        indicator: dirty ? "dirty" : undefined,
      },
      {
        id: "media",
        icon: <Film className="h-4 w-4" />,
        title: "Generated media",
        hint: block ? `${mediaReadyCount}/4 ready` : undefined,
        indicator:
          block?.status === "error"
            ? "error"
            : generating
              ? "generating"
              : undefined,
      },
    );
    return items;
  }, [
    showNarrationGroupSection,
    block,
    segmentType,
    durationSeconds,
    dirty,
    audioVolume,
    sceneAudioVolume,
    mediaReadyCount,
    generating,
    videoShotCount,
  ]);

  const activeRailSectionMeta = activeRailSection
    ? railSections.find((section) => section.id === activeRailSection)
    : null;
  const flyoutMode = Boolean(activeRailSection);

  const showSection = (sectionId: BlockPanelSectionId) =>
    !flyoutMode || activeRailSection === sectionId;

  async function persistBlockFields(
    blockId: string,
    fields: {
      narrativeText: string;
      visualPrompt: string;
      durationSeconds: number;
      segmentType: string;
    },
    options?: { silent?: boolean },
  ) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch(`/api/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(
        blockId,
        {
          narrativeText: fields.narrativeText,
          visualPrompt: fields.visualPrompt,
          durationSeconds: fields.durationSeconds,
          segmentType: fields.segmentType,
        },
        { recordHistory: true },
      );
      if (blockId === block?.id) {
        lastServerRef.current = {
          narrativeText: fields.narrativeText,
          visualPrompt: fields.visualPrompt,
          durationSeconds: fields.durationSeconds,
          segmentType: fields.segmentType,
          audioVolume: audioVolume,
          sceneAudioVolume: sceneAudioVolume,
          avatarChoice: avatarChoice,
        };
      }
    } catch (err) {
      if (!options?.silent) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function saveAvatarChoice(next: string) {
    if (!block) return;
    setAvatarChoice(next);
    setSavingAvatar(true);
    const avatarId = next === "__inherit__" ? null : next === "__none__" ? "__none__" : next;
    const matched = avatars.find((a) => a.id === avatarId);
    const characterName =
      avatarId && avatarId !== "__none__" ? (matched?.name ?? block.characterName) : null;
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, characterName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { avatarId, characterName }, { recordHistory: true });
      toast({
        variant: "success",
        title:
          avatarId === "__none__"
            ? "No character on this block"
            : matched
              ? `Character: ${matched.name}`
              : "Using project default character",
      });
    } catch (err) {
      setAvatarChoice(avatarSelectValue(block));
      toast({
        variant: "destructive",
        title: "Could not save character",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveVideoShotCount(next: number) {
    if (!block) return;
    const normalized = normalizeVideoShotCount(next);
    setVideoShotCount(normalized);
    setSavingVideoShots(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoShotCount: normalized }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { videoShotCount: normalized }, { recordHistory: true });
      toast({
        variant: "success",
        title:
          normalized > 1
            ? `Video: ${videoShotCountLabel(normalized)} on regenerate`
            : "Video: single continuous shot",
      });
    } catch (err) {
      setVideoShotCount(normalizeVideoShotCount(block.videoShotCount));
      toast({
        variant: "destructive",
        title: "Could not save video shots",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingVideoShots(false);
    }
  }

  async function saveKeyframeFitMode(next: KeyframeFitMode) {
    if (!block) return;
    const normalized = normalizeKeyframeFitMode(next);
    setKeyframeFitMode(normalized);
    setSavingKeyframeFit(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyframeFitMode: normalized }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { keyframeFitMode: normalized }, { recordHistory: true });
    } catch (err) {
      setKeyframeFitMode(normalizeKeyframeFitMode(block.keyframeFitMode));
      toast({
        variant: "destructive",
        title: "Could not save keyframe framing",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingKeyframeFit(false);
    }
  }

  async function saveAudioVolume(next: number) {
    if (!block) return;
    setAudioVolume(next);
    setSavingVolume(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioVolume: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { audioVolume: next });
    } catch (err) {
      setAudioVolume(block.audioVolume ?? 100);
      toast({
        variant: "destructive",
        title: "Could not save volume",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingVolume(false);
    }
  }

  async function saveSceneAudioVolume(next: number) {
    if (!block) return;
    setSceneAudioVolume(next);
    setSavingSceneVolume(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneAudioVolume: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onPatched(block.id, { sceneAudioVolume: next });
    } catch (err) {
      setSceneAudioVolume(block.sceneAudioVolume ?? 60);
      toast({
        variant: "destructive",
        title: "Could not save scene volume",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingSceneVolume(false);
    }
  }

  async function autoSaveBlockFields() {
    if (!block) return;
    const fields = {
      narrativeText,
      visualPrompt,
      durationSeconds,
      segmentType,
    };
    const isDirty =
      fields.narrativeText !== block.narrativeText ||
      fields.visualPrompt !== block.visualPrompt ||
      fields.durationSeconds !== block.durationSeconds ||
      fields.segmentType !== block.segmentType;
    if (!isDirty) return;
    await persistBlockFields(block.id, fields, { silent: true });
  }

  async function clearMedia(field: BlockMediaField) {
    if (!block) return;
    const labels: Record<BlockMediaField, string> = {
      keyframe: "keyframe image",
      video: "video",
      audio: "narration audio",
      sceneAudio: "scene audio",
    };
    if (!confirm(`Remove the ${labels[field]} from this block? The block will stay on the timeline.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/blocks/${block.id}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = (await res.json()) as { patch: Partial<Block> };
      onPatched(block.id, data.patch, { recordHistory: true });
      toast({ variant: "success", title: `${labels[field]} removed` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function uploadKeyframe(file: File) {
    if (!block) return;
    setUploadingKeyframe(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/api/blocks/${block.id}/keyframe/upload`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        keyframeUrl?: string;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onPatched(
        block.id,
        {
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          status: (data.status as Block["status"]) ?? "image_ready",
          errorMessage: null,
        },
        { recordHistory: true },
      );
      toast({ variant: "success", title: "Keyframe updated", description: "Your image is on the timeline." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUploadingKeyframe(false);
    }
  }

  async function applyKeyframeFromGallery(assetId: string) {
    if (!block) return;
    setApplyingGalleryKeyframe(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/keyframe/from-gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        keyframeUrl?: string;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onPatched(
        block.id,
        {
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          status: (data.status as Block["status"]) ?? "image_ready",
          errorMessage: null,
        },
        { recordHistory: true },
      );
      setGalleryOpen(false);
      toast({
        variant: "success",
        title: "Keyframe from gallery",
        description: "Image applied to this block.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not use gallery image",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setApplyingGalleryKeyframe(false);
    }
  }

  async function uploadVideo(file: File) {
    if (!block) return;
    setUploadingVideo(true);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch(`/api/blocks/${block.id}/video/upload`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        videoUrl?: string;
        keyframeUrl?: string | null;
        sceneAudioUrl?: string | null;
        durationSeconds?: number;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onPatched(
        block.id,
        {
          videoUrl: data.videoUrl ?? block.videoUrl,
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          sceneAudioUrl: data.sceneAudioUrl ?? null,
          durationSeconds: data.durationSeconds ?? block.durationSeconds,
          status: (data.status as Block["status"]) ?? "video_ready",
          errorMessage: null,
          videoJobId: null,
          videoPollingUrl: null,
          stockVideoId: null,
        },
        { recordHistory: true },
      );
      toast({
        variant: "success",
        title: "Video uploaded",
        description: "Your clip is trimmed to this block and on the timeline.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUploadingVideo(false);
    }
  }

  async function applyVideoFromGallery(assetId: string) {
    if (!block) return;
    setApplyingGalleryVideo(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/video/from-gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        videoUrl?: string;
        keyframeUrl?: string | null;
        sceneAudioUrl?: string | null;
        durationSeconds?: number;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onPatched(
        block.id,
        {
          videoUrl: data.videoUrl ?? block.videoUrl,
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          sceneAudioUrl: data.sceneAudioUrl ?? null,
          durationSeconds: data.durationSeconds ?? block.durationSeconds,
          status: (data.status as Block["status"]) ?? "video_ready",
          errorMessage: null,
          videoJobId: null,
          videoPollingUrl: null,
          stockVideoId: null,
        },
        { recordHistory: true },
      );
      setVideoGalleryOpen(false);
      toast({
        variant: "success",
        title: "Video from gallery",
        description: "Gallery clip applied to this block.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not use gallery video",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setApplyingGalleryVideo(false);
    }
  }

  async function applyVideoFromImport(result: VideoSearchResult) {
    if (!block) return;
    setApplyingImportVideo(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/video/from-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadUrl: result.downloadUrl,
          previewUrl: result.previewUrl,
          provider: result.provider,
          stockVideoId: result.id,
          name: result.sourceTitle ?? result.attribution ?? "Imported stock video",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        videoUrl?: string;
        keyframeUrl?: string | null;
        sceneAudioUrl?: string | null;
        durationSeconds?: number;
        status?: string;
        stockVideoId?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onPatched(
        block.id,
        {
          videoUrl: data.videoUrl ?? block.videoUrl,
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          sceneAudioUrl: data.sceneAudioUrl ?? null,
          durationSeconds: data.durationSeconds ?? block.durationSeconds,
          status: (data.status as Block["status"]) ?? "video_ready",
          errorMessage: null,
          videoJobId: null,
          videoPollingUrl: null,
          stockVideoId: data.stockVideoId ?? result.id,
        },
        { recordHistory: true },
      );
      setVideoImportOpen(false);
      toast({
        variant: "success",
        title: "Stock video imported",
        description: "Pexels clip trimmed to block duration and applied.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Video import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setApplyingImportVideo(false);
    }
  }

  async function refitVideoToBlock(mode: VideoRefitMode) {
    if (!block?.videoUrl?.trim()) return;
    setRefittingVideo(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/video/refit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        videoUrl?: string;
        sceneAudioUrl?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onPatched(
        block.id,
        {
          videoUrl: data.videoUrl ?? block.videoUrl,
          ...(data.sceneAudioUrl !== undefined ? { sceneAudioUrl: data.sceneAudioUrl } : {}),
          status: "video_ready",
          errorMessage: null,
        },
        { recordHistory: true },
      );
      toast({
        variant: "success",
        title: mode === "slow" ? "Vídeo em câmera lenta" : "Vídeo estendido",
        description:
          mode === "slow"
            ? "O clip foi desacelerado para cobrir a duração do bloco."
            : "O clip foi repetido em loop até cobrir a duração do bloco.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: mode === "slow" ? "Câmera lenta falhou" : "Não foi possível estender o vídeo",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRefittingVideo(false);
    }
  }

  async function refitAllVideosToBlock(mode: VideoRefitMode) {
    const targets =
      mode === "slow"
        ? slowMotionEligibleAlerts
        : allVideoShortAlerts;
    if (targets.length === 0) return;

    setRefittingAllVideos(true);
    let succeeded = 0;
    const failures: string[] = [];

    for (const alert of targets) {
      const targetBlock = blockById.get(alert.blockId);
      if (!targetBlock?.videoUrl?.trim()) continue;

      try {
        const res = await fetch(`/api/blocks/${alert.blockId}/video/refit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          videoUrl?: string;
          sceneAudioUrl?: string | null;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed");

        onPatched(
          alert.blockId,
          {
            videoUrl: data.videoUrl ?? targetBlock.videoUrl,
            ...(data.sceneAudioUrl !== undefined ? { sceneAudioUrl: data.sceneAudioUrl } : {}),
            status: "video_ready",
            errorMessage: null,
          },
          { recordHistory: true },
        );
        succeeded += 1;
      } catch (err) {
        const position = targetBlock.position + 1;
        failures.push(
          `#${position}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    if (succeeded > 0 && failures.length === 0) {
      toast({
        variant: "success",
        title:
          mode === "slow"
            ? `Câmera lenta em ${succeeded} bloco${succeeded === 1 ? "" : "s"}`
            : `Loop em ${succeeded} bloco${succeeded === 1 ? "" : "s"}`,
        description:
          mode === "slow"
            ? "Todos os clips elegíveis foram desacelerados para cobrir a duração do bloco."
            : "Todos os clips foram estendidos em loop até cobrir a duração do bloco.",
      });
    } else if (succeeded > 0) {
      toast({
        variant: "destructive",
        title: `${succeeded} de ${targets.length} blocos corrigidos`,
        description: failures.slice(0, 3).join(" · "),
      });
    } else {
      toast({
        variant: "destructive",
        title: mode === "slow" ? "Câmera lenta em massa falhou" : "Loop em massa falhou",
        description: failures.slice(0, 3).join(" · ") || "Nenhum bloco pôde ser corrigido.",
      });
    }

    setRefittingAllVideos(false);
  }

  async function applyKeyframeFromImport(result: ImageSearchResult) {
    if (!block) return;
    setApplyingImportKeyframe(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}/keyframe/from-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullUrl: result.fullUrl,
          previewUrl: result.previewUrl,
          sourceUrl: result.sourceUrl,
          provider: result.provider,
          name: result.sourceTitle ?? result.attribution ?? "Imported reference",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        keyframeUrl?: string;
        status?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onPatched(
        block.id,
        {
          keyframeUrl: data.keyframeUrl ?? block.keyframeUrl,
          status: (data.status as Block["status"]) ?? "image_ready",
          errorMessage: null,
        },
        { recordHistory: true },
      );
      setImportOpen(false);
      toast({
        variant: "success",
        title: "Reference photo imported",
        description:
          result.provider === "google" || result.provider === "serper"
            ? "Web image applied to this block."
            : result.provider === "pexels"
              ? "Pexels image applied to this block."
              : "Wikimedia image applied to this block.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setApplyingImportKeyframe(false);
    }
  }

  async function regenerate(kind: "keyframe" | "video" | "audio" | "media") {
    if (!block) return;
    const statusPatch: Partial<Block> = {
      status:
        kind === "keyframe"
          ? "image_generating"
          : kind === "video"
            ? "video_generating"
            : kind === "audio"
              ? "audio_generating"
              : "generating",
      errorMessage: null,
    };
    onPatched(block.id, statusPatch);
    try {
      const res = await fetch(`/api/blocks/${block.id}/${kind}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      onPatched(block.id, {
        status: "error",
        errorMessage: message,
      });
      toast({
        variant: "destructive",
        title: `Regenerate ${kind} failed`,
        description: message,
      });
    }
  }

  async function remove() {
    if (!block) return;
    if (onDeleteBlock) {
      await onDeleteBlock(block.id);
      return;
    }
    if (!confirm("Delete this block?")) return;
    try {
      const res = await fetch(`/api/blocks/${block.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onRemoved(block.id);
      toast({ variant: "success", title: "Block deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const narrationGroupDescription =
    inSpeechNarrationGroup && speechNarrationGroupId
      ? describeSpeechNarrationGroup(blocks, speechNarrationGroupId)
      : null;

  const sectionPanels = block ? (
    <div className="space-y-1">
        {showSection("setup") ? (
        <BlockPanelSection
          id="setup"
          flyout={flyoutMode}
          icon={<Settings2 className="h-3 w-3" />}
          title="Setup"
          summary={`${segmentType} · ${durationSeconds}s · ${audioVolume}% / ${sceneAudioVolume}%${
            videoShotCount > 1 ? ` · ${videoShotCountLabel(videoShotCount)}` : ""
          }`}
          focusSectionId={focusSectionId}
          onFocusHandled={() => setFocusSectionId(null)}
          headerAddon={
            <SegmentTypePicker value={segmentType} onChange={setSegmentType} />
          }
        >
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-[10px]">
                <Clock className="h-2.5 w-2.5" />
                Duration
              </Label>
              <Input
                type="number"
                min={1}
                max={60}
                step={1}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="col-span-2">
              <Label
                className="mb-0.5 flex items-center gap-1 text-[10px]"
                title="Adds framing instructions to the AI video prompt on regenerate"
              >
                <Clapperboard className="h-2.5 w-2.5" />
                Video shots
                {savingVideoShots && <Loader2 className="ml-1 h-2.5 w-2.5 animate-spin" />}
              </Label>
              <div
                role="radiogroup"
                aria-label="Video shots"
                className="grid grid-cols-4 gap-1"
              >
                {VIDEO_SHOT_COUNT_OPTIONS.map((option) => {
                  const active = videoShotCount === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={option.label}
                      title={`${option.label} — ${option.hint}`}
                      disabled={savingVideoShots}
                      onClick={() => void saveVideoShotCount(option.value)}
                      className={cn(
                        "h-7 rounded-md border text-xs font-medium transition-colors",
                        active
                          ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent/30"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      {option.value}
                    </button>
                  );
                })}
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {VIDEO_SHOT_COUNT_OPTIONS.find((o) => o.value === videoShotCount)?.hint}
                {videoShotCount > 1 ? " · Regenerate video to apply." : null}
              </p>
            </div>
          </div>
          <div className="mt-1.5">
            <Label
              className="mb-0.5 flex items-center gap-1 text-[10px]"
              title="Used for keyframe and video generation"
            >
              <UserRound className="h-2.5 w-2.5" />
              Character
              {savingAvatar && <Loader2 className="ml-1 h-2.5 w-2.5 animate-spin" />}
            </Label>
            <Select
              value={avatarChoice}
              onValueChange={saveAvatarChoice}
              disabled={savingAvatar}
            >
              <SelectTrigger className="h-8 py-0 text-xs">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <AvatarThumb
                    size="sm"
                    {...characterChoiceThumb(avatarChoice, avatars, projectAvatarId)}
                  />
                  <span className="truncate">
                    {characterChoiceLabel(avatarChoice, avatars, projectAvatarName)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__" className="py-1.5 pr-2 text-xs">
                  <span className="flex items-center gap-2">
                    <AvatarThumb
                      size="sm"
                      {...characterChoiceThumb("__inherit__", avatars, projectAvatarId)}
                    />
                    <span>
                      Project default{projectAvatarName ? ` (${projectAvatarName})` : ""}
                    </span>
                  </span>
                </SelectItem>
                <SelectItem value="__none__" className="py-1.5 pr-2 text-xs">
                  <span className="flex items-center gap-2">
                    <AvatarThumb size="sm" fallback="none" name="No character" />
                    <span>No character</span>
                  </span>
                </SelectItem>
                {avatars.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="py-1.5 pr-2 text-xs">
                    <span className="flex items-center gap-2">
                      <AvatarThumb
                        size="sm"
                        imageUrl={a.primaryImageUrl}
                        name={a.name}
                      />
                      <span>{a.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            <Label className="mb-0.5 flex items-center gap-1 text-[10px]">
              <Volume2 className="h-2.5 w-2.5" />
              Audio levels
            </Label>
            <CompactVolumeSlider
              icon={<AudioLines className="h-2.5 w-2.5" />}
              label="Narration"
              value={audioVolume}
              saving={savingVolume}
              onChange={saveAudioVolume}
              title="Clip level — combined with track + master on timeline"
            />
            <CompactVolumeSlider
              icon={<Waves className="h-2.5 w-2.5 text-cyan-400" />}
              label="Scene"
              value={sceneAudioVolume}
              saving={savingSceneVolume}
              onChange={saveSceneAudioVolume}
              disabled={!block.sceneAudioUrl}
              title={
                block.sceneAudioUrl
                  ? "Ambient audio from the generated video"
                  : "No scene audio — regenerate video to retry"
              }
            />
          </div>
        </BlockPanelSection>
        ) : null}

        {showNarrationGroupSection && showSection("narration-group") ? (
          <BlockPanelSection
            id="narration-group"
            flyout={flyoutMode}
            icon={<Link2 className="h-3 w-3" />}
            title="Narration group"
            summary={
              inSpeechNarrationGroup
                ? "Sharing voice-over"
                : joinNarrationTargets.length > 0
                  ? "Detached — can rejoin"
                  : "Visual cut"
            }
            focusSectionId={focusSectionId}
            onFocusHandled={() => setFocusSectionId(null)}
          >
            {inSpeechNarrationGroup && narrationGroupDescription ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                {narrationGroupDescription}
              </p>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Visual cuts share one continuous voice-over when they sit side by side in the
                same narration group. Dragging a cut away detaches it so narration is not cut
                incorrectly.
              </p>
            )}
            {canLeaveSpeechNarration ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1.5 h-7 w-full justify-start gap-1.5 text-xs"
                onClick={() => onLeaveNarrationGroup?.(block.id)}
              >
                <Unlink className="h-3 w-3 shrink-0" />
                Detach from narration group
              </Button>
            ) : null}
            {joinNarrationTargets.map((target) => (
              <Button
                key={`${target.groupId}:${target.placement}`}
                type="button"
                variant="outline"
                size="sm"
                className="mt-1.5 h-auto min-h-7 w-full justify-start gap-1.5 py-1 text-left text-xs"
                onClick={() =>
                  onJoinNarration?.(block.id, target.groupId, target.placement)
                }
              >
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="min-w-0">
                  {target.adjacent ? "Rejoin narration" : "Move & join narration"}
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-muted-foreground">
                    {target.label}
                  </span>
                </span>
              </Button>
            ))}
          </BlockPanelSection>
        ) : null}

        {showSection("content") ? (
        <BlockPanelSection
          id="content"
          flyout={flyoutMode}
          icon={<FileText className="h-3 w-3" />}
          title="Script & visual"
          summary={
            narrativeText
              ? narrativeText.slice(0, 40) + (narrativeText.length > 40 ? "…" : "")
              : "Empty"
          }
          focusSectionId={focusSectionId}
          onFocusHandled={() => setFocusSectionId(null)}
        >
          {flyoutMode ? (
            <>
              <Label className={BLOCK_SCRIPT_LABEL}>Narration</Label>
              <Textarea
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                className={BLOCK_NARRATION_TEXTAREA}
                rows={7}
              />
              <Label className={cn("mt-3 block", BLOCK_SCRIPT_LABEL)}>Visual prompt</Label>
              <Textarea
                value={visualPrompt}
                onChange={(e) => setVisualPrompt(e.target.value)}
                className={BLOCK_VISUAL_TEXTAREA}
                rows={5}
              />
            </>
          ) : (
            <>
              <CollapsibleTextField
                label="Narration"
                storageKey="block-detail:narration-field"
                value={narrativeText}
                onChange={setNarrativeText}
                minHeight="min-h-[140px]"
                textareaClassName={BLOCK_NARRATION_TEXTAREA}
              />
              <CollapsibleTextField
                label="Visual prompt"
                storageKey="block-detail:visual-field"
                value={visualPrompt}
                onChange={setVisualPrompt}
                minHeight="min-h-[100px]"
                textareaClassName={BLOCK_VISUAL_TEXTAREA}
                className="mt-3"
              />
            </>
          )}
        </BlockPanelSection>
        ) : null}

        {showSection("media") ? (
        <BlockPanelSection
          id="media"
          flyout={flyoutMode}
          icon={<Film className="h-3 w-3" />}
          title="Generated media"
          summary={`${mediaReadyCount}/4 ready`}
          defaultCollapsed
          focusSectionId={focusSectionId}
          onFocusHandled={() => setFocusSectionId(null)}
        >
          <div className="space-y-1">
            {processStatus ? <BlockProcessStatusBanner status={processStatus} /> : null}
            {allVideoShortAlerts.length > 1 && !videoShortAlert ? (
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5"
                title="Vários blocos têm vídeo mais curto que a duração do corte"
              >
                <div className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
                  <Timer className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {allVideoShortAlerts.length} blocos com vídeo curto
                    </p>
                    <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
                      Corrija todos de uma vez com câmera lenta (quando couber) ou loop.
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {slowMotionEligibleAlerts.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px]"
                          disabled={
                            refittingAllVideos ||
                            refittingVideo ||
                            generating ||
                            applyingImportVideo ||
                            uploadingVideo ||
                            applyingGalleryVideo
                          }
                          onClick={() => void refitAllVideosToBlock("slow")}
                        >
                          {refittingAllVideos ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Timer className="h-3 w-3" />
                          )}
                          Câmera lenta em todos ({slowMotionEligibleAlerts.length})
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px]"
                        disabled={
                          refittingAllVideos ||
                          refittingVideo ||
                          generating ||
                          applyingImportVideo ||
                          uploadingVideo ||
                          applyingGalleryVideo
                        }
                        onClick={() => void refitAllVideosToBlock("loop")}
                      >
                        {refittingAllVideos ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Repeat className="h-3 w-3" />
                        )}
                        Loop em todos ({allVideoShortAlerts.length})
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
              <Label className="mb-0.5 flex items-center gap-1 text-[10px]">
                <ImageIcon className="h-2.5 w-2.5" />
                Keyframe framing
                {savingKeyframeFit && <Loader2 className="ml-1 h-2.5 w-2.5 animate-spin" />}
              </Label>
              <div
                role="radiogroup"
                aria-label="Keyframe framing"
                className="grid grid-cols-2 gap-1"
              >
                {KEYFRAME_FIT_OPTIONS.map((option) => {
                  const active = keyframeFitMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={option.hint}
                      disabled={savingKeyframeFit}
                      onClick={() => void saveKeyframeFitMode(option.value)}
                      className={cn(
                        "h-7 rounded-md border px-1 text-[10px] font-medium transition-colors",
                        active
                          ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent/30"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {KEYFRAME_FIT_OPTIONS.find((o) => o.value === keyframeFitMode)?.hint}
                {" · "}
                Re-import or upload to apply to an existing image.
              </p>
            </div>
            <MediaRow
              label="Keyframe"
              icon={<ImageIcon className="h-3 w-3" />}
              url={block.keyframeUrl ?? null}
              kind="image"
              regenDisabled={generating}
              previewClass={cn(
                "mt-1 rounded bg-black object-cover",
                formatSpec.previewContainerClass,
                formatSpec.previewAspectClass,
              )}
              onRegen={() => regenerate("keyframe")}
              onUpload={uploadKeyframe}
              onPickFromGallery={() => setGalleryOpen(true)}
              onPickFromImport={() => setImportOpen(true)}
              uploading={uploadingKeyframe || applyingGalleryKeyframe || applyingImportKeyframe}
              onClear={() => clearMedia("keyframe")}
            />
            <MediaRow
              label="Video"
              icon={<Film className="h-3 w-3" />}
              url={block.videoUrl ?? null}
              kind="video"
              regenDisabled={generating}
              previewClass={cn(
                "mt-1 rounded bg-black object-contain",
                formatSpec.previewContainerClass,
                formatSpec.previewAspectClass,
              )}
              onRegen={() => regenerate("video")}
              onUpload={uploadVideo}
              onPickFromGallery={() => setVideoGalleryOpen(true)}
              onPickFromImport={() => setVideoImportOpen(true)}
              importTitle="Import stock video from Pexels"
              uploading={uploadingVideo || applyingGalleryVideo || applyingImportVideo}
              onClear={() => clearMedia("video")}
            />
            {formatBlockOpenRouterCost(block.openRouterCostUsd) ? (
              <p
                className="px-0.5 text-[9px] tabular-nums text-muted-foreground"
                title="Custo real cobrado pela OpenRouter nesta geração de vídeo"
              >
                OpenRouter: {formatBlockOpenRouterCost(block.openRouterCostUsd)}
              </p>
            ) : null}
            {videoShortAlert && block.videoUrl ? (
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5"
                title={videoShortTooltip(videoShortAlert)}
              >
                <div className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
                  <Repeat className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatVideoShortLabel(videoShortAlert)}</p>
                    <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
                      Na preview o vídeo repete até a narração terminar. Use câmera lenta (se couber),
                      repita em loop, encurte o bloco ou importe um clip mais longo.
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {canStretchVideoWithSlowMotion(
                        videoShortAlert.sourceDurationSec,
                        videoShortAlert.blockDurationSec,
                      ) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px]"
                          disabled={
                            refittingVideo ||
                            refittingAllVideos ||
                            applyingImportVideo ||
                            uploadingVideo ||
                            applyingGalleryVideo
                          }
                          onClick={() => void refitVideoToBlock("slow")}
                        >
                          {refittingVideo ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Timer className="h-3 w-3" />
                          )}
                          Câmera lenta (
                          {slowMotionSpeedLabel(
                            videoShortAlert.sourceDurationSec,
                            videoShortAlert.blockDurationSec,
                          )}
                          )
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px]"
                        disabled={
                          refittingVideo ||
                          refittingAllVideos ||
                          applyingImportVideo ||
                          uploadingVideo ||
                          applyingGalleryVideo
                        }
                        onClick={() => void refitVideoToBlock("loop")}
                      >
                        {refittingVideo ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Repeat className="h-3 w-3" />
                        )}
                        Repetir em loop
                      </Button>
                      {allVideoShortAlerts.length > 1 ? (
                        <>
                          <div className="my-0.5 border-t border-amber-500/30" />
                          {slowMotionEligibleAlerts.length > 0 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px] font-medium"
                              disabled={
                                refittingAllVideos ||
                                refittingVideo ||
                                generating ||
                                applyingImportVideo ||
                                uploadingVideo ||
                                applyingGalleryVideo
                              }
                              onClick={() => void refitAllVideosToBlock("slow")}
                            >
                              {refittingAllVideos ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Timer className="h-3 w-3" />
                              )}
                              Câmera lenta em todos ({slowMotionEligibleAlerts.length})
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-full border-amber-500/50 bg-background/80 text-[10px] font-medium"
                            disabled={
                              refittingAllVideos ||
                              refittingVideo ||
                              generating ||
                              applyingImportVideo ||
                              uploadingVideo ||
                              applyingGalleryVideo
                            }
                            onClick={() => void refitAllVideosToBlock("loop")}
                          >
                            {refittingAllVideos ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Repeat className="h-3 w-3" />
                            )}
                            Loop em todos ({allVideoShortAlerts.length})
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <MediaRow
              label="Narration"
              icon={<AudioLines className="h-3 w-3" />}
              url={block.audioUrl ?? null}
              kind="audio"
              regenDisabled={generating}
              onRegen={() => regenerate("audio")}
              onClear={() => clearMedia("audio")}
            />
            <MediaRow
              label="Scene audio"
              icon={<Waves className="h-3 w-3" />}
              url={block.sceneAudioUrl ?? null}
              kind="audio"
              regenDisabled={generating}
              onRegen={() => regenerate("video")}
              regenLabel="Regenerate video"
              onClear={() => clearMedia("sceneAudio")}
            />
            <Button
              variant="primary"
              size="sm"
              className="mt-1 w-full"
              onClick={() => regenerate("media")}
              disabled={generating}
            >
              <RefreshCw className="h-3 w-3" />
              Regen all
            </Button>
          </div>
        </BlockPanelSection>
        ) : null}
    </div>
  ) : null;

  return (
    <>
      <aside className="relative flex h-full shrink-0">
        {flyoutMode && block && activeRailSectionMeta ? (
          <BlockPanelFlyout
            key={`${block.id}-${activeRailSection}`}
            title={activeRailSectionMeta.title}
            blockNumber={block.position + 1}
            onClose={() => setActiveRailSection(null)}
            onDelete={() => void remove()}
          >
            {sectionPanels}
          </BlockPanelFlyout>
        ) : null}

        <div className="relative flex h-full w-11 shrink-0 flex-col items-center overflow-hidden border-l border-border bg-panel py-2">
          <BlockPanelCollapsedRail
            block={block}
            sections={railSections}
            activeSectionId={activeRailSection}
            onOpenSection={toggleRailSection}
          />
        </div>
      </aside>
      <MediaLibraryPickerDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        projectId={projectId}
        kind="image"
        onSelect={applyKeyframeFromGallery}
        busy={applyingGalleryKeyframe}
      />
      <MediaLibraryPickerDialog
        open={videoGalleryOpen}
        onOpenChange={setVideoGalleryOpen}
        projectId={projectId}
        kind="video"
        onSelect={applyVideoFromGallery}
        busy={applyingGalleryVideo}
      />
      {block ? (
        <>
          <ReferenceImageImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            blockId={block.id}
            videoFormat={videoFormat}
            initialQuery={block.visualPrompt.trim()}
            onSelect={applyKeyframeFromImport}
            busy={applyingImportKeyframe}
          />
          <ReferenceVideoImportDialog
            open={videoImportOpen}
            onOpenChange={setVideoImportOpen}
            projectId={projectId}
            blockId={block.id}
            blockPosition={block.position}
            videoFormat={videoFormat}
            initialQuery={block.visualPrompt.trim()}
            onSelect={applyVideoFromImport}
            busy={applyingImportVideo}
          />
        </>
      ) : null}
    </>
  );
}

function readCollapsed(storageKey: string, defaultCollapsed = false): boolean {
  try {
    if (typeof window === "undefined") return defaultCollapsed;
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return defaultCollapsed;
    return stored === "1";
  } catch {
    return defaultCollapsed;
  }
}

function writeCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(storageKey, "1");
    else localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

function SegmentTypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: SegmentType) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-1 px-2 py-1.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      role="group"
      aria-label="Segment type"
    >
      {SEGMENT_TYPES.map((type) => {
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            title={type}
            aria-label={type}
            aria-pressed={selected}
            onClick={() => onChange(type)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-colors hover:bg-muted/50",
              selected && "bg-muted/40",
            )}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full border-2 shadow-sm transition-transform",
                SEGMENT_DOT_CLASSES[type],
                selected
                  ? "scale-110 border-foreground/70 ring-2 ring-foreground/20"
                  : "border-white/20 opacity-80 hover:opacity-100",
              )}
            />
            <span
              className={cn(
                "max-w-full truncate text-[8px] capitalize leading-none",
                selected ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {type}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockPanelSection({
  id,
  icon,
  title,
  summary,
  defaultCollapsed = false,
  focusSectionId = null,
  onFocusHandled,
  headerAddon,
  flyout = false,
  children,
}: {
  id: BlockPanelSectionId;
  icon: React.ReactNode;
  title: string;
  summary?: string;
  defaultCollapsed?: boolean;
  focusSectionId?: BlockPanelSectionId | null;
  onFocusHandled?: () => void;
  headerAddon?: React.ReactNode;
  flyout?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `block-detail:section-${id}`;
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCollapsed(readCollapsed(storageKey, defaultCollapsed));
  }, [storageKey, defaultCollapsed]);

  React.useEffect(() => {
    if (flyout || focusSectionId !== id) return;
    setCollapsed(false);
    writeCollapsed(storageKey, false);
    const frame = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusSectionId, flyout, id, storageKey, onFocusHandled]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  if (flyout) {
    return (
      <div ref={rootRef} className="space-y-1.5">
        {headerAddon}
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-md border border-border bg-background"
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[11px] font-medium">{title}</span>
        {collapsed && summary && (
          <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {headerAddon ? (
        <div className="border-t border-border/60">{headerAddon}</div>
      ) : null}
      {!collapsed && <div className="border-t border-border px-2 py-1.5">{children}</div>}
    </div>
  );
}

function CompactVolumeSlider({
  icon,
  label,
  value,
  saving,
  disabled,
  title,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  saving?: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div title={title}>
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {value}%{saving ? " …" : ""}
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        className="h-1"
      />
    </div>
  );
}

const BLOCK_SCRIPT_LABEL = "text-xs font-medium text-foreground/85";
const BLOCK_NARRATION_TEXTAREA =
  "mt-1 min-h-[140px] resize-y text-sm leading-relaxed px-3 py-2";
const BLOCK_VISUAL_TEXTAREA =
  "mt-1 min-h-[100px] resize-y text-sm leading-relaxed px-3 py-2";

function CollapsibleTextField({
  label,
  storageKey,
  value,
  onChange,
  minHeight,
  textareaClassName,
  defaultCollapsed = false,
  className,
}: {
  label: string;
  storageKey: string;
  value: string;
  onChange: (value: string) => void;
  minHeight: string;
  textareaClassName?: string;
  defaultCollapsed?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  React.useEffect(() => {
    setCollapsed(readCollapsed(storageKey, defaultCollapsed));
  }, [storageKey, defaultCollapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-1 rounded-sm text-left hover:bg-muted/30"
        aria-expanded={!collapsed}
      >
        <Label className={cn("cursor-pointer", BLOCK_SCRIPT_LABEL)}>{label}</Label>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(textareaClassName ?? BLOCK_NARRATION_TEXTAREA, minHeight)}
        />
      ) : (
        <p className="mt-1 line-clamp-2 rounded border border-border/60 bg-panel px-2 py-1.5 text-sm leading-relaxed text-muted-foreground">
          {value || "Empty"}
        </p>
      )}
    </div>
  );
}

function MediaRow({
  label,
  icon,
  url,
  kind,
  previewClass,
  onRegen,
  onUpload,
  onPickFromGallery,
  onPickFromImport,
  importTitle = "Import from Google, Pexels or Wikimedia",
  uploading = false,
  regenDisabled = false,
  onClear,
  regenLabel,
}: {
  label: string;
  icon: React.ReactNode;
  url: string | null;
  kind: "image" | "video" | "audio";
  previewClass?: string;
  onRegen: () => void;
  onUpload?: (file: File) => void;
  onPickFromGallery?: () => void;
  onPickFromImport?: () => void;
  importTitle?: string;
  uploading?: boolean;
  regenDisabled?: boolean;
  onClear?: () => void;
  regenLabel?: string;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [previewBroken, setPreviewBroken] = React.useState(false);
  const busy = uploading || regenDisabled;

  React.useEffect(() => {
    setPreviewBroken(false);
  }, [url]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && onUpload) onUpload(file);
  }

  return (
    <div className="rounded border border-border/80 bg-panel px-1.5 py-1">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1 text-[10px]">
          {icon}
          <span className="truncate">{label}</span>
          <Badge
            variant={url ? "success" : "default"}
            className="ml-0.5 shrink-0 px-1 py-0 text-[9px]"
          >
            {url ? "✓" : "—"}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center">
          {onPickFromImport ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5"
              disabled={busy}
              onClick={onPickFromImport}
              title={importTitle}
            >
              <Globe2 className="h-2.5 w-2.5" />
            </Button>
          ) : null}
          {onPickFromGallery ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5"
              disabled={busy}
              onClick={onPickFromGallery}
              title="Choose from media gallery"
            >
              <FolderOpen className="h-2.5 w-2.5" />
            </Button>
          ) : null}
          {onUpload ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  kind === "video"
                    ? "video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm"
                    : "image/jpeg,image/png,image/webp"
                }
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5 w-5"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                title={
                  kind === "video"
                    ? url
                      ? "Replace with your video"
                      : "Upload your video"
                    : url
                      ? "Replace with your image"
                      : "Upload your image"
                }
              >
                {uploading ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Upload className="h-2.5 w-2.5" />
                )}
              </Button>
            </>
          ) : null}
          {url && onClear ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={onClear}
              title={`Remove ${label} only`}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-5 w-5"
            onClick={onRegen}
            disabled={regenDisabled}
            title={regenLabel ?? `Regenerate ${label}`}
          >
            <RefreshCw className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>
      {url && kind === "image" && !previewBroken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className={previewClass ?? "mt-1 aspect-video w-full rounded object-cover"}
          onError={() => setPreviewBroken(true)}
        />
      )}
      {url && kind === "video" && (
        <div
          className={cn(
            previewClass ??
              "mt-1 aspect-video w-full overflow-hidden rounded bg-black",
          )}
        >
          <video src={url} controls className="h-full w-full object-contain" />
        </div>
      )}
      {url && kind === "audio" && (
        <audio src={url} controls className="mt-1 w-full" />
      )}
    </div>
  );
}
