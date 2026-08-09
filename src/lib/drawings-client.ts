"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { NewTrendLine, TrendLine } from "@/lib/market/drawings";

const LOCAL_PREFIX = "trading-assistant:drawings:";

function localKey(symbol: string, timeframeKey: string): string {
  return `${LOCAL_PREFIX}${symbol}:${timeframeKey}`;
}

function readLocal(symbol: string, timeframeKey: string): TrendLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(symbol, timeframeKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(symbol: string, timeframeKey: string, lines: TrendLine[]) {
  window.localStorage.setItem(localKey(symbol, timeframeKey), JSON.stringify(lines));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getDrawings(symbol: string, timeframeKey: string): Promise<TrendLine[]> {
  if (!isSupabaseConfigured) return readLocal(symbol, timeframeKey);

  const res = await fetch(`/api/drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframeKey)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.lines ?? [];
}

export async function addDrawing(symbol: string, timeframeKey: string, line: NewTrendLine): Promise<TrendLine> {
  const full: TrendLine = { ...line, id: makeId() };

  if (!isSupabaseConfigured) {
    writeLocal(symbol, timeframeKey, [...readLocal(symbol, timeframeKey), full]);
    return full;
  }

  const res = await fetch("/api/drawings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, timeframe: timeframeKey, line: full }),
  });
  if (!res.ok) throw new Error(`Failed to save trendline for ${symbol}`);
  return full;
}

export async function removeDrawing(symbol: string, timeframeKey: string, id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(symbol, timeframeKey, readLocal(symbol, timeframeKey).filter((l) => l.id !== id));
    return;
  }

  const res = await fetch(
    `/api/drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframeKey)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to remove trendline ${id}`);
}

export async function clearDrawings(symbol: string, timeframeKey: string): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(symbol, timeframeKey, []);
    return;
  }

  const res = await fetch(`/api/drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframeKey)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to clear trendlines for ${symbol}`);
}
