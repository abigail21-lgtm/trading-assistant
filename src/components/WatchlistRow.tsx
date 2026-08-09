"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuoteResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent, formatPrice } from "@/lib/format";
import { removeFromWatchlist } from "@/lib/watchlist-client";

export default function WatchlistRow({
  quote,
  onRemoved,
}: {
  quote: QuoteResult;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    await removeFromWatchlist(quote.symbol);
    onRemoved();
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <Link href={`/stock/${quote.symbol}`} className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 dark:text-slate-100">{quote.symbol}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-500">
          {quote.ok ? quote.longName : quote.name}
        </p>
      </Link>

      <div className="flex items-center gap-3">
        {quote.ok ? (
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatPrice(quote.regularMarketPrice, quote.currency)}
            </p>
            <p className={`text-xs font-medium ${changeColorClass(quote.changePercent)}`}>
              {formatPercent(quote.changePercent)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-600">—</span>
        )}
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Remove ${quote.symbol} from watchlist`}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
