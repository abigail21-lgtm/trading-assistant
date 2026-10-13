"use client";

// The last few stock pages opened on this device, newest first. Used to put
// the stock you were just looking at on the Signals tab, and to send the
// Search tab back to it.
const KEY = "trading-assistant:recent-stocks";
const MAX = 5;

export function getRecentStocks(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string" && /^[A-Z0-9.^-]{1,12}$/.test(s)) : [];
  } catch {
    return [];
  }
}

export function rememberStock(symbol: string) {
  try {
    const next = [symbol, ...getRecentStocks().filter((s) => s !== symbol)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("recent-stocks"));
  } catch {
    // Storage blocked: the feature just doesn't remember.
  }
}
