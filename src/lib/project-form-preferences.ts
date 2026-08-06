import type { ProjectScriptLanguage } from "./project-language";
import type { VideoFormat } from "./video-format";
import { isVideoFormat } from "./video-format";
import type { ProjectApiModels } from "./project-api-models";

export interface ProjectFormPreferences {
  projectDnaId?: string | null;
  /** @deprecated use projectDnaId */
  projectIdentity?: string;
  cutPace?: string;
  narrationMode?: string;
  scriptLanguage?: ProjectScriptLanguage;
  genre?: string;
  visualStyle?: string;
  voiceTone?: string;
  targetDurationSeconds?: number;
  videoFormat?: VideoFormat;
  avatarId?: string;
  avatarIds?: string[];
  primaryAvatarId?: string | null;
  /** Last-used API models/voice — fallback when no DNA is selected. */
  apiModels?: ProjectApiModels;
}

const STORAGE_KEY = "imagine-new-project-prefs";

export function loadProjectFormPreferences(): ProjectFormPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectFormPreferences;
    if (parsed.videoFormat && !isVideoFormat(parsed.videoFormat)) {
      delete parsed.videoFormat;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjectFormPreferences(prefs: ProjectFormPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
