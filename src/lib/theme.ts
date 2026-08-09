export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "theme-change";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getEffectiveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore: notifies on explicit toggles, storage changes
 * from other tabs, and system-preference changes (which matter when the
 * user hasn't made an explicit choice). */
export function subscribeToTheme(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    mq.removeEventListener("change", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Inline script injected into <head>, runs before first paint to avoid a
// flash of the wrong theme (see Next.js "preventing flash before hydration").
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
