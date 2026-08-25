"use client";

import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "synctable_theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToDOM(theme: ThemeMode): ResolvedTheme {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return theme === "dark" ? "dark" : "light";
  }

  const resolved: ResolvedTheme = theme === "system" ? getSystemTheme() : theme;
  const root = document.documentElement;

  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  }

  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage
  useEffect(() => {
    setMounted(true);
    let initialTheme: ThemeMode = "system";
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialTheme = stored;
      }
    } catch (e) {
      console.warn("Failed to read theme from localStorage", e);
    }

    setThemeState(initialTheme);
    const resolved = applyThemeToDOM(initialTheme);
    setResolvedTheme(resolved);

    // Broadcast initial state
    window.dispatchEvent(
      new CustomEvent("synctable:themeChange", {
        detail: { theme: initialTheme, resolvedTheme: resolved },
      })
    );
  }, []);

  // Listen to OS theme changes when in 'system' mode
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemChange = () => {
      // Re-read current theme from storage or state
      let currentTheme = theme;
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
        if (stored) currentTheme = stored;
      } catch {}

      if (currentTheme === "system") {
        const resolved = applyThemeToDOM("system");
        setResolvedTheme(resolved);
        window.dispatchEvent(
          new CustomEvent("synctable:themeChange", {
            detail: { theme: "system", resolvedTheme: resolved },
          })
        );
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, [theme]);

  // Listen to cross-window or cross-component theme change events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
        if (customEvent.detail.resolvedTheme) {
          setResolvedTheme(customEvent.detail.resolvedTheme);
        }
      }
    };

    window.addEventListener("synctable:themeChange", handleSync);
    return () => window.removeEventListener("synctable:themeChange", handleSync);
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn("Failed to save theme to localStorage", e);
    }

    const resolved = applyThemeToDOM(newTheme);
    setResolvedTheme(resolved);

    window.dispatchEvent(
      new CustomEvent("synctable:themeChange", {
        detail: { theme: newTheme, resolvedTheme: resolved },
      })
    );
  }, []);

  const toggleTheme = useCallback(() => {
    if (theme === "system") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  }, [theme, setTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    mounted,
  };
}
