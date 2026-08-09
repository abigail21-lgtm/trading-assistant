"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const POPULAR = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "META", "SPY"];

export default function StockSearchPage() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(symbol: string) {
    const trimmed = symbol.trim().toUpperCase();
    if (trimmed) router.push(`/stock/${encodeURIComponent(trimmed)}`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    go(value);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 lg:max-w-2xl lg:px-8 lg:py-10">
      <h1 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Search a stock</h1>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          placeholder="Ticker symbol, e.g. AAPL"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Go
        </button>
      </form>

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Popular
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map((symbol) => (
            <button
              key={symbol}
              onClick={() => go(symbol)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
