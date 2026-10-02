"use client";

import * as React from "react";
import { Check, ChevronDown, Film, ImageIcon, Loader2, Search, Star } from "lucide-react";
import { isNewCatalogModel, type CatalogModel, type CatalogModelKind } from "@/lib/model-catalog";
import { toggleFavoriteModel } from "@/lib/favorite-models";
import { modelLabel, useFavoriteModels, useModelCatalog } from "@/hooks/use-model-catalog";
import {
  isVariationImageModel,
  isVariationVideoModel,
  VARIATION_MODEL_STORAGE_KEYS,
} from "@/lib/variations";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function VariationModelSelect({
  kind,
  value,
  onChange,
  label,
  usage = "variations",
  placement = "bottom",
  compact = false,
}: {
  kind: CatalogModelKind;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  usage?: "variations" | "all";
  placement?: "bottom" | "top";
  /** Trigger only — no label row or favorite chips (for toolbars). */
  compact?: boolean;
}) {
  const { models, loading } = useModelCatalog(kind, usage);
  const favorites = useFavoriteModels()[kind];
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const Icon = kind === "image" ? ImageIcon : Film;
  const current = models.find((m) => m.value === value);
  const isFavorite = favorites.includes(value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const favoriteModels = React.useMemo(
    () => favorites.map((id) => models.find((m) => m.value === id)).filter((m): m is CatalogModel => !!m),
    [favorites, models],
  );

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = models.filter((m) =>
        `${m.label} ${m.provider} ${m.value}`.toLowerCase().includes(q),
      );
      hits.sort((a, b) => Number(favorites.includes(b.value)) - Number(favorites.includes(a.value)));
      return [{ title: `${hits.length} result${hits.length === 1 ? "" : "s"}`, items: hits }];
    }
    const rest = models.filter((m) => !favorites.includes(m.value));
    return [
      { title: "Favorites", items: favoriteModels },
      { title: "New", items: rest.filter((m) => isNewCatalogModel(m)) },
      { title: "All models", items: rest.filter((m) => !isNewCatalogModel(m)) },
    ].filter((s) => s.items.length > 0);
  }, [query, models, favorites, favoriteModels]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative min-w-0 space-y-1">
      <div className={cn("flex items-center justify-between gap-2", compact && "hidden")}>
        <Label className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Icon className="h-3 w-3" /> {label ?? (kind === "image" ? "Image AI" : "Video AI")}
        </Label>
        <button
          type="button"
          onClick={() => toggleFavoriteModel(kind, value)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 text-2xs transition-colors",
            isFavorite ? "text-accent hover:text-accent/80" : "text-muted-foreground hover:text-foreground",
          )}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-3 w-3", isFavorite && "fill-current")} />
          {isFavorite ? "Favorite" : "Add favorite"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1",
          compact ? "h-7" : "h-8",
        )}
        title={label}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {compact ? <Icon className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
          {isFavorite ? <Star className="h-3 w-3 shrink-0 fill-accent text-accent" /> : null}
          <span className="truncate font-medium">{modelLabel(models, value)}</span>
          {current?.provider ? (
            <span className="truncate text-muted-foreground">· {current.provider}</span>
          ) : null}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {favoriteModels.length > 0 && !compact ? (
        <div className="flex flex-wrap gap-1">
          {favoriteModels.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                value === m.value
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              <Star className="h-2.5 w-2.5 fill-current" />
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            "absolute left-0 z-50 w-[min(380px,90vw)] overflow-hidden rounded-md border border-border bg-background shadow-lg",
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${models.length} ${kind} models…`}
              className="h-8 flex-1 bg-transparent text-xs outline-none"
            />
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {sections.map((section) => (
              <div key={section.title} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </div>
                {section.items.map((m) => (
                  <ModelRow
                    key={`${section.title}-${m.value}`}
                    model={m}
                    selected={m.value === value}
                    favorite={favorites.includes(m.value)}
                    onPick={() => pick(m.value)}
                    onToggleFavorite={() => toggleFavoriteModel(kind, m.value)}
                  />
                ))}
              </div>
            ))}
            {sections.length === 0 ? (
              <p className="px-2 py-4 text-center text-2xs text-muted-foreground">No models found.</p>
            ) : null}
          </div>
          <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
            Live list from OpenRouter · click ★ to keep a model in Favorites
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  favorite,
  onPick,
  onToggleFavorite,
}: {
  model: CatalogModel;
  selected: boolean;
  favorite: boolean;
  onPick: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPick();
      }}
      title={model.description}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted focus:bg-muted focus:outline-none",
        selected && "bg-accent/10",
      )}
    >
      <Check className={cn("h-3 w-3 shrink-0 text-accent", !selected && "invisible")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{model.label}</span>
          {isNewCatalogModel(model) ? (
            <span className="shrink-0 rounded bg-accent/15 px-1 text-[9px] font-semibold uppercase text-accent">
              New
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {model.provider}
          {model.priceHint ? ` · ${model.priceHint}` : ""}
          {model.durations?.length ? ` · ${Math.min(...model.durations)}–${Math.max(...model.durations)}s` : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          "shrink-0 rounded p-1 transition-colors",
          favorite ? "text-accent" : "text-muted-foreground/50 hover:text-foreground",
        )}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
      </button>
    </div>
  );
}

/** Last model picked in Variations, remembered per browser. */
export function useRememberedVariationModel(
  kind: CatalogModelKind,
  fallback: string,
): [string, (value: string) => void] {
  const [value, setValue] = React.useState(fallback);
  const isValid = kind === "image" ? isVariationImageModel : isVariationVideoModel;

  React.useEffect(() => {
    const stored = window.localStorage.getItem(VARIATION_MODEL_STORAGE_KEYS[kind]);
    if (isValid(stored)) setValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const update = React.useCallback(
    (next: string) => {
      setValue(next);
      rememberVariationModel(kind, next);
    },
    [kind],
  );

  return [value, update];
}

export function rememberVariationModel(kind: CatalogModelKind, value: string): void {
  window.localStorage.setItem(VARIATION_MODEL_STORAGE_KEYS[kind], value);
}
