"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { RhTransaction } from "@/lib/journal/robinhood";

const LOCAL_KEY = "trading-assistant:journal";

export async function loadTransactions(): Promise<RhTransaction[]> {
  if (!isSupabaseConfigured) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const res = await fetch("/api/journal", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load your trades");
  return (await res.json()).transactions ?? [];
}

export async function saveTransactions(transactions: RhTransaction[]): Promise<void> {
  if (!isSupabaseConfigured) {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(transactions));
    return;
  }
  const res = await fetch("/api/journal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions }),
  });
  if (!res.ok) throw new Error("Couldn't save your trades");
}
