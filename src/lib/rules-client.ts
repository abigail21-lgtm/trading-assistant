"use client";

import type { TradingRules } from "@/lib/signals/rules";

export async function fetchRules(): Promise<TradingRules> {
  const res = await fetch("/api/settings", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load your rules");
  return (await res.json()).rules;
}

/** Saves rules; resolves with what the server stored and a warning if it only saved on this device. */
export async function saveRules(rules: TradingRules): Promise<{ rules: TradingRules; warning: string | null }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) throw new Error("Couldn't save your rules");
  const json = await res.json();
  return { rules: json.rules, warning: json.error ?? null };
}
