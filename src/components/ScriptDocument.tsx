"use client";

import * as React from "react";
import { Layers, Megaphone, Pause, Sparkles, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildScriptHighlightSegments,
  buildScriptSegmentMarkers,
  severityHighlightClass,
  type ScriptDeliveryAnalysis,
  type ScriptSegmentMarker,
  type ScriptSegmentRole,
  type ScriptSuggestion,
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
  placeholder?: string;
  density?: "comfortable" | "compact";
  segmentBudgetAlerts?: SegmentBudgetAlert[];
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
    alert && alert.role !== "pause"
      ? `${alert.words}w · max ~${alert.maxWords}w`
      : alert?.role === "pause"
        ? `${alert.estimatedSeconds}s · max ${alert.maxSeconds}s`
        : null;
  return (
    <span
      title={
        overBudget && detail ? `${marker.label} — over budget (${detail})` : marker.label
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
  placeholder,
  density = "comfortable",
  segmentBudgetAlerts = [],
}: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const [blockHeights, setBlockHeights] = React.useState<number[]>([]);

  const markers = React.useMemo(() => buildScriptSegmentMarkers(script), [script]);
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
    if (!measureEl) {
      setBlockHeights([]);
      return;
    }

    function updateHeights() {
      if (!measureEl) return;
      const nodes = measureEl.querySelectorAll<HTMLElement>("[data-script-block]");
      setBlockHeights(Array.from(nodes).map((node) => node.offsetHeight));
    }

    updateHeights();

    const observer = new ResizeObserver(updateHeights);
    observer.observe(measureEl);
    window.addEventListener("resize", updateHeights);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeights);
    };
  }, [script, markers]);

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

  const showGutter = markers.length > 0;

  const editorTypography = cn(
    "whitespace-pre-wrap break-words font-serif tracking-[0.005em]",
    density === "compact" ? "text-sm leading-6" : "text-base leading-7",
  );
  const editorPadding = density === "compact" ? "px-8 py-8" : "px-10 py-10";
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
          {markers.map((marker, index) => (
            <div
              key={`${marker.role}-${index}`}
              className="flex w-full items-start justify-center"
              style={{
                minHeight: blockHeights[index] ?? undefined,
                height: blockHeights[index] ?? undefined,
              }}
            >
              <StructureIcon marker={marker} alert={segmentBudgetAlerts[index]} />
            </div>
          ))}
        </div>
      )}

      <div className="relative min-w-0 flex-1">
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 -z-10 w-full opacity-0"
        >
          {markers.map((marker, index) => (
            <div key={`measure-${index}`} data-script-block className={editorPadding}>
              <div className={cn("whitespace-pre-wrap break-words", editorTypography)}>
                {marker.displayText}
              </div>
              {index < markers.length - 1 ? <div className="h-7" /> : null}
            </div>
          ))}
        </div>

        {showVisualHints && markers.length > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[3]">
            <div className={cn(editorPadding, editorTypography)}>
              <span className="whitespace-pre-wrap break-words">
                {markers.map((marker, index) => (
                  <React.Fragment key={`visual-${index}`}>
                    {index > 0 ? "\n\n" : null}
                    <span className="text-transparent">{marker.displayText}</span>
                    {visualHints[index] ? (
                      <VisualHintBubble hint={visualHints[index]!} density={density} />
                    ) : null}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
        )}

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
