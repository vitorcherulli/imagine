import type { CatalogModelKind } from "@/lib/model-catalog";

export type FavoriteModels = Record<CatalogModelKind, string[]>;

const STORAGE_KEY = "imagine-favorite-models";
const CHANGE_EVENT = "imagine-favorite-models-changed";

export function loadFavoriteModels(): FavoriteModels {
  const empty: FavoriteModels = { image: [], video: [] };
  if (typeof window === "undefined") return empty;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<FavoriteModels> | null;
    if (!parsed || typeof parsed !== "object") return empty;
    const clean = (list: unknown) =>
      Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
    return { image: clean(parsed.image), video: clean(parsed.video) };
  } catch {
    return empty;
  }
}

export function subscribeFavoriteModels(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function toggleFavoriteModel(kind: CatalogModelKind, model: string): FavoriteModels {
  const current = loadFavoriteModels();
  const list = current[kind];
  const next: FavoriteModels = {
    ...current,
    [kind]: list.includes(model) ? list.filter((m) => m !== model) : [...list, model],
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // storage full or disabled
  }
  return next;
}
