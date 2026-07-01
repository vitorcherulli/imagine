"use client";

import * as React from "react";
import { ImageIcon, Settings2 } from "lucide-react";
import {
  type ImageSearchGroup,
  type ImageSearchGroupId,
  type ImageSearchResult,
} from "@/lib/image-search";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Props {
  groups: ImageSearchGroup[];
  onSelect: (result: ImageSearchResult) => void | Promise<void>;
  busy?: boolean;
  searched?: boolean;
  googleConfig?: { hasCseId: boolean; hasApiKey: boolean };
}

function ResultGrid({
  results,
  onSelect,
  busy,
}: {
  results: ImageSearchResult[];
  onSelect: (result: ImageSearchResult) => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {results.map((result) => (
        <button
          key={result.id}
          type="button"
          disabled={busy}
          onClick={() => void onSelect(result)}
          className={cn(
            "group overflow-hidden rounded-md border border-border bg-background text-left transition-colors hover:border-accent hover:ring-1 hover:ring-accent/40",
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
          <div className="space-y-0.5 p-1.5">
            <p className="line-clamp-2 text-[9px] text-muted-foreground">
              {result.attribution ?? result.sourceTitle ?? "Reference photo"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function googleSetupHint(config?: {
  hasCseId: boolean;
  hasApiKey: boolean;
}): string {
  if (!config) return "Configure GOOGLE_CSE_ID e GOOGLE_CUSTOM_SEARCH_API_KEY no .env do servidor.";
  if (config.hasCseId && !config.hasApiKey) {
    return "GOOGLE_CSE_ID já está OK. Falta só GOOGLE_CUSTOM_SEARCH_API_KEY (Google Cloud Console → Custom Search API → Credentials). Reinicie o servidor depois.";
  }
  if (!config.hasCseId && config.hasApiKey) {
    return "Falta GOOGLE_CSE_ID (Search engine ID do motor Imagine: cx=… no painel Programmable Search).";
  }
  return "Defina GOOGLE_CSE_ID e GOOGLE_CUSTOM_SEARCH_API_KEY no .env e reinicie o servidor.";
}

function UnconfiguredPanel({
  groupId,
  googleConfig,
}: {
  groupId: ImageSearchGroupId;
  googleConfig?: { hasCseId: boolean; hasApiKey: boolean };
}) {
  if (groupId === "serper") {
    return (
      <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 text-center">
        <Settings2 className="h-7 w-7 text-muted-foreground/50" />
        <p className="text-xs font-medium text-foreground">Google Images via Serper</p>
        <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">
          Adicione <code className="rounded bg-muted px-1 py-0.5 text-[10px]">SERPER_API_KEY</code>{" "}
          no <code className="text-[10px]">.env</code> do servidor. Chave grátis em{" "}
          <a
            href="https://serper.dev/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            serper.dev/api-keys
          </a>
          .
        </p>
      </div>
    );
  }

  if (groupId === "google") {
    return (
      <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 text-center">
        <Settings2 className="h-7 w-7 text-muted-foreground/50" />
        <p className="text-xs font-medium text-foreground">Google Images não configurado</p>
        <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">
          {googleSetupHint(googleConfig)}
        </p>
        <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">
          No motor <strong>Imagine</strong>: Search Features → ative <strong>Image search</strong>.
          O embed <code className="text-[10px]">&lt;script cse.js&gt;</code> é só para sites — o app
          usa a API JSON, não esse widget.
        </p>
      </div>
    );
  }

  if (groupId === "pexels") {
    return (
      <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 text-center">
        <Settings2 className="h-7 w-7 text-muted-foreground/50" />
        <p className="text-xs font-medium text-foreground">Pexels não configurado</p>
        <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">
          Adicione <code className="rounded bg-muted px-1 py-0.5 text-[10px]">PEXELS_API_KEY</code>{" "}
          no <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env</code> do servidor.
        </p>
      </div>
    );
  }

  return null;
}

function pickDefaultTab(groups: ImageSearchGroup[]): ImageSearchGroupId {
  const withResults = groups.find((g) => g.results.length > 0);
  if (withResults) return withResults.id;
  const configured = groups.find((g) => g.configured);
  return configured?.id ?? "google";
}

export function ImageSearchResultsTabs({
  groups,
  onSelect,
  busy = false,
  searched = false,
  googleConfig,
}: Props) {
  const [activeTab, setActiveTab] = React.useState<ImageSearchGroupId>(() =>
    pickDefaultTab(groups),
  );

  React.useEffect(() => {
    setActiveTab(pickDefaultTab(groups));
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <ImageIcon className="h-8 w-8 opacity-40" />
        <p>{searched ? "Nenhum resultado — tente outra busca." : "Busque para ver fotos."}</p>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ImageSearchGroupId)}>
      <TabsList className="mb-2 grid h-auto w-full grid-cols-3 gap-0.5 p-0.5">
        {groups.map((group) => (
          <TabsTrigger
            key={group.id}
            value={group.id}
            className="flex flex-col gap-0 py-1.5 text-[10px] leading-tight sm:flex-row sm:items-center sm:gap-1.5 sm:text-xs"
          >
            <span>{group.label}</span>
            {group.id === "serper" ? (
              <span className="text-[8px] font-normal text-muted-foreground">Serper</span>
            ) : null}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[9px] font-medium tabular-nums",
                group.results.length > 0
                  ? "bg-accent/15 text-accent"
                  : !group.configured
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted/80 text-muted-foreground",
              )}
            >
              {!group.configured ? "off" : group.results.length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {groups.map((group) => (
        <TabsContent key={group.id} value={group.id} className="mt-0">
          {!group.configured ? (
            <UnconfiguredPanel groupId={group.id} googleConfig={googleConfig} />
          ) : group.results.length === 0 ? (
            <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 text-center">
              <ImageIcon className="h-7 w-7 opacity-40" />
              {group.errorMessage ? (
                <p className="max-w-md text-[11px] leading-snug text-amber-900 dark:text-amber-100">
                  {group.errorMessage}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {searched
                    ? `Nenhum resultado no ${group.label} para esta busca.`
                    : "Busque para ver fotos."}
                </p>
              )}
            </div>
          ) : (
            <ResultGrid results={group.results} onSelect={onSelect} busy={busy} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
