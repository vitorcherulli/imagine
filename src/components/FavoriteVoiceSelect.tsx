"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  favoriteVoicesForModel,
  isFavoriteVoice,
  loadFavoriteVoices,
  sortVoiceOptionsWithFavorites,
  subscribeFavoriteVoices,
  toggleFavoriteVoice,
  type FavoriteVoice,
} from "@/lib/favorite-voices";
import type { VoiceOption } from "@/lib/project-api-models";

interface Props {
  ttsModel: string;
  value: string;
  onValueChange: (voice: string) => void;
  options: VoiceOption[];
  label?: string;
  triggerClassName?: string;
  showFavoriteChips?: boolean;
}

export function FavoriteVoiceSelect({
  ttsModel,
  value,
  onValueChange,
  options,
  label = "Voice",
  triggerClassName,
  showFavoriteChips = true,
}: Props) {
  const [favorites, setFavorites] = React.useState<FavoriteVoice[]>([]);

  React.useEffect(() => {
    setFavorites(loadFavoriteVoices());
    return subscribeFavoriteVoices(() => setFavorites(loadFavoriteVoices()));
  }, []);

  const sorted = React.useMemo(
    () => sortVoiceOptionsWithFavorites(options, ttsModel, favorites),
    [options, ttsModel, favorites],
  );

  const modelFavorites = React.useMemo(
    () => favoriteVoicesForModel(ttsModel, favorites),
    [ttsModel, favorites],
  );

  const favoriteOptions = React.useMemo(() => {
    const byValue = new Map(options.map((o) => [o.value, o]));
    return modelFavorites
      .map((f) => byValue.get(f.voice))
      .filter((o): o is VoiceOption => !!o);
  }, [modelFavorites, options]);

  const canFavorite = value !== "auto";
  const favorited = canFavorite && isFavoriteVoice(ttsModel, value, favorites);

  function handleToggleFavorite() {
    if (!canFavorite) return;
    setFavorites(toggleFavoriteVoice(ttsModel, value));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-2xs text-muted-foreground">{label}</Label>
        {canFavorite && (
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs transition-colors",
              favorited
                ? "text-accent hover:text-accent/80"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("h-3 w-3", favorited && "fill-current")} />
            {favorited ? "Favorited" : "Favorite"}
          </button>
        )}
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn("h-7 text-2xs", triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {favoriteOptions.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Favorites
              </div>
              {favoriteOptions.map((o) => (
                <SelectItem key={`fav-${o.value}`} value={o.value} className="text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-3 w-3 fill-accent text-accent" />
                    {o.label}
                  </span>
                </SelectItem>
              ))}
              <div className="my-1 border-t border-border" />
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                All voices
              </div>
            </>
          )}
          {sorted
            .filter((o) => !favoriteOptions.some((f) => f.value === o.value))
            .map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {showFavoriteChips && favoriteOptions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {favoriteOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onValueChange(o.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                value === o.value
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              <Star className="h-2.5 w-2.5 fill-current" />
              {o.label.split(" — ")[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
