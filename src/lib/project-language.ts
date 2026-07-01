/** Base language for script narration and LLM-generated copy in this project. */
export type ProjectScriptLanguage = "en" | "pt" | "es";

export const DEFAULT_PROJECT_SCRIPT_LANGUAGE: ProjectScriptLanguage = "en";

export const PROJECT_SCRIPT_LANGUAGE_OPTIONS = [
  { id: "en" as const, label: "English", nativeLabel: "English" },
  { id: "pt" as const, label: "Portuguese", nativeLabel: "Português" },
  { id: "es" as const, label: "Spanish", nativeLabel: "Español" },
] as const;

export function isProjectScriptLanguage(value: unknown): value is ProjectScriptLanguage {
  return value === "en" || value === "pt" || value === "es";
}

export function normalizeProjectScriptLanguage(value: unknown): ProjectScriptLanguage {
  return isProjectScriptLanguage(value) ? value : DEFAULT_PROJECT_SCRIPT_LANGUAGE;
}

export function projectScriptLanguageLabel(lang: ProjectScriptLanguage): string {
  return (
    PROJECT_SCRIPT_LANGUAGE_OPTIONS.find((o) => o.id === lang)?.nativeLabel ??
    PROJECT_SCRIPT_LANGUAGE_OPTIONS[0].nativeLabel
  );
}

/** Mandatory language line for narration / script LLM prompts. */
export function scriptLanguageGenerationLine(lang: ProjectScriptLanguage): string {
  switch (lang) {
    case "pt":
      return [
        "LANGUAGE (mandatory): Write every narration string in Brazilian Portuguese — script paragraphs, titles, on-screen copy, and spoken lines.",
        "Never use English or Spanish for narration, even when the brief, character names, or project title are not in Portuguese.",
        "Keep proper names from the brief unchanged.",
      ].join(" ");
    case "es":
      return [
        "LANGUAGE (mandatory): Write every narration string in Spanish — script paragraphs, titles, on-screen copy, and spoken lines.",
        "Never use English or Portuguese for narration, even when the brief, character names, or project title are not in Spanish.",
        "Keep proper names from the brief unchanged.",
      ].join(" ");
    default:
      return [
        "LANGUAGE (mandatory): Write every generated narration string in English — script paragraphs, titles, on-screen copy, and spoken lines.",
        "Never use Portuguese, Spanish, or other languages for narration, even when the brief, character names, or project title are not in English.",
        "Keep proper names from the brief unchanged.",
      ].join(" ");
  }
}

/** Narration in project language; image/scene prompts stay in English. */
export function scriptLanguageNarrationOnlyLine(lang: ProjectScriptLanguage): string {
  const base = scriptLanguageGenerationLine(lang);
  return `${base} Write visualPrompt, thumbnailPrompt, and other image/scene prompts in English.`;
}

export function scriptLanguageOutputCode(lang: ProjectScriptLanguage): string {
  return lang;
}
