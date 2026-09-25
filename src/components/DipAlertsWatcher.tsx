"use client";

import { useEffect, useRef } from "react";
import type { DipAlert } from "@/lib/signals/dip-alerts";
import { pruneSentLog } from "@/lib/signals/dip-alerts";
import { getWatchlist } from "@/lib/watchlist-client";
import { getNotificationPermission, showNotification } from "@/lib/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SENT_KEY = "trading-assistant:dip-alerts-sent";

function readSent(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSent(log: Record<string, number>) {
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify(log));
  } catch {
    // Storage full or blocked: worst case an alert repeats.
  }
}

// Dip-signal alerts while the app is open. Like AlertsWatcher, local mode
// only: in accounts mode netlify/functions/check-dip-alerts sends the same
// alerts as push notifications, even with the app closed.
export default function DipAlertsWatcher() {
  const runningRef = useRef(false);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    async function check() {
      if (runningRef.current || getNotificationPermission() !== "granted") return;
      runningRef.current = true;
      try {
        const symbols = await getWatchlist();
        const res = await fetch(`/api/signals/alerts?symbols=${encodeURIComponent(symbols.join(","))}`);
        if (!res.ok) return;
        const { alerts } = (await res.json()) as { alerts: DipAlert[] };
        const now = Date.now();
        const sent = pruneSentLog(readSent(), now);
        for (const alert of alerts) {
          if (sent[alert.key]) continue;
          showNotification(alert.title, { body: alert.body, tag: alert.key });
          sent[alert.key] = now;
        }
        writeSent(sent);
      } catch {
        // Offline or a data source hiccup: try again next interval.
      } finally {
        runningRef.current = false;
      }
    }
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
