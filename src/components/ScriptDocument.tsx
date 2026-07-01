"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Download, Film, ImageIcon, Layers, Loader2, Megaphone, Pause, Play, Plus, RefreshCw, Search, Sparkles, Trash2, Wand2, Zap, Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildScriptHighlightSegments,
  buildScriptSegmentMarkers,
  severityHighlightClass,
  type ScriptDeliveryAnalysis,
  type ScriptKeywordImageMatch,
  type ScriptParagraphImageSearch,
  type ScriptParagraphNarrationClip,
  type ScriptSegmentMarker,
  type ScriptSegmentRole,
  type ScriptSuggestion,
  keywordImageMatchIsVisible,
  keywordMatchIsVideo,
  resolveKeywordImageExpandedUrl,
  resolveKeywordImagePreviewUrl,
  resolveKeywordVideoPlaybackUrl,
} from "@/lib/script-studio";
import type { SegmentBudgetAlert } from "@/lib/script-budget";
import {
  buildScriptVisualHints,
  type ScriptVisualHint,
} from "@/lib/script-visual-hints";
import {
  buildDeliveryHighlightSegments,
  deliveryEmphasisClass,
} from "@/lib/script-delivery-emphasis";
import {
  narrationClipForSpeechIndex,
  scriptParagraphTextKey,
} from "@/lib/script-narration-utils";
import {
  markerBlockRanges,
  measureParagraphLayouts,
  type ParagraphLayout,
} from "@/lib/script-paragraph-layout";

interface Props {
  script: string;
  onChange: (value: string) => void;
  suggestions: ScriptSuggestion[];
  activeSuggestionId: string | null;
  onSelectSuggestion: (id: string | null) => void;
  showHighlights: boolean;
  showVisualHints?: boolean;
  showDeliveryEmphasis?: boolean;
  deliveryAnalysis?: ScriptDeliveryAnalysis | null;
  paragraphClips?: ScriptParagraphNarrationClip[];
  paragraphImages?: ScriptParagraphImageSearch[];
  searchingSpeechIndex?: number | null;
  searchingPauseIndex?: number | null;
  onSearchParagraphImages?: (speechIndex: number) => void;
  onSearchPauseImages?: (pauseIndex: number) => void;
  onAiPickParagraphImages?: (speechIndex: number) => void;
  aiPickingSpeechIndex?: number | "all" | null;
  searchingVideoSpeechIndex?: number | "all" | null;
  onSearchParagraphVideo?: (speechIndex: number, keyword?: string) => void;
  onSearchCustomParagraphImage?: (speechIndex: number, keyword: string) => void;
  onSearchCustomPauseImage?: (pauseIndex: number, keyword: string) => void;
  onGenerateParagraphImage?: (speechIndex: number, prompt: string) => void;
  generatingParagraphImageIndex?: number | null;
  onImportKeywordImage?: (speechIndex: number, keyword: string) => void;
  onImportPauseKeywordImage?: (pauseIndex: number, keyword: string) => void;
  onCycleKeywordImage?: (speechIndex: number, keyword: string) => void;
  onCyclePauseKeywordImage?: (pauseIndex: number, keyword: string) => void;
  onRemoveKeywordImage?: (speechIndex: number, keyword: string) => void;
  onRemovePauseKeywordImage?: (pauseIndex: number, keyword: string) => void;
  onKeepImportedParagraphImages?: (speechIndex: number) => void;
  activeSpeechIndex?: number | null;
  generatingSpeechIndex?: number | null;
  onPlaySpeechParagraph?: (speechIndex: number) => void;
  onRegenerateSpeechParagraph?: (speechIndex: number) => void;
  onRemoveSection?: (markerIndex: number) => void;
  placeholder?: string;
  density?: "comfortable" | "compact";
  segmentBudgetAlerts?: SegmentBudgetAlert[];
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

const ROLE_META: Record<
  ScriptSegmentRole,
  { icon: typeof Sparkles; className: string }
> = {
  intro: { icon: Sparkles, className: "text-sky-400/90" },
  middle: { icon: Layers, className: "text-muted-foreground" },
  climax: { icon: Zap, className: "text-amber-400/90" },
  cta: { icon: Megaphone, className: "text-accent" },
  pause: { icon: Pause, className: "text-violet-400/80" },
  section: { icon: Bookmark, className: "text-emerald-500/90" },
};

function StructureIcon({
  marker,
  alert,
}: {
  marker: ScriptSegmentMarker;
  alert?: SegmentBudgetAlert;
}) {
  const meta = ROLE_META[marker.role];
  const Icon = meta.icon;
  const overBudget = alert && alert.status !== "ok";
  const detail =
    alert && alert.role !== "pause" && alert.role !== "section"
      ? `${alert.words}w · max ~${alert.maxWords}w`
      : alert?.role === "pause"
        ? `${alert.estimatedSeconds}s · max ${alert.maxSeconds}s`
        : marker.role === "section"
          ? marker.sectionTitle ?? marker.label
          : null;
  return (
    <span
      title={
        marker.role === "section"
          ? (marker.sectionTitle ?? marker.label)
          : overBudget && detail
            ? `${marker.label} — over budget (${detail})`
            : marker.label
      }
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border bg-muted/30",
        overBudget
          ? alert.status === "over"
            ? "border-destructive/60 ring-1 ring-destructive/40"
            : "border-warning/60 ring-1 ring-warning/40"
          : "border-border/60",
        meta.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{marker.label}</span>
    </span>
  );
}

function SectionMarkerBlock({
  marker,
  density = "comfortable",
  onRemove,
}: {
  marker: ScriptSegmentMarker;
  density?: "comfortable" | "compact";
  onRemove?: () => void;
}) {
  const title = marker.sectionTitle ?? marker.displayText.replace(/^#+\s*/, "");
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full items-center gap-2 rounded-md border border-dashed border-emerald-500/35 bg-emerald-500/8 px-3",
        density === "compact" ? "py-1.5" : "py-2",
      )}
    >
      <Bookmark className="h-3.5 w-3.5 shrink-0 text-emerald-500/90" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-300/90">
        {title}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          title="Remove this chapter marker"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-emerald-700/70 transition-colors hover:bg-emerald-500/15 hover:text-destructive dark:text-emerald-300/70"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Remove section</span>
        </button>
      ) : null}
    </div>
  );
}

