"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { QuoteResult } from "@/lib/market/yahoo";
import { getWatchlist } from "@/lib/watchlist-client";
import { useRefetchOnFocus } from "@/lib/useRefetchOnFocus";
import WatchlistRow from "./WatchlistRow";

export default function WatchlistSection() {
  const [quotes, setQuotes] = useState<QuoteResult[] | null>(null);

  const load = useCallback(async () => {
    const symbols = await getWatchlist();
    if (symbols.length === 0) {
      setQuotes([]);
      return;
    }
    const res = await fetch(`/api/market/quotes?symbols=${symbols.map(encodeURIComponent).join(",")}`);
    const data = await res.json();
    setQuotes(data.quotes ?? []);
  }, []);

  useRefetchOnFocus(load);

  if (quotes === null) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-800">
        <p className="text-sm text-slate-500">
          Star a stock from its page and it&apos;ll show up here.
        </p>
        <Link
          href="/stock"
          className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Search for a stock
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quotes.map((quote) => (
        <WatchlistRow key={quote.symbol} quote={quote} onRemoved={load} />
      ))}
    </div>
  );
}
