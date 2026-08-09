"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COMPARE_RANGES,
  MAX_COMPARE_SYMBOLS,
  compareColorFor,
  isCompareRangeKey,
  type CompareRangeKey,
  type CompareSeries,
} from "@/lib/market/compare";
import { changeColorClass, formatPercent } from "@/lib/format";
import CompareChart from "@/components/CompareChart";

const POPULAR = ["AAPL", "MSFT", "NVDA", "AMD", "AMZN", "GOOGL", "TSLA", "META", "SPY", "SMCI"];

export default function ComparePageClient({
  initialSymbols,
  initialRange,
}: {
  initialSymbols: string[];
  initialRange: string;
}) {
  const router = useRouter();
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [range, setRange] = useState<CompareRangeKey>(
    isCompareRangeKey(initialRange) ? initialRange : "6mo",
  );
  const [input, setInput] = useState("");
  const [series, setSeries] = useState<CompareSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = symbols.length > 0 ? `?symbols=${symbols.join(",")}&range=${range}` : "";
    router.replace(`/compare${query}`, { scroll: false });
    const requestId = ++requestIdRef.current;

    (async () => {
      if (symbols.length === 0) {
        setSeries([]);
        return;
      }
      setLoading(true);
      const res = await fetch(`/api/market/compare?symbols=${symbols.join(",")}&range=${range}`);
      const data = await res.json();
      if (requestIdRef.current === requestId) {
        setSeries(data.series ?? []);
        setLoading(false);
      }
    })();
    // router intentionally excluded: identity is stable in the app router, and
    // including it would re-run this effect on unrelated navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, range]);

  function addSymbol(raw: string) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || symbols.includes(symbol) || symbols.length >= MAX_COMPARE_SYMBOLS) return;
    setSymbols((prev) => [...prev, symbol]);
    setInput("");
  }

  function removeSymbol(symbol: string) {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    addSymbol(input);
  }

  const suggestions = POPULAR.filter((s) => !symbols.includes(s)).slice(0, 6);
  const sortedReturns = [...series].sort(
    (a, b) => (b.returnPercent ?? -Infinity) - (a.returnPercent ?? -Infinity),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Compare</h1>
      <p className="mt-1 text-sm text-slate-500">
        Overlay normalized performance for up to {MAX_COMPARE_SYMBOLS} tickers — useful for picking between
        candidates, or checking whether a move is stock-specific or shared across a sector.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-center gap-2">
        {symbols.map((symbol, index) => (
          <span
            key={symbol}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1.5 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: compareColorFor(index) }}
            />
            {symbol}
            <button
              type="button"
              onClick={() => removeSymbol(symbol)}
              aria-label={`Remove ${symbol}`}
              className="rounded p-0.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        ))}
        {symbols.length < MAX_COMPARE_SYMBOLS && (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add ticker…"
            className="w-28 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        )}
      </form>

      {suggestions.length > 0 && symbols.length < MAX_COMPARE_SYMBOLS && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => addSymbol(symbol)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200"
            >
              + {symbol}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-1">
        {COMPARE_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              r.key === range
                ? "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="relative mt-3 h-[300px] rounded-xl border border-slate-200 bg-white p-2 sm:h-[400px] lg:h-[480px] dark:border-slate-800 dark:bg-slate-900">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 text-sm text-slate-500 dark:bg-slate-900/60">
            Loading…
          </div>
        )}
        <CompareChart series={series} />
      </div>

      {sortedReturns.length > 0 && (
        <div className="mt-4 space-y-2">
          {sortedReturns.map((s) => {
            const index = symbols.indexOf(s.symbol);
            return (
              <Link
                key={s.symbol}
                href={`/stock/${s.symbol}`}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: compareColorFor(index) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{s.symbol}</p>
                  <p className="truncate text-xs text-slate-500">{s.ok ? s.name : "No data available"}</p>
                </div>
                <p className={`text-sm font-medium ${changeColorClass(s.returnPercent)}`}>
                  {formatPercent(s.returnPercent)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
