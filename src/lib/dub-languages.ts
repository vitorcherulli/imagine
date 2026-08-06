/**
 * Idiomas suportados no pipeline de dublagem.
 *
 * Cobre os 12 principais de ElevenLabs Multilingual v2 (que é o TTS default do
 * dub) + é aceitável pelos LLMs de tradução (Claude/Gemini/GPT). Os códigos
 * seguem ISO 639-1 (2 letras) para ficar consistente com `scriptLanguage`.
 */
export interface DubLanguage {
  id: string;
  label: string;
  nativeLabel: string;
  flag: string;
  /** English name used when instructing the LLM to translate. */
  llmName: string;
  /** Whether ElevenLabs multilingual v2 supports this reliably. */
  elevenLabsSupported: boolean;
  /**
   * Average TTS speaking density in *characters per second* for a natural pace.
   * Used to budget translated line length so the dub fits in the original slot.
   * Values are conservative to leave a little breathing room.
   */
  charsPerSecond: number;
}

export const DUB_LANGUAGES: DubLanguage[] = [
  { id: "en", label: "English", nativeLabel: "English", flag: "🇺🇸",
    llmName: "English", elevenLabsSupported: true, charsPerSecond: 15 },
  { id: "pt", label: "Portuguese (Brazil)", nativeLabel: "Português", flag: "🇧🇷",
    llmName: "Brazilian Portuguese", elevenLabsSupported: true, charsPerSecond: 15 },
  { id: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸",
    llmName: "Spanish", elevenLabsSupported: true, charsPerSecond: 16 },
  { id: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷",
    llmName: "French", elevenLabsSupported: true, charsPerSecond: 15 },
  { id: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪",
    llmName: "German", elevenLabsSupported: true, charsPerSecond: 13 },
  { id: "it", label: "Italian", nativeLabel: "Italiano", flag: "🇮🇹",
    llmName: "Italian", elevenLabsSupported: true, charsPerSecond: 15 },
  { id: "ja", label: "Japanese", nativeLabel: "日本語", flag: "🇯🇵",
    llmName: "Japanese", elevenLabsSupported: true, charsPerSecond: 7 },
  { id: "ko", label: "Korean", nativeLabel: "한국어", flag: "🇰🇷",
    llmName: "Korean", elevenLabsSupported: true, charsPerSecond: 8 },
  { id: "zh", label: "Chinese (Mandarin)", nativeLabel: "中文", flag: "🇨🇳",
    llmName: "Simplified Chinese (Mandarin)", elevenLabsSupported: true, charsPerSecond: 6 },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी", flag: "🇮🇳",
    llmName: "Hindi", elevenLabsSupported: true, charsPerSecond: 12 },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦",
    llmName: "Modern Standard Arabic", elevenLabsSupported: true, charsPerSecond: 13 },
  { id: "ru", label: "Russian", nativeLabel: "Русский", flag: "🇷🇺",
    llmName: "Russian", elevenLabsSupported: true, charsPerSecond: 13 },
];

/**
 * Estimated max character count that fits comfortably in `durationSeconds`
 * when spoken naturally in `languageId`. Includes a small safety margin.
 */
export function maxCharsForDuration(
  languageId: string,
  durationSeconds: number,
): number {
  const info = dubLanguageInfo(languageId);
  const cps = info.charsPerSecond > 0 ? info.charsPerSecond : 15;
  // 0.88 = stay ~12% under natural speaking rate so TTS fits without heavy stretch.
  return Math.max(8, Math.round(cps * durationSeconds * 0.88));
}

const DUB_LANGUAGE_IDS = new Set(DUB_LANGUAGES.map((l) => l.id));

export function isDubLanguage(id: string | null | undefined): boolean {
  return typeof id === "string" && DUB_LANGUAGE_IDS.has(id);
}

export function normalizeDubLanguage(
  value: string | null | undefined,
  fallback: string = "en",
): string {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase().slice(0, 2);
    if (DUB_LANGUAGE_IDS.has(lower)) return lower;
  }
  return DUB_LANGUAGE_IDS.has(fallback) ? fallback : "en";
}

export function dubLanguageInfo(id: string): DubLanguage {
  return (
    DUB_LANGUAGES.find((l) => l.id === id) ?? {
      id,
      label: id.toUpperCase(),
      nativeLabel: id.toUpperCase(),
      flag: "🌐",
      llmName: id,
      elevenLabsSupported: false,
      charsPerSecond: 15,
    }
  );
}
