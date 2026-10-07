"use client";

import * as React from "react";
import { catalogFallback, type CatalogModel, type CatalogModelKind, type CatalogUsage } from "@/lib/model-catalog";
import { loadFavoriteModels, subscribeFavoriteModels, type FavoriteModels } from "@/lib/favorite-models";

const pending = new Map<string, Promise<CatalogModel[]>>();

function loadCatalog(kind: CatalogModelKind, usage: CatalogUsage): Promise<CatalogModel[]> {
  const key = `${kind}:${usage}`;
  let p = pending.get(key);
  if (!p) {
    p = fetch(`/api/models/catalog?kind=${kind}&for=${usage}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { models?: CatalogModel[] }) => (d.models?.length ? d.models : catalogFallback(kind, usage)))
      .catch(() => {
        pending.delete(key);
        return catalogFallback(kind, usage);
      });
    pending.set(key, p);
  }
  return p;
}

/** Live OpenRouter catalog (shared across components), with the built-in list while loading. */
export function useModelCatalog(
  kind: CatalogModelKind,
  usage: CatalogUsage = "variations",
): { models: CatalogModel[]; loading: boolean } {
  const [models, setModels] = React.useState<CatalogModel[]>(() => catalogFallback(kind, usage));
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    void loadCatalog(kind, usage).then((list) => {
      if (!alive) return;
      setModels(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [kind, usage]);
  return { models, loading };
}

export function useFavoriteModels(): FavoriteModels {
  const [favorites, setFavorites] = React.useState<FavoriteModels>({ image: [], video: [] });
  React.useEffect(() => {
    setFavorites(loadFavoriteModels());
    return subscribeFavoriteModels(() => setFavorites(loadFavoriteModels()));
  }, []);
  return favorites;
}

export function modelLabel(models: CatalogModel[], id: string | null | undefined): string {
  if (!id) return "";
  return models.find((m) => m.value === id)?.label ?? id.split("/").pop() ?? id;
}
