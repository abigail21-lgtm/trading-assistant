"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EarningsEvent } from "@/lib/market/calendar";
import { getWatchlist } from "@/lib/watchlist-client";
import { formatDate } from "@/lib/format";

const WINDOW_DAYS = 30;

export default function WatchlistCalendarSection() {
  const [events, setEvents] = useState<EarningsEvent[] | null>(null);

  useEffect(() => {
    (async function load() {
      const symbols = await getWatchlist();
      if (symbols.length === 0) {
        setEvents([]);
        return;
      }
      const res = await fetch(`/api/market/calendar?symbols=${symbols.map(encodeURIComponent).join(",")}`);
      const data = await res.json();
      const cutoff = Date.now() / 1000 + WINDOW_DAYS * 86400;
      const withinWindow = (data.events ?? [])
        .filter((e: EarningsEvent) => new Date(`${e.date}T00:00:00Z`).getTime() / 1000 <= cutoff)
        .sort((a: EarningsEvent, b: EarningsEvent) => a.date.localeCompare(b.date));
      setEvents(withinWindow);
    })();
  }, []);

  if (events === null) return null;
  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Upcoming Events (next {WINDOW_DAYS} days)
      </h2>
      <div className="space-y-2">
        {events.map((e) => (
          <Link
            key={e.symbol}
            href={`/stock/${e.symbol}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{e.symbol}</p>
              <p className="text-xs text-slate-500">Earnings</p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {formatDate(Math.floor(new Date(`${e.date}T00:00:00Z`).getTime() / 1000))}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
