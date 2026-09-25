"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getWatchlist } from "@/lib/watchlist-client";
import type { SignalRow } from "@/app/api/signals/route";
import DipGradePill, { DipStagePill, isTradeUnderWay } from "./DipGradePill";

interface Data {
  index: SignalRow[];
  watchlist: SignalRow[];
  scanIndexFunds: boolean;
  scanWatchlist: boolean;
}

export default function SignalsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [watchlistEmpty, setWatchlistEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const symbols = await getWatchlist();
        if (!cancelled) setWatchlistEmpty(symbols.length === 0);
        const res = await fetch(`/api/signals?symbols=${encodeURIComponent(symbols.join(","))}`);
        if (!res.ok) throw new Error(String(res.status));
        const json: Data = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="mt-6 text-sm text-slate-500">Couldn&apos;t load signals right now. Try again in a minute.</p>;
  }
  if (!data) {
    return (
      <div className="mt-6 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {data.scanIndexFunds && (
        <Section title="Index funds" subtitle="Best fit for calls: tight prices on the options." rows={data.index} />
      )}
      {!data.scanWatchlist ? null : watchlistEmpty ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your watchlist</h2>
          <p className="mt-2 text-sm text-slate-500">
            Star stocks on their pages to add them to your watchlist, and they&apos;ll be checked here too.
          </p>
        </section>
      ) : (
        <Section title="Your watchlist" subtitle="Stocks only count deeper dips, which tested better." rows={data.watchlist} />
      )}
      {!data.scanIndexFunds && !data.scanWatchlist && (
        <p className="text-sm text-slate-500">Both lists are turned off in My rules.</p>
      )}
      <p className="text-[10px] text-slate-400">Automated read from price data. Not investment advice.</p>
    </div>
  );
}

function Section({ title, subtitle, rows }: { title: string; subtitle: string; rows: SignalRow[] }) {
  // Trades under way first (they need action), then new setups by grade.
  const rank = (r: SignalRow) => (isTradeUnderWay(r.status) ? -1 : ["go", "caution", "pass"].indexOf(r.grade!));
  const graded = rows.filter((r) => r.grade != null).sort((a, b) => rank(a) - rank(b));
  const quiet = rows.filter((r) => r.grade == null);
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <ul className="mt-2 space-y-2">
        {graded.map((r) => (
          <li key={r.symbol}>
            <Link
              href={`/stock/${r.symbol}/setup`}
              className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {r.symbol} <span className="ml-1 text-xs font-normal text-slate-500">{r.headline}</span>
                </span>
                {isTradeUnderWay(r.status) ? (
                  <DipStagePill status={r.status!} holdDay={r.holdDay} maxHold={r.maxHold} />
                ) : (
                  <DipGradePill grade={r.grade!} />
                )}
              </span>
              <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{r.reason}</span>
              {r.grade !== "pass" && (
                <span className="mt-1.5 block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {isTradeUnderWay(r.status) ? "See the plan →" : "See setup & calls →"}
                </span>
              )}
            </Link>
          </li>
        ))}
        {quiet.length > 0 && (
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800">
            <span className="flex flex-wrap gap-x-2 font-medium text-slate-700 dark:text-slate-300">
              {quiet.map((r, i) => (
                <span key={r.symbol}>
                  <Link href={`/stock/${r.symbol}/setup`} className="hover:text-emerald-600">
                    {r.symbol}
                  </Link>
                  {i < quiet.length - 1 && <span className="text-slate-400"> ·</span>}
                </span>
              ))}
            </span>
            <span className="text-xs text-slate-400">No dip right now</span>
          </li>
        )}
      </ul>
    </section>
  );
}
