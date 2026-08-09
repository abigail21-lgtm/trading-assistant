"use client";

import { useEffect, useRef } from "react";
import type { AlertRule } from "@/lib/market/alerts";
import { ALERT_COOLDOWN_MS, buildAlertContext, evaluateAlert, notificationMessage } from "@/lib/market/alerts";
import { getAlerts, markAlertFired } from "@/lib/alerts-client";
import { getNotificationPermission, showNotification } from "@/lib/notifications";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Mounted once, globally (see NavShell). Polls active alerts while the app
// is open and fires a browser Notification when a condition is met — see
// the README for why this is in-app-only rather than true push for now.
export default function AlertsWatcher() {
  const runningRef = useRef(false);

  useEffect(() => {
    async function checkAlerts() {
      if (runningRef.current) return;
      if (getNotificationPermission() !== "granted") return;
      runningRef.current = true;

      try {
        const alerts = await getAlerts();
        if (alerts.length === 0) return;

        const bySymbol = new Map<string, AlertRule[]>();
        for (const alert of alerts) {
          const list = bySymbol.get(alert.symbol) ?? [];
          list.push(alert);
          bySymbol.set(alert.symbol, list);
        }

        for (const [symbol, rules] of bySymbol) {
          const now = Date.now();
          const due = rules.filter((r) => !r.lastFiredAt || now - r.lastFiredAt >= ALERT_COOLDOWN_MS);
          if (due.length === 0) continue;

          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}/chart?tf=1d`);
            if (!res.ok) continue;
            const data = await res.json();
            const ctx = buildAlertContext(data.candles ?? []);
            if (!ctx) continue;

            for (const rule of due) {
              if (!evaluateAlert(rule, ctx)) continue;
              showNotification(`${symbol} alert triggered`, {
                body: notificationMessage(rule, ctx),
                tag: rule.id,
              });
              await markAlertFired(rule.id, now);
            }
          } catch {
            // One symbol's fetch failing shouldn't stop the others.
          }
        }
      } finally {
        runningRef.current = false;
      }
    }

    checkAlerts();
    const interval = setInterval(checkAlerts, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
