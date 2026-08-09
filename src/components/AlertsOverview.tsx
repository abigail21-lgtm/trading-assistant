"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { AlertRule } from "@/lib/market/alerts";
import { describeAlert } from "@/lib/market/alerts";
import { getAlerts, removeAlert } from "@/lib/alerts-client";
import { useRefetchOnFocus } from "@/lib/useRefetchOnFocus";

export default function AlertsOverview() {
  const [alerts, setAlerts] = useState<AlertRule[] | null>(null);

  const load = useCallback(async () => {
    setAlerts(await getAlerts());
  }, []);

  useRefetchOnFocus(load);

  if (!alerts || alerts.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Your Alerts
      </h2>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-w-0">
              <Link href={`/stock/${a.symbol}`} className="text-sm font-medium text-slate-900 hover:underline dark:text-slate-100">
                {a.symbol}
              </Link>
              <p className="text-xs text-slate-500">{describeAlert(a)}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await removeAlert(a.id);
                load();
              }}
              aria-label={`Remove alert for ${a.symbol}`}
              className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
