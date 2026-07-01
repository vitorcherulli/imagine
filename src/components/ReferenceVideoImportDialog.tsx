"use client";

import * as React from "react";
import { Check, Film, Globe2, Loader2, Search, Sparkles } from "lucide-react";
import type { VideoSearchResult } from "@/lib/video-search";
import { DEFAULT_VIDEO_SEARCH_LIMIT } from "@/lib/video-search";
import type { VideoFormat } from "@/lib/video-format";
import type { StockVideoUsageMap } from "@/lib/stock-video-usage-server";
import { pickBestStockSearchQuery, sanitizeStockSearchQuery } from "@/lib/stock-search-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  blockId?: string;
  blockPosition?: number;
  videoFormat?: VideoFormat | string | null;
  initialQuery?: string;
  onSelect: (result: VideoSearchResult) => void | Promise<void>;
  busy?: boolean;
}

const SUGGEST_TIMEOUT_MS = 4500;

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function ReferenceVideoImportDialog({
  open,
  onOpenChange,
  projectId,
  blockId,
  blockPosition,
  videoFormat,
  initialQuery = "",
  onSelect,
  busy = false,
}: Props) {
  const [query, setQuery] = React.useState(initialQuery);
  const [suggestKeywords, setSuggestKeywords] = React.useState<string[]>([]);
  const [suggestNote, setSuggestNote] = React.useState<string | null>(null);
  const [providerLabel, setProviderLabel] = React.useState("Pexels");
  const [results, setResults] = React.useState<VideoSearchResult[]>([]);
  const [usage, setUsage] = React.useState<StockVideoUsageMap>({});
  const [loading, setLoading] = React.useState(false);
  const [refining, setRefining] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const searchSeqRef = React.useRef(0);

  const loadUsage = React.useCallback(async () => {
    if (!projectId) {
      setUsage({});
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/stock-video-usage`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.usage && typeof data.usage === "object") {
        setUsage(data.usage as StockVideoUsageMap);
      }
    } catch {
      // non-fatal
    }
  }, [projectId]);

  const runSearch = React.useCallback(
    async (searchQuery: string): Promise<number> => {
      const q = sanitizeStockSearchQuery(searchQuery);
      if (!q) return 0;
      const seq = ++searchSeqRef.current;
      setLoading(true);
      setError(null);
      setQuery(q);
      try {
        const res = await fetch("/api/video-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            limit: DEFAULT_VIDEO_SEARCH_LIMIT,
            videoFormat,
            projectId,
          }),
        });
        const data = await res.json();
        if (seq !== searchSeqRef.current) return 0;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        const found = (data.results ?? []) as VideoSearchResult[];
        setResults(found);
        setProviderLabel(data.providerLabel ?? "Pexels");
        if (data.usage && typeof data.usage === "object") {
          setUsage(data.usage as StockVideoUsageMap);
        }
        setSearched(true);
        if (found.length === 0) {
          setError("No results — try a shorter phrase or one of the chips above.");
        }
        return found.length;
      } catch (err) {
        if (seq !== searchSeqRef.current) return 0;
        setResults([]);
        setSearched(true);
        setError(err instanceof Error ? err.message : "Search failed");
        return 0;
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    },
    [videoFormat, projectId],
  );

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    searchSeqRef.current += 1;
    setResults([]);
    setSearched(false);
    setError(null);
    setSuggestKeywords([]);
    setSuggestNote(null);
    setRefining(false);
    setLoading(false);
    void loadUsage();

    async function fetchSuggest(fast: boolean): Promise<{
      query?: string;
      keywords?: string[];
      source?: string;
      location?: string | null;
      isPauseBlock?: boolean;
    } | null> {
      if (!blockId) return null;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS);
      try {
        const res = await fetch(
          `/api/blocks/${blockId}/keyframe/search-suggest${fast ? "?fast=1" : ""}`,
          { method: "POST", signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) return null;
        return data;
      } catch {
        return null;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    async function bootstrap() {
      const quickQuery = pickBestStockSearchQuery([initialQuery]);
      let resultCount = 0;
      if (quickQuery) {
        resultCount = await runSearch(quickQuery);
        if (cancelled) return;
      }

      if (!blockId) return;

      const fast = await fetchSuggest(true);
      if (cancelled) return;

      const fastQuery = pickBestStockSearchQuery([
        typeof fast?.query === "string" ? fast.query : null,
        ...(Array.isArray(fast?.keywords) ? fast.keywords : []),
        initialQuery,
      ]);

      if (fastQuery) {
        setSuggestKeywords(
          Array.isArray(fast?.keywords)
            ? fast.keywords
                .map((k) => sanitizeStockSearchQuery(String(k)))
                .filter((k) => k.length > 2)
            : [fastQuery],
        );
        if (fast?.location) {
          setSuggestNote(`Suggested from scene · Location: ${fast.location}`);
        }
        if (fastQuery !== quickQuery && resultCount === 0) {
          resultCount = await runSearch(fastQuery);
          if (cancelled) return;
        }
      }

      setRefining(true);
      const smart = await fetchSuggest(false);
      if (cancelled) return;
      setRefining(false);

      if (smart && typeof smart.query === "string" && smart.query.trim()) {
        const smartQuery = sanitizeStockSearchQuery(smart.query);
        const keywords = Array.isArray(smart.keywords)
          ? smart.keywords
              .map((k) => sanitizeStockSearchQuery(String(k)))
              .filter((k) => k.length > 2)
          : [];
        if (keywords.length > 0) setSuggestKeywords(keywords);
        const bits = [
          smart.source === "llm" ? "Refined with AI from project + scene" : "Suggested from scene text",
          smart.location ? `Location: ${smart.location}` : null,
          smart.isPauseBlock ? "Music-moment block — nearby scene context" : null,
        ].filter(Boolean);
        setSuggestNote(bits.join(" · "));

        if (smartQuery.length >= 3 && smartQuery !== fastQuery && resultCount === 0) {
          await runSearch(smartQuery);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      searchSeqRef.current += 1;
    };
  }, [open, blockId, initialQuery, runSearch, loadUsage]);

  const showBusy = loading;

  function usageLabel(result: VideoSearchResult): string | null {
    const hit = usage[result.id];
    if (!hit) return null;
    if (blockId && hit.blockId === blockId) return "On this block";
    return `Block ${hit.position + 1}`;
  }

  async function handleSelect(result: VideoSearchResult) {
    await onSelect(result);
    if (!blockId) return;
    setUsage((prev) => ({
      ...prev,
      [result.id]: {
        blockId,
        position: blockPosition ?? prev[result.id]?.position ?? 0,
      },
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import stock video</DialogTitle>
          <DialogDescription>
            Search {providerLabel} for free B-roll clips. The clip is trimmed or looped to match this
            block&apos;s duration and saved to your project gallery.
          </DialogDescription>
        </DialogHeader>

        {suggestNote ? (
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
            <span>
              {suggestNote}
              {refining ? " · refining…" : null}
            </span>
          </p>
        ) : refining ? (
          <p className="text-[11px] text-muted-foreground">Refining search with AI…</p>
        ) : null}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. ocean waves aerial, amazon wetland aerial"
            className="text-sm"
            disabled={showBusy || busy}
          />
          <Button type="submit" size="sm" disabled={showBusy || busy || !query.trim()}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
          </Button>
        </form>

        {suggestKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {suggestKeywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                disabled={showBusy || busy}
                onClick={() => {
                  void runSearch(keyword);
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  sanitizeStockSearchQuery(query) === keyword
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {keyword}
              </button>
            ))}
          </div>
        ) : null}

        <div className="max-h-[min(65vh,520px)] overflow-auto rounded-md border border-border p-2 scrollbar-thin">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching Pexels…
            </div>
          ) : error ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <Globe2 className="h-8 w-8 opacity-40" />
              <p>{error}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Film className="h-8 w-8 opacity-40" />
              <p>
                {searched
                  ? "No results — try a chip above or edit the search."
                  : "Search to find stock videos."}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 px-0.5 text-[10px] font-semibold text-foreground">
                Stock API · Pexels
              </p>
              <p className="mb-2 px-0.5 text-[10px] text-muted-foreground">
                {results.length} clip{results.length === 1 ? "" : "s"} · green badge = already on
                timeline
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {results.map((result) => {
                const durationLabel = formatDuration(result.durationSeconds);
                const importedLabel = usageLabel(result);
                const onThisBlock = importedLabel === "On this block";
                return (
                  <button
                    key={result.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSelect(result)}
                    className={cn(
                      "group relative overflow-hidden rounded-md border bg-background text-left transition-colors hover:border-accent hover:ring-1 hover:ring-accent/40",
                      onThisBlock
                        ? "border-success/60 ring-1 ring-success/30"
                        : importedLabel
                          ? "border-success/30"
                          : "border-border",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.previewUrl}
                      alt={result.sourceTitle ?? result.id}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                    {durationLabel ? (
                      <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                        {durationLabel}
                      </span>
                    ) : null}
                    {importedLabel ? (
                      <span
                        className={cn(
                          "absolute left-1 top-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-medium text-white",
                          onThisBlock ? "bg-success/90" : "bg-black/75",
                        )}
                      >
                        <Check className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{importedLabel}</span>
                      </span>
                    ) : null}
                    <div className="space-y-0.5 p-1.5">
                      <p className="truncate text-[10px] font-medium capitalize">Pexels</p>
                      <p className="line-clamp-2 text-[9px] text-muted-foreground">
                        {result.attribution ?? result.sourceTitle ?? "Stock video"}
                      </p>
                    </div>
                  </button>
                );
              })}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
