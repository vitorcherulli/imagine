export type AppTheme = "light" | "light-all" | "dark";

export const APP_THEME_STORAGE_KEY = "imagine-app-theme";

export const DEFAULT_APP_THEME: AppTheme = "light";

export const APP_THEME_OPTIONS: Array<{
  value: AppTheme;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Light panels with a dark timeline (editor style).",
  },
  {
    value: "light-all",
    label: "All light",
    description: "Light UI and light timeline.",
  },
  {
    value: "dark",
    label: "All dark",
    description: "Dark UI and dark timeline.",
  },
];

export function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "light-all" || value === "dark";
}

export function loadAppTheme(): AppTheme {
  if (typeof window === "undefined") return DEFAULT_APP_THEME;
  try {
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isAppTheme(stored) ? stored : DEFAULT_APP_THEME;
  } catch {
    return DEFAULT_APP_THEME;
  }
}

export function saveAppTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme =
    theme === "light" || theme === "light-all" ? "light" : "dark";
}
