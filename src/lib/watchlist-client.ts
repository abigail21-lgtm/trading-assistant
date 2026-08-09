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

  await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().filter((s) => s !== symbol));
    return;
  }

  await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
}
