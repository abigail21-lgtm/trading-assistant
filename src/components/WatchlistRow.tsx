"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { QuoteResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent, formatPrice } from "@/lib/format";

export default function WatchlistRow({ quote }: { quote: QuoteResult }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(quote.symbol)}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <Link href={`/stock/${quote.symbol}`} className="min-w-0 flex-1">
        <p className="font-medium text-slate-100">{quote.symbol}</p>
        <p className="truncate text-xs text-slate-500">
          {quote.ok ? quote.longName : quote.name}
        </p>
      </Link>

      <div className="flex items-center gap-3">
        {quote.ok ? (
          <div className="text-right">
            <p className="text-sm font-medium text-slate-100">
              {formatPrice(quote.regularMarketPrice, quote.currency)}
            </p>
            <p className={`text-xs font-medium ${changeColorClass(quote.changePercent)}`}>
              {formatPercent(quote.changePercent)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Remove ${quote.symbol} from watchlist`}
          className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-800 hover:text-red-400 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
