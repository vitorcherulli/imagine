"use client";

import * as React from "react";
import { Globe2, ImageIcon, Loader2, Search, Sparkles } from "lucide-react";
import { ImageSearchResultsTabs } from "@/components/ImageSearchResultsTabs";
import {
  type ImageSearchGroup,
  type ImageSearchProvidersStatus,
  type ImageSearchResult,
} from "@/lib/image-search";
import type { VideoFormat } from "@/lib/video-format";
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
  blockId?: string;
  videoFormat?: VideoFormat | string | null;
  /** Fallback when blockId is missing or suggest fails. */
  initialQuery?: string;
  onSelect: (result: ImageSearchResult) => void | Promise<void>;
  busy?: boolean;
}

const EMPTY_GROUPS: ImageSearchGroup[] = [
  { id: "serper", label: "Google", configured: false, results: [] },
  { id: "pexels", label: "Pexels", configured: false, results: [] },
  { id: "wikimedia", label: "Wikimedia", configured: true, results: [] },
];

export function ReferenceImageImportDialog({
  open,
  onOpenChange,
  blockId,
  videoFormat,
  initialQuery = "",
  onSelect,
  busy = false,
}: Props) {
  const [query, setQuery] = React.useState(initialQuery);
  const [suggestKeywords, setSuggestKeywords] = React.useState<string[]>([]);
  const [suggestNote, setSuggestNote] = React.useState<string | null>(null);
  const [providerLabel, setProviderLabel] = React.useState("Google + Pexels + Wikimedia");
  const [providers, setProviders] = React.useState<ImageSearchProvidersStatus | null>(null);
  const [googleConfig, setGoogleConfig] = React.useState<{
    hasCseId: boolean;
    hasApiKey: boolean;
  } | null>(null);
  const [groups, setGroups] = React.useState<ImageSearchGroup[]>(EMPTY_GROUPS);
  const [loading, setLoading] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadProviders() {
    try {
      const res = await fetch("/api/image-search", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.providers) setProviders(data.providers);
      if (data.googleConfig) setGoogleConfig(data.googleConfig);
      if (data.providerLabel) setProviderLabel(data.providerLabel);
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          configured:
            g.id === "serper" || g.id === "google"
              ? Boolean(data.providers?.googleImages)
              : g.id === "pexels"
                ? Boolean(data.providers?.pexels)
                : true,
        })),
      );
    } catch {
      // ignore
    }
  }

  async function runSearch(searchQuery?: string) {
    const q = (searchQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 8, videoFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setGroups(data.groups?.length ? data.groups : EMPTY_GROUPS);
      if (data.providers) setProviders(data.providers);
      if (data.googleConfig) setGoogleConfig(data.googleConfig);
      setProviderLabel(data.providerLabel ?? "Google + Pexels + Wikimedia");
      setSearched(true);
      if ((data.results?.length ?? 0) === 0) {
        setError(`Nenhuma foto para "${q}". Tente uma frase mais curta ou outras palavras.`);
      }
    } catch (err) {
      setGroups(EMPTY_GROUPS);
      setSearched(true);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setGroups(EMPTY_GROUPS);
    setSearched(false);
    setError(null);
    setSuggestKeywords([]);
    setSuggestNote(null);
    void loadProviders();

    async function bootstrap() {
      if (blockId) {
        setSuggesting(true);
        try {
          const res = await fetch(`/api/blocks/${blockId}/keyframe/search-suggest`, {
            method: "POST",
          });
          const data = await res.json();
          if (cancelled) return;
          if (res.ok && typeof data.query === "string" && data.query.trim()) {
            const q = data.query.trim();
            setQuery(q);
            setSuggestKeywords(
              Array.isArray(data.keywords)
                ? data.keywords.filter((k: unknown): k is string => typeof k === "string")
                : [q],
            );
            const bits = [
              data.source === "llm" ? "Suggested from project + scene" : "Suggested from scene text",
              data.location ? `Location: ${data.location}` : null,
              data.isPauseBlock ? "Music-moment block — using nearby scene context" : null,
            ].filter(Boolean);
            setSuggestNote(bits.join(" · "));
            setSuggesting(false);
            await runSearch(q);
            return;
          }
        } catch {
          // fall through to initialQuery
        } finally {
          if (!cancelled) setSuggesting(false);
        }
      }

      const fallback = initialQuery.trim();
      setQuery(fallback);
      if (fallback) {
        await runSearch(fallback);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockId]);

  const showBusy = loading || suggesting;
  const googleOff = providers?.googleImages === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import reference photo</DialogTitle>
          <DialogDescription>
            Busca em paralelo no Google, Pexels e Wikimedia. Cada fonte tem sua aba — escolha a foto
            para usar como keyframe deste bloco.
          </DialogDescription>
        </DialogHeader>

        {googleOff ? (
          <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950 dark:text-amber-100">
            Google Images desligado — adicione{" "}
            <code className="text-[10px]">SERPER_API_KEY</code> (recomendado) no{" "}
            <code className="text-[10px]">.env</code>. Veja a aba <strong>Google</strong>.
          </p>
        ) : null}

        {suggestNote ? (
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
            <span>{suggestNote}</span>
          </p>
        ) : null}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Furnas reservoir Capitólio Minas Gerais aerial"
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

        {suggestKeywords.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {suggestKeywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                disabled={showBusy || busy}
                onClick={() => {
                  setQuery(keyword);
                  void runSearch(keyword);
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  query.trim() === keyword
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {keyword}
              </button>
            ))}
          </div>
        ) : null}

        <div className="max-h-[min(60vh,420px)] overflow-auto rounded-md border border-border p-2 scrollbar-thin">
          {suggesting ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Building search from project &amp; scene…
            </div>
          ) : loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching Google, Pexels &amp; Wikimedia…
            </div>
          ) : error && !groups.some((g) => g.results.length > 0) ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
                <Globe2 className="h-8 w-8 opacity-40" />
                <p>{error}</p>
              </div>
              <ImageSearchResultsTabs
                groups={groups}
                onSelect={onSelect}
                busy={busy}
                searched={searched}
                googleConfig={googleConfig ?? undefined}
              />
            </div>
          ) : !searched ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p>Busque para ver fotos em cada aba ({providerLabel}).</p>
            </div>
          ) : (
            <ImageSearchResultsTabs
              groups={groups}
              onSelect={onSelect}
              busy={busy}
              searched={searched}
              googleConfig={googleConfig ?? undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
