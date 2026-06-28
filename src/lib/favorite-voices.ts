import type { VoiceOption } from "./project-api-models";

export interface FavoriteVoice {
  ttsModel: string;
  voice: string;
}

const STORAGE_KEY = "imagine-favorite-voices";
const CHANGE_EVENT = "imagine-favorite-voices-changed";

function favoriteKey(ttsModel: string, voice: string): string {
  return `${ttsModel}::${voice}`;
}

export function loadFavoriteVoices(): FavoriteVoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteVoice[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f) =>
        f &&
        typeof f.ttsModel === "string" &&
        typeof f.voice === "string" &&
        f.voice !== "auto",
    );
  } catch {
    return [];
  }
}

function saveFavoriteVoices(favorites: FavoriteVoice[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

export function subscribeFavoriteVoices(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function isFavoriteVoice(
  ttsModel: string,
  voice: string,
  favorites: FavoriteVoice[],
): boolean {
  const key = favoriteKey(ttsModel, voice);
  return favorites.some((f) => favoriteKey(f.ttsModel, f.voice) === key);
}

export function toggleFavoriteVoice(ttsModel: string, voice: string): FavoriteVoice[] {
  if (voice === "auto") return loadFavoriteVoices();
  const favorites = loadFavoriteVoices();
  const key = favoriteKey(ttsModel, voice);
  const exists = favorites.some((f) => favoriteKey(f.ttsModel, f.voice) === key);
  const next = exists
    ? favorites.filter((f) => favoriteKey(f.ttsModel, f.voice) !== key)
    : [...favorites, { ttsModel, voice }];
  saveFavoriteVoices(next);
  return next;
}

export function favoriteVoicesForModel(
  ttsModel: string,
  favorites: FavoriteVoice[],
): FavoriteVoice[] {
  return favorites.filter((f) => f.ttsModel === ttsModel);
}

/** Favorites first (stable order), then the rest. */
export function sortVoiceOptionsWithFavorites(
  options: VoiceOption[],
  ttsModel: string,
  favorites: FavoriteVoice[],
): VoiceOption[] {
  const modelFavorites = favoriteVoicesForModel(ttsModel, favorites);
  const favoriteValues = new Set(modelFavorites.map((f) => f.voice));
  const byValue = new Map(options.map((o) => [o.value, o]));
  const ordered: VoiceOption[] = [];

  for (const fav of modelFavorites) {
    const opt = byValue.get(fav.voice);
    if (opt) ordered.push(opt);
  }
  for (const opt of options) {
    if (!favoriteValues.has(opt.value)) ordered.push(opt);
  }
  return ordered;
}
