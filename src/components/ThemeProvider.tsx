"use client";

import * as React from "react";
import {
  applyAppTheme,
  DEFAULT_APP_THEME,
  loadAppTheme,
  saveAppTheme,
  type AppTheme,
} from "@/lib/app-theme";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  ready: boolean;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<AppTheme>(DEFAULT_APP_THEME);
  const [ready, setReady] = React.useState(false);

  React.useLayoutEffect(() => {
    const loaded = loadAppTheme();
    setThemeState(loaded);
    applyAppTheme(loaded);
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    applyAppTheme(theme);
  }, [ready, theme]);

  const setTheme = React.useCallback((next: AppTheme) => {
    setThemeState(next);
    saveAppTheme(next);
    applyAppTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, ready }}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return ctx;
}
