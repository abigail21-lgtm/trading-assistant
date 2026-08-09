"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlertRule } from "@/lib/market/alerts";
import { describeAlert } from "@/lib/market/alerts";
import { getAlerts, removeAlert } from "@/lib/alerts-client";
import { formatRelativeTime } from "@/lib/format";
import AlertBuilder from "./AlertBuilder";
import NotificationPermissionToggle from "./NotificationPermissionToggle";

export default function AlertsPanel({ symbol, currentPrice }: { symbol: string; currentPrice: number | null }) {
  const [alerts, setAlerts] = useState<AlertRule[] | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const load = useCallback(async () => {
    const all = await getAlerts();
    setAlerts(all.filter((a) => a.symbol === symbol));
  }, [symbol]);

  useEffect(() => {
    // Standard fetch-on-mount effect; the set-state-in-effect rule can't see
    // that load()'s setState call only runs after an await, not
    // synchronously in this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleRemove(id: string) {
    await removeAlert(id);
    load();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alerts</h3>
        <button
          type="button"
          onClick={() => setShowBuilder((v) => !v)}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          {showBuilder ? "Cancel" : "+ Add"}
        </button>
      </div>

      <div className="mt-2">
        <NotificationPermissionToggle />
      </div>

      {showBuilder && (
        <div className="mt-3">
          <AlertBuilder
            symbol={symbol}
            currentPrice={currentPrice}
            onCreated={() => {
              setShowBuilder(false);
              load();
            }}
          />
        </div>
      )}

      <div className="mt-3 space-y-2">
        {alerts === null ? null : alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No alerts set for {symbol} yet.</p>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-300">{describeAlert(a)}</p>
                {a.lastFiredAt && (
                  <p className="text-xs text-slate-400">Last fired {formatRelativeTime(a.lastFiredAt / 1000)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                aria-label="Remove alert"
                className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