function VisualHintBubble({
  hint,
  density = "comfortable",
}: {
  hint: ScriptVisualHint;
  density?: "comfortable" | "compact";
}) {
  const Icon = hint.icon;
  const compact = density === "compact";
  return (
    <span
      title={hint.label}
      className={cn(
        "pointer-events-auto relative inline-flex shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/95 align-middle shadow-sm",
        compact ? "ml-1 h-4 w-4" : "ml-1.5 h-5 w-5",
      )}
    >
      <Icon
        className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3", hint.iconClassName)}
        aria-hidden
      />
      <span className="sr-only">{hint.label}</span>
    </span>
  );
}

function useFloatingPanelPlacement(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  estimatedHeight = 160,
) {
  const [placement, setPlacement] = React.useState({
    top: 0,
    left: 0,
    above: false,
  });

  const updatePlacement = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const above = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    setPlacement({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
      above,
    });
  }, [anchorRef, estimatedHeight]);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener("scroll", updatePlacement, true);
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("scroll", updatePlacement, true);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [open, updatePlacement]);

  return { placement, updatePlacement };
}

function FloatingPanel({
  open,
  anchorRef,
  panelRef,
  estimatedHeight = 160,
  widthClass,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  estimatedHeight?: number;
  widthClass: string;
  className?: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { placement } = useFloatingPanelPlacement(anchorRef, open, estimatedHeight);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: placement.top,
        left: placement.left,
        transform: placement.above ? "translate(-50%, -100%)" : "translateX(-50%)",
        zIndex: 9999,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        ref={panelRef as React.Ref<HTMLDivElement>}
        className={cn(
          "rounded-lg border border-border bg-background p-2 shadow-lg",
          widthClass,
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ParagraphImageControls({
  isSearching,
  isGeneratingAi,
  isAiPicking,
  isSearchingVideo,
  hasResults,
  hasUnimportedExtras,
  onAutoSearch,
  onAiPick,
  onAutoVideoSearch,
  onCustomSearch,
  onGenerateAi,
  onKeepImportedOnly,
  density = "comfortable",
  pauseHold = false,
}: {
  isSearching: boolean;
  isGeneratingAi?: boolean;
  isAiPicking?: boolean;
  isSearchingVideo?: boolean;
  hasResults: boolean;
  hasUnimportedExtras?: boolean;
  onAutoSearch: () => void;
  onAiPick?: () => void;
  onCustomSearch: (keyword: string) => void;
  onAutoVideoSearch?: () => void;
  onGenerateAi?: (prompt: string) => void;
  onKeepImportedOnly?: () => void;
  density?: "comfortable" | "compact";
  /** Music-moment hold — search only, no narration/video/AI pick. */
  pauseHold?: boolean;
}) {
  const compact = density === "compact";
  const btnSize = compact ? "h-4 w-4" : "h-5 w-5";
  const iconSize = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  const busy = isSearching || isGeneratingAi || isAiPicking || isSearchingVideo;
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const webPanelRef = React.useRef<HTMLDivElement>(null);
  const aiPanelRef = React.useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [aiPrompt, setAiPrompt] = React.useState("");

  React.useEffect(() => {
    if (!customOpen && !aiOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (webPanelRef.current?.contains(target) || aiPanelRef.current?.contains(target)) return;
      setCustomOpen(false);
      setAiOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [customOpen, aiOpen]);

  function submitCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onCustomSearch(trimmed);
    setQuery("");
    setCustomOpen(false);
  }

  function submitAi() {
    onGenerateAi?.(aiPrompt.trim());
    setAiPrompt("");
    setAiOpen(false);
  }

  return (
    <span
      ref={anchorRef}
      className={cn(
        "pointer-events-auto relative inline-flex shrink-0 items-center align-middle",
        compact ? "ml-1 gap-0.5" : "ml-1.5 gap-1",
      )}
    >
      <button
        type="button"
        title={
          pauseHold
            ? hasResults
              ? "Buscar mais fotos para esta pausa (mantém as existentes)"
              : "Buscar foto para esta pausa — evita repetir a imagem anterior"
            : hasResults
              ? "Find more photos for this paragraph (keeps existing)"
              : "Search reference photos for this paragraph"
        }
        disabled={busy}
        onClick={() => {
          setCustomOpen(false);
          setAiOpen(false);
          onAutoSearch();
        }}
        className={cn(
          "inline-flex items-center justify-center rounded-full border shadow-sm transition-colors",
          btnSize,
          hasResults
            ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
            : "border-border/50 bg-background/95 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        {isSearching ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : (
          <Search className={iconSize} />
        )}
        <span className="sr-only">Search images</span>
      </button>
      {onAiPick ? (
        <button
          type="button"
          title="IA escolhe quantidade, melhor foto e importa"
          disabled={busy}
          onClick={() => {
            setCustomOpen(false);
            setAiOpen(false);
            onAiPick();
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-full border shadow-sm transition-colors",
            btnSize,
            isAiPicking
              ? "border-accent/50 bg-accent/15 text-accent"
              : "border-border/50 bg-background/95 text-muted-foreground hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
          )}
        >
          {isAiPicking ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Wand2 className={iconSize} />
          )}
          <span className="sr-only">AI pick and import</span>
        </button>
      ) : null}
      {onGenerateAi ? (
        <button
          type="button"
          title="Create image with AI for this paragraph"
          disabled={busy}
          onClick={() => {
            setCustomOpen(false);
            setAiOpen((open) => !open);
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-full border shadow-sm transition-colors",
            btnSize,
            aiOpen || isGeneratingAi
              ? "border-violet-400/50 bg-violet-500/15 text-violet-300"
              : "border-border/50 bg-background/95 text-muted-foreground hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-300",
          )}
        >
          {isGeneratingAi ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Sparkles className={iconSize} />
          )}
          <span className="sr-only">Create with AI</span>
        </button>
      ) : null}
      {onAutoVideoSearch ? (
        <button
          type="button"
          title="Busca e importa vídeo stock deste parágrafo (Pexels + IA)"
          disabled={busy}
          onClick={() => {
            setCustomOpen(false);
            setAiOpen(false);
            onAutoVideoSearch();
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-full border shadow-sm transition-colors",
            btnSize,
            isSearchingVideo
              ? "border-sky-400/50 bg-sky-500/15 text-sky-300"
              : "border-border/50 bg-background/95 text-muted-foreground hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-300",
          )}
        >
          {isSearchingVideo ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Film className={iconSize} />
          )}
          <span className="sr-only">Paragraph stock video</span>
        </button>
      ) : null}
      <button
        type="button"
        title="Search web for a specific photo"
        disabled={busy}
        onClick={() => {
          setAiOpen(false);
          setCustomOpen((open) => !open);
        }}
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-dashed border-border/60 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:border-accent/40 hover:bg-muted/60 hover:text-foreground",
          btnSize,
        )}
      >
        <Plus className={iconSize} />
        <span className="sr-only">Add custom photo search</span>
      </button>
      {hasUnimportedExtras && onKeepImportedOnly ? (
        <button
          type="button"
          title="Remove unimported photos — keep only the ones you imported (green dot)"
          disabled={busy}
          onClick={onKeepImportedOnly}
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-success/40 bg-success/10 text-success shadow-sm transition-colors hover:bg-success/15",
            btnSize,
          )}
        >
          <Trash2 className={iconSize} />
          <span className="sr-only">Keep imported photos only</span>
        </button>
      ) : null}
      {customOpen ? (
        <FloatingPanel
          open={customOpen}
          anchorRef={anchorRef}
          panelRef={webPanelRef}
          estimatedHeight={130}
          widthClass="w-52"
        >
          <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
            Busca no Google e na API de stock (Pexels + Wikimedia) ao mesmo tempo
          </p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. waterfall aerial"
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitCustom();
              }
              if (e.key === "Escape") setCustomOpen(false);
            }}
          />
          <Button
            type="button"
            size="xs"
            className="mt-1.5 w-full"
            disabled={!query.trim() || busy}
            onClick={submitCustom}
          >
            Buscar (Google + API)
          </Button>
        </FloatingPanel>
      ) : null}
      {aiOpen && onGenerateAi ? (
        <FloatingPanel
          open={aiOpen}
          anchorRef={anchorRef}
          panelRef={aiPanelRef}
          estimatedHeight={200}
          widthClass="w-60"
          className="border-violet-400/30"
        >
          <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
            Create a unique still with AI — uses this paragraph + project style. Optional: describe
            the shot.
          </p>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Optional: aerial canyon at golden hour…"
            className="min-h-[56px] resize-none text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitAi();
              }
              if (e.key === "Escape") setAiOpen(false);
            }}
          />
          <div className="mt-1.5 flex gap-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => submitAi()}
            >
              Auto from paragraph
            </Button>
            <Button
              type="button"
              size="xs"
              className="flex-1"
              disabled={!aiPrompt.trim() || busy}
              onClick={submitAi}
            >
              Create
            </Button>
          </div>
        </FloatingPanel>
      ) : null}
    </span>
  );
}

