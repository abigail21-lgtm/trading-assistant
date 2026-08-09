"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, getEffectiveTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";

function getServerSnapshot(): Theme {
  return "dark";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getEffectiveTheme, getServerSnapshot);

  // Keep the DOM attribute in sync with the derived theme (covers system
  // preference changes when the user hasn't made an explicit choice).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
