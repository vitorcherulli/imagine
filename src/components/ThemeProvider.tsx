"use client";

import * as React from "react";
import {
  applyAppTheme,
  loadAppTheme,
  saveAppTheme,
  type AppTheme,
} from "@/lib/app-theme";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<AppTheme>(() => loadAppTheme());

  React.useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback((next: AppTheme) => {
    setThemeState(next);
    saveAppTheme(next);
    applyAppTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return ctx;
}