function KeywordImageBubble({
  match,
  density = "comfortable",
  onImport,
  onCycle,
  onRemove,
}: {
  match: ScriptKeywordImageMatch;
  density?: "comfortable" | "compact";
  onImport?: () => void;
  onCycle?: () => void;
  onRemove?: () => void;
}) {
  const compact = density === "compact";
  const size = compact ? "h-5 w-5" : "h-6 w-6";
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const hoverTimerRef = React.useRef<number | null>(null);
  const [pinned, setPinned] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [imgBroken, setImgBroken] = React.useState(false);
  const [localMediaMissing, setLocalMediaMissing] = React.useState(false);
  const [placement, setPlacement] = React.useState<{
    top: number;
    left: number;
    above: boolean;
  }>({ top: 0, left: 0, above: false });

  const selected = match.results.find((r) => r.id === match.selectedId) ?? match.results[0];
  const imported = Boolean(match.importedUrl?.trim());
  const isVideo = keywordMatchIsVideo(match);
  const isAi = match.keyword.trim().toLowerCase().startsWith("ai ·");
  const previewUrl = resolveKeywordImagePreviewUrl(match);
  const expandedUrl = resolveKeywordImageExpandedUrl(match);
  const videoPlaybackUrl = resolveKeywordVideoPlaybackUrl(match);
  const showPreview = Boolean((previewUrl || videoPlaybackUrl) && (pinned || hovering));

  React.useEffect(() => {
    setImgBroken(false);
    setLocalMediaMissing(false);
  }, [previewUrl, match.importedAt, match.selectedId, match.importedUrl, match.importedPreviewUrl]);

  const remotePreviewUrl = selected?.previewUrl?.trim() || null;
  const localImportedUrl =
    match.importedPreviewUrl?.trim() || match.importedUrl?.trim() || null;
  const localIsApiMedia = Boolean(
    localImportedUrl?.split("?")[0]?.startsWith("/api/media/"),
  );

  const displaySrc = React.useMemo(() => {
    if (localMediaMissing && remotePreviewUrl) {
      return remotePreviewUrl;
    }
    if (!previewUrl) return null;
    if (!imgBroken) return previewUrl;
    const bare = previewUrl.split("?")[0]?.split("#")[0];
    if (bare && bare !== previewUrl) return bare;
    if (remotePreviewUrl && remotePreviewUrl !== previewUrl) return remotePreviewUrl;
    return null;
  }, [previewUrl, imgBroken, localMediaMissing, remotePreviewUrl]);

  function handlePreviewError() {
    if (imported && localIsApiMedia && remotePreviewUrl && !localMediaMissing) {
      setLocalMediaMissing(true);
      return;
    }
    setImgBroken(true);
  }

  const updatePlacement = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < cardHeight;
    setPlacement({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
      above,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!showPreview) return;
    updatePlacement();
    const onScrollOrResize = () => updatePlacement();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showPreview, updatePlacement]);

  React.useEffect(() => {
    if (!pinned) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || previewRef.current?.contains(target)) return;
      setPinned(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [pinned]);

  function openHover() {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    updatePlacement();
    setHovering(true);
  }

  function scheduleHoverClose() {
    if (pinned) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHovering(false);
      hoverTimerRef.current = null;
    }, 150);
  }

  React.useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  if (!previewUrl && !videoPlaybackUrl) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove?.();
        }}
        title={`${match.keyword} — no preview${imported ? " (re-import or refresh search)" : ""}${onRemove ? " · click to remove" : ""}`}
        className={cn(
          "pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 bg-muted/20 align-middle",
          compact ? "ml-1" : "ml-1.5",
          size,
          onRemove && "cursor-pointer hover:border-destructive/40 hover:bg-destructive/10",
        )}
      >
        <ImageIcon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
        <span className="sr-only">{match.keyword}</span>
      </button>
    );
  }

  const expandedSrc = expandedUrl ?? displaySrc;
  const showVideoInPopover = Boolean(isVideo && videoPlaybackUrl);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={
          imported
            ? isVideo
              ? `${match.keyword} — stock video imported · ready for timeline`
              : isAi
                ? `${match.keyword} — AI image · ready for timeline`
                : `${match.keyword} — imported · right-click for next photo`
            : isVideo
              ? `${match.keyword} — click to import video · right-click for next clip`
              : `${match.keyword} — click to import · right-click for next photo`
        }
        onMouseEnter={openHover}
        onMouseLeave={scheduleHoverClose}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!imported && onImport) {
            onImport();
            return;
          }
          updatePlacement();
          setPinned((value) => !value);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onCycle?.();
        }}
        className={cn(
          "pointer-events-auto relative inline-flex shrink-0 overflow-hidden rounded-full border align-middle shadow-sm transition-transform duration-150 active:scale-95",
          compact ? "ml-1" : "ml-1.5",
          size,
          showPreview && "z-20 scale-110 ring-2 ring-accent/40",
          imported
            ? isVideo
              ? "border-sky-400/50 ring-sky-400/30"
              : isAi
                ? "border-violet-400/50 ring-violet-400/30"
                : "border-success/50 ring-success/30"
            : isVideo
              ? "border-sky-400/40"
              : "border-border/60",
          !showPreview && "hover:scale-110",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {displaySrc ? (
          <img
            src={displaySrc}
            alt={match.keyword}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handlePreviewError}
          />
        ) : videoPlaybackUrl ? (
          <video
            src={videoPlaybackUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : null}
        {imported ? (
          <span
            className={cn(
              "absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full ring-1 ring-background",
              isVideo ? "bg-sky-400" : isAi ? "bg-violet-400" : "bg-success",
            )}
          />
        ) : null}
        {isVideo ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Film className={compact ? "h-2 w-2 text-white" : "h-2.5 w-2.5 text-white"} />
          </span>
        ) : null}
        <span className="sr-only">{match.keyword}</span>
      </button>

      {showPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: placement.top,
              left: placement.left,
              transform: placement.above ? "translate(-50%, -100%)" : "translateX(-50%)",
              zIndex: 9999,
            }}
            onMouseEnter={openHover}
            onMouseLeave={scheduleHoverClose}
          >
            <div
              ref={previewRef}
              role="dialog"
              aria-label={`Preview: ${match.keyword}`}
              className={cn(
                "pointer-events-auto w-64 overflow-hidden rounded-xl border border-border bg-background shadow-2xl transition-transform duration-200 ease-out hover:scale-[0.94] animate-in fade-in zoom-in-95 duration-150",
                placement.above ? "origin-bottom" : "origin-top",
              )}
            >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/30">
              {showVideoInPopover ? (
                <video
                  src={videoPlaybackUrl!}
                  poster={displaySrc || undefined}
                  className="h-full w-full object-cover"
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : expandedSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={expandedSrc}
                  alt={match.keyword}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={handlePreviewError}
                />
              ) : null}
              {imported ? (
                <span className="absolute left-2 top-2 rounded-full bg-success/90 px-2 py-0.5 text-[10px] font-medium text-success-foreground">
                  Imported
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-3">
              <p className="text-xs font-medium leading-snug text-foreground">{match.keyword}</p>
              {selected?.sourceTitle ? (
                <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                  {selected.sourceTitle}
                </p>
              ) : null}
              {selected?.attribution ? (
                <p className="text-[10px] text-muted-foreground/80">{selected.attribution}</p>
              ) : null}
              <div className="flex gap-1.5 pt-1">
                {!imported && onImport ? (
                  <button
                    type="button"
                    onClick={() => onImport()}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-accent px-2 py-1.5 text-[10px] font-medium text-accent-foreground hover:bg-accent/90"
                  >
                    <Download className="h-3 w-3" />
                    Import
                  </button>
                ) : null}
                {onCycle && match.results.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onCycle()}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] font-medium text-foreground hover:bg-muted/60"
                    title="Next photo"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Next
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRemove();
                      setPinned(false);
                    }}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 rounded-md border border-destructive/30 px-2 py-1.5 text-[10px] font-medium text-destructive hover:bg-destructive/10",
                      !imported && !onCycle ? "flex-1" : "",
                    )}
                    title="Remove this photo from the paragraph"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ParagraphNarrationChip({
  hasClip,
  isOutdated,
  isActive,
  isGenerating,
  onPlay,
  onRegenerate,
  density = "comfortable",
}: {
  hasClip: boolean;
  isOutdated?: boolean;
  isActive: boolean;
  isGenerating: boolean;
  onPlay: () => void;
  onRegenerate?: () => void;
  density?: "comfortable" | "compact";
}) {
  const compact = density === "compact";
  const size = compact ? "h-4" : "h-5";
  const icon = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      className={cn(
        "pointer-events-auto inline-flex shrink-0 items-center overflow-hidden rounded-full border align-middle shadow-sm",
        compact ? "ml-1" : "ml-1.5",
        size,
        isActive
          ? "border-sky-400/50 bg-sky-400/10"
          : isOutdated
            ? "border-amber-400/50 bg-amber-400/10"
            : "border-border/50 bg-background/95",
      )}
    >
      <button
        type="button"
        title={
          hasClip
            ? "Play paragraph"
            : isOutdated
              ? "Text changed — re-narrate this paragraph"
              : "Generate narration first"
        }
        disabled={!hasClip || isGenerating}
        onClick={onPlay}
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-35",
          compact ? "h-4 w-4" : "h-5 w-5",
          isActive && hasClip && "text-sky-600",
        )}
      >
        <Play className={icon} />
        <span className="sr-only">Play paragraph</span>
      </button>
      {onRegenerate ? (
        <>
          <span className="h-2.5 w-px shrink-0 bg-border/60" aria-hidden />
          <button
            type="button"
            title={hasClip ? "Re-narrate paragraph" : "Narrate paragraph"}
            disabled={isGenerating}
            onClick={onRegenerate}
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-35",
              compact ? "h-4 w-4" : "h-5 w-5",
            )}
          >
            {isGenerating ? (
              <Loader2 className={cn(icon, "animate-spin")} />
            ) : (
              <RefreshCw className={icon} />
            )}
            <span className="sr-only">Re-narrate paragraph</span>
          </button>
        </>
      ) : null}
    </span>
  );
}

