"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AlertRule, NewAlertRule } from "@/lib/market/alerts";

const LOCAL_KEY = "trading-assistant:alerts";

function readLocal(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(alerts: AlertRule[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(alerts));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getAlerts(): Promise<AlertRule[]> {
  if (!isSupabaseConfigured) return readLocal();

  const res = await fetch("/api/alerts");
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts ?? [];
}

export async function addAlert(rule: NewAlertRule): Promise<AlertRule> {
  const full: AlertRule = { ...rule, id: makeId(), createdAt: Date.now(), lastFiredAt: null } as AlertRule;

  if (!isSupabaseConfigured) {
    writeLocal([...readLocal(), full]);
    return full;
  }

  await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(full),
  });
  return full;
}

export async function removeAlert(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().filter((a) => a.id !== id));
    return;
  }

  await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function markAlertFired(id: string, firedAt: number): Promise<void> {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().map((a) => (a.id === id ? { ...a, lastFiredAt: firedAt } : a)));
    return;
  }

  await fetch("/api/alerts", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lastFiredAt: firedAt }),
  });
}
