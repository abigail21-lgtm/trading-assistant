"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";

const LOCAL_KEY = "trading-assistant:watchlist";

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(symbols: string[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(symbols));
}

export async function getWatchlist(): Promise<string[]> {
  if (!isSupabaseConfigured) return readLocal();

  const res = await fetch("/api/watchlist");
  if (!res.ok) return [];
  const data = await res.json();
  return data.symbols ?? [];
}

export async function addToWatchlist(symbol: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const current = readLocal();
    if (!current.includes(symbol)) writeLocal([...current, symbol]);
    return;
  }

  const res = await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
  // Callers (StarButton) revert their optimistic UI state on a thrown
  // error -- without this check, a failed write (e.g. an RLS rejection)
  // looked identical to a successful one, silently leaving the star "on"
  // in the UI while nothing was actually saved.
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error(`Failed to add ${symbol} to watchlist (${res.status}):`, body?.error ?? "unknown error");
    throw new Error(`Failed to add ${symbol} to watchlist`);
  }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().filter((s) => s !== symbol));
    return;
  }

  const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error(`Failed to remove ${symbol} from watchlist (${res.status}):`, body?.error ?? "unknown error");
    throw new Error(`Failed to remove ${symbol} from watchlist`);
  }
}