export function ScriptDocument({
  script,
  onChange,
  suggestions,
  activeSuggestionId,
  onSelectSuggestion,
  showHighlights,
  showVisualHints = true,
  showDeliveryEmphasis = true,
  deliveryAnalysis = null,
  paragraphClips = [],
  paragraphImages = [],
  searchingSpeechIndex = null,
  searchingPauseIndex = null,
  onSearchParagraphImages,
  onSearchPauseImages,
  onAiPickParagraphImages,
  aiPickingSpeechIndex = null,
  searchingVideoSpeechIndex = null,
  onSearchParagraphVideo,
  onSearchCustomParagraphImage,
  onSearchCustomPauseImage,
  onGenerateParagraphImage,
  generatingParagraphImageIndex = null,
  onImportKeywordImage,
  onImportPauseKeywordImage,
  onCycleKeywordImage,
  onCyclePauseKeywordImage,
  onRemoveKeywordImage,
  onRemovePauseKeywordImage,
  onKeepImportedParagraphImages,
  activeSpeechIndex = null,
  generatingSpeechIndex = null,
  onPlaySpeechParagraph,
  onRegenerateSpeechParagraph,
  onRemoveSection,
  placeholder,
  density = "comfortable",
  segmentBudgetAlerts = [],
  scrollContainerRef,
}: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const editorContainerRef = React.useRef<HTMLDivElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const [paragraphLayouts, setParagraphLayouts] = React.useState<ParagraphLayout[]>([]);

  const markers = React.useMemo(() => buildScriptSegmentMarkers(script), [script]);
  const blockRanges = React.useMemo(() => markerBlockRanges(script, markers), [script, markers]);
  const visualHints = React.useMemo(
    () => (showVisualHints ? buildScriptVisualHints(markers) : []),
    [markers, showVisualHints],
  );
  const segments = React.useMemo(
    () => (showHighlights ? buildScriptHighlightSegments(script, suggestions) : []),
    [script, suggestions, showHighlights],
  );
  const deliverySegments = React.useMemo(
    () =>
      showDeliveryEmphasis
        ? buildDeliveryHighlightSegments(script, deliveryAnalysis)
        : [],
    [script, showDeliveryEmphasis, deliveryAnalysis],
  );
  const showHighlightLayer = showHighlights && suggestions.length > 0;
  const showDeliveryLayer =
    showDeliveryEmphasis && deliverySegments.some((s) => s.type === "emphasis");

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function syncHeight() {
      if (!textarea) return;
      textarea.style.height = "0px";
      const minHeight = density === "compact" ? 480 : 600;
      textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
    }

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [script, density, showHighlightLayer, showDeliveryLayer, markers.length]);

  React.useLayoutEffect(() => {
    const measureEl = measureRef.current;
    const containerEl = editorContainerRef.current;
    const textarea = textareaRef.current;
    if (!measureEl || !containerEl) {
      setParagraphLayouts([]);
      return;
    }

    function updateLayouts() {
      if (!measureEl || !containerEl) return;
      if (textarea) {
        measureEl.style.width = `${textarea.clientWidth}px`;
      }
      setParagraphLayouts(measureParagraphLayouts(measureEl, containerEl, script, markers));
    }

    updateLayouts();

    const observer = new ResizeObserver(updateLayouts);
    observer.observe(measureEl);
    observer.observe(containerEl);
    if (textarea) observer.observe(textarea);
    window.addEventListener("resize", updateLayouts);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayouts);
    };
  }, [script, markers, density]);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !gutter) return;

    function syncGutterHeight() {
      if (!textarea || !gutter) return;
      gutter.style.height = `${textarea.clientHeight}px`;
      gutter.style.maxHeight = `${textarea.clientHeight}px`;
    }

    syncGutterHeight();
    const observer = new ResizeObserver(syncGutterHeight);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [script]);

  React.useEffect(() => {
    if (activeSpeechIndex === null) return;
    const markerIndex = markers.findIndex((m) => m.speechIndex === activeSpeechIndex);
    if (markerIndex < 0) return;
    const layout = paragraphLayouts[markerIndex];
    if (!layout) return;

    const scrollEl = scrollContainerRef?.current;
    const containerEl = editorContainerRef.current;
    if (scrollEl && containerEl) {
      const scrollRect = scrollEl.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      const relativeTop = containerRect.top - scrollRect.top + scrollEl.scrollTop + layout.top;
      scrollEl.scrollTo({
        top: relativeTop - scrollEl.clientHeight / 2 + layout.height / 2,
        behavior: "smooth",
      });
      return;
    }

    editorContainerRef.current
      ?.querySelector(`[data-speech-index="${activeSpeechIndex}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSpeechIndex, scrollContainerRef, paragraphLayouts, markers]);

  const showGutter = markers.length > 0;
  const showNarrationControls = onPlaySpeechParagraph !== undefined;
  const showImageControls =
    onSearchParagraphImages !== undefined || onSearchPauseImages !== undefined;
  const showTrailingControls =
    markers.length > 0 && (showVisualHints || showNarrationControls || showImageControls);

  const editorTypography = cn(
    "whitespace-pre-wrap break-words font-serif tracking-[0.005em]",
    density === "compact" ? "text-sm leading-6" : "text-base leading-7",
  );
  const editorPaddingX = density === "compact" ? "px-8" : "px-10";
  const editorPaddingY = density === "compact" ? "py-8" : "py-10";
  const editorPadding = cn(editorPaddingX, editorPaddingY);
  const editorMinHeight = density === "compact" ? "min-h-[480px]" : "min-h-[600px]";

  return (
    <div className="flex min-w-0">
      {showGutter && (
        <div
          ref={gutterRef}
          aria-hidden
          className="flex w-10 flex-shrink-0 flex-col items-center overflow-hidden border-r border-border/40 bg-muted/10 pl-1 pr-0.5"
          style={{ paddingTop: density === "compact" ? "2rem" : "2.5rem", paddingBottom: density === "compact" ? "2rem" : "2.5rem" }}
        >
          {markers.map((marker, index) => {
            const layout = paragraphLayouts[index];
            const gutterHeight =
              layout && index < markers.length - 1 && paragraphLayouts[index + 1]
                ? paragraphLayouts[index + 1]!.top - layout.top
                : layout?.height;

            return (
            <div
              key={`${marker.role}-${index}`}
              className="flex w-full items-start justify-center"
              style={{
                minHeight: gutterHeight ?? undefined,
              }}
            >
              <StructureIcon marker={marker} alert={segmentBudgetAlerts[index]} />
            </div>
            );
          })}
        </div>
      )}

      <div ref={editorContainerRef} className="relative min-w-0 flex-1">
        <div
          ref={measureRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 top-0 -z-10 w-full whitespace-pre-wrap break-words opacity-0",
            editorPadding,
            editorTypography,
          )}
        >
          {script}
        </div>

        {markers.some((marker) => marker.role === "section") ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[3]">
            <div className={cn("relative h-full w-full", editorPaddingX)}>
              {markers.map((marker, index) => {
                if (marker.role !== "section") return null;
                const layout = paragraphLayouts[index];
                if (!layout) return null;
                return (
                  <div
                    key={`section-overlay-${index}`}
                    className="pointer-events-none absolute left-0 right-0"
                    style={{ top: layout.top }}
                  >
                    <SectionMarkerBlock
                      marker={marker}
                      density={density}
                      onRemove={onRemoveSection ? () => onRemoveSection(index) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeSpeechIndex !== null ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[2]">
            <div className={cn("relative h-full w-full", editorPaddingX)}>
              {markers.map((marker, index) => {
                if (marker.speechIndex !== activeSpeechIndex) return null;
                const layout = paragraphLayouts[index];
                if (!layout) return null;
                return (
                  <div
                    key={`active-${index}`}
                    data-speech-index={marker.speechIndex}
                    className="absolute left-0 right-0 rounded-sm bg-sky-400/12 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                    style={{ top: layout.top, height: layout.height }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {showTrailingControls ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[6]">
            {markers.map((marker, index) => {
              const range = blockRanges[index];
              const speechIdx = marker.speechIndex;
              const pauseIdx = marker.pauseIndex;
              const clip =
                speechIdx !== undefined
                  ? narrationClipForSpeechIndex(
                      paragraphClips,
                      speechIdx,
                      scriptParagraphTextKey(marker.displayText),
                    )
                  : null;
              const imageSearch =
                speechIdx !== undefined
                  ? paragraphImages.find(
                      (entry) => entry.speechIndex === speechIdx && entry.pauseIndex === undefined,
                    )
                  : pauseIdx !== undefined
                    ? paragraphImages.find((entry) => entry.pauseIndex === pauseIdx)
                    : undefined;
              const isOutdated =
                speechIdx !== undefined &&
                !clip &&
                paragraphClips.some((c) => c.speechIndex === speechIdx);
              const isGenerating =
                speechIdx !== undefined && generatingSpeechIndex === speechIdx;
              const isSearching =
                speechIdx !== undefined
                  ? searchingSpeechIndex === speechIdx
                  : pauseIdx !== undefined && searchingPauseIndex === pauseIdx;
              const isSearchingVideo =
                speechIdx !== undefined &&
                (searchingVideoSpeechIndex === speechIdx ||
                  searchingVideoSpeechIndex === "all");
              const isAiPicking =
                speechIdx !== undefined &&
                (aiPickingSpeechIndex === speechIdx || aiPickingSpeechIndex === "all");
              const isActive =
                speechIdx !== undefined && activeSpeechIndex === speechIdx;
              const showNarration = speechIdx !== undefined && showNarrationControls;
              const showImages =
                (speechIdx !== undefined || pauseIdx !== undefined) && showImageControls;
              const importedKeywordCount =
                imageSearch?.keywords.filter((kw) => Boolean(kw.importedUrl?.trim())).length ??
                0;
              const hasUnimportedExtras =
                Boolean(imageSearch?.keywords.length) &&
                importedKeywordCount > 0 &&
                (imageSearch?.keywords.length ?? 0) > importedKeywordCount;
              const showTrailingRow =
                showImages ||
                (showVisualHints && visualHints[index] && !imageSearch?.keywords.length) ||
                showNarration;

              const layout = paragraphLayouts[index];
              if (!showTrailingRow || !layout || !range) return null;

              const blockText = script.slice(range.start, range.end);

              return (
                <div
                  key={`trail-${index}`}
                  className="pointer-events-none absolute left-0 right-0 overflow-visible"
                  style={{ top: layout.top, zIndex: 10 + index }}
                >
                  <div
                    className={cn(
                      editorPaddingX,
                      editorTypography,
                      "whitespace-pre-wrap break-words",
                    )}
                  >
                    <span className="text-transparent">{blockText}</span>
                    {showImages ? (
                      <ParagraphImageControls
                        isSearching={isSearching}
                        isGeneratingAi={
                          speechIdx !== undefined && generatingParagraphImageIndex === speechIdx
                        }
                        isAiPicking={isAiPicking}
                        isSearchingVideo={isSearchingVideo}
                        hasResults={Boolean(imageSearch?.keywords.length)}
                        hasUnimportedExtras={hasUnimportedExtras}
                        density={density}
                        onAutoSearch={() =>
                          pauseIdx !== undefined
                            ? onSearchPauseImages!(pauseIdx)
                            : onSearchParagraphImages!(speechIdx!)
                        }
                        onAiPick={
                          speechIdx !== undefined && onAiPickParagraphImages
                            ? () => onAiPickParagraphImages(speechIdx)
                            : undefined
                        }
                        onCustomSearch={(keyword) =>
                          pauseIdx !== undefined
                            ? onSearchCustomPauseImage?.(pauseIdx, keyword)
                            : onSearchCustomParagraphImage?.(speechIdx!, keyword)
                        }
                        onAutoVideoSearch={
                          speechIdx !== undefined && onSearchParagraphVideo
                            ? () => onSearchParagraphVideo!(speechIdx)
                            : undefined
                        }
                        onGenerateAi={
                          speechIdx !== undefined && onGenerateParagraphImage
                            ? (prompt) => onGenerateParagraphImage(speechIdx, prompt)
                            : undefined
                        }
                        onKeepImportedOnly={
                          speechIdx !== undefined && onKeepImportedParagraphImages
                            ? () => onKeepImportedParagraphImages(speechIdx)
                            : undefined
                        }
                        pauseHold={pauseIdx !== undefined}
                      />
                    ) : null}
                    {showImages && imageSearch?.keywords.length
                      ? imageSearch.keywords
                          .filter(keywordImageMatchIsVisible)
                          .map((kw) => (
                            <KeywordImageBubble
                              key={`${speechIdx ?? `pause-${pauseIdx}`}-${kw.keyword}`}
                              match={kw}
                              density={density}
                              onImport={() =>
                                pauseIdx !== undefined
                                  ? onImportPauseKeywordImage?.(pauseIdx, kw.keyword)
                                  : onImportKeywordImage?.(speechIdx!, kw.keyword)
                              }
                              onCycle={() =>
                                pauseIdx !== undefined
                                  ? onCyclePauseKeywordImage?.(pauseIdx, kw.keyword)
                                  : onCycleKeywordImage?.(speechIdx!, kw.keyword)
                              }
                              onRemove={
                                pauseIdx !== undefined
                                  ? onRemovePauseKeywordImage
                                    ? () => onRemovePauseKeywordImage(pauseIdx, kw.keyword)
                                    : undefined
                                  : onRemoveKeywordImage
                                    ? () => onRemoveKeywordImage(speechIdx!, kw.keyword)
                                    : undefined
                              }
                            />
                          ))
                      : null}
                    {showVisualHints && visualHints[index] && !imageSearch?.keywords.length ? (
                      <VisualHintBubble hint={visualHints[index]!} density={density} />
                    ) : null}
                    {showNarration ? (
                      <ParagraphNarrationChip
                        hasClip={Boolean(clip)}
                        isOutdated={isOutdated}
                        isActive={isActive}
                        isGenerating={isGenerating}
                        density={density}
                        onPlay={() => onPlaySpeechParagraph!(speechIdx!)}
                        onRegenerate={
                          onRegenerateSpeechParagraph
                            ? () => onRegenerateSpeechParagraph(speechIdx!)
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {showDeliveryLayer && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[4]">
            <div className={cn(editorPadding, editorTypography)}>
              {deliverySegments.map((seg, i) =>
                seg.type === "text" ? (
                  <span key={`del-${i}`} className="text-transparent">
                    {seg.value}
                  </span>
                ) : (
                  <span
                    key={`del-${i}`}
                    title={seg.label}
                    className={cn(
                      "pointer-events-auto cursor-help rounded-sm px-0.5 text-transparent",
                      deliveryEmphasisClass(seg.kind),
                    )}
                  >
                    {seg.value}
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        {showHighlightLayer && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
            <div className={cn(editorPadding, editorTypography)}>
              {segments.map((seg, i) =>
                seg.type === "text" ? (
                  <span key={i} className="text-transparent">
                    {seg.value}
                  </span>
                ) : (
                  <mark
                    key={i}
                    className={cn(
                      "pointer-events-auto cursor-pointer rounded-sm px-0.5 text-transparent",
                      severityHighlightClass(seg.severity),
                      activeSuggestionId === seg.suggestionId && "ring-2 ring-inset ring-accent",
                    )}
                    onClick={() =>
                      onSelectSuggestion(
                        activeSuggestionId === seg.suggestionId ? null : seg.suggestionId,
                      )
                    }
                  >
                    {seg.value}
                  </mark>
                ),
              )}
            </div>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={script}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "relative z-[2] w-full resize-none overflow-hidden border-0 bg-transparent",
            editorPadding,
            editorMinHeight,
            editorTypography,
            "text-foreground",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            showHighlightLayer && "bg-transparent",
            showDeliveryLayer && "bg-transparent",
          )}
          spellCheck={true}
        />
      </div>
    </div>
  );
}
