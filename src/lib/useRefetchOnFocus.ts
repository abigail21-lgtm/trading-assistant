"use client";

import { useEffect } from "react";

/** Re-runs `callback` on mount, and again whenever the tab/window regains
 * focus or becomes visible. Guards against showing stale personalized data
 * after a mutation made elsewhere -- a different tab, or this page being
 * restored from a cache (client router cache, browser bfcache, a CDN edge
 * cache) that skipped a fresh fetch. */
export function useRefetchOnFocus(callback: () => void) {
  useEffect(() => {
    callback();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") callback();
    }
    window.addEventListener("focus", callback);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", callback);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [callback]);
}
