import Link from "next/link";
import { getChart, SymbolNotFoundError } from "@/lib/market/yahoo";
import { createClient } from "@/lib/supabase/server";
import { changeColorClass, formatCompactNumber, formatPercent, formatPrice } from "@/lib/format";
import StockChart from "@/components/StockChart";
import StarButton from "@/components/StarButton";

const RANGES = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
  { value: "max", label: "Max" },
];
const VALID_RANGES = new Set(RANGES.map((r) => r.value));

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const { range: rawRange } = await searchParams;
  const range = VALID_RANGES.has(rawRange ?? "") ? rawRange! : "6mo";

  let chart;
  try {
    chart = await getChart(symbol, range, "1d");
  } catch (err) {
    const notFound = err instanceof SymbolNotFoundError;
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium text-slate-200">
          {notFound ? `No data for "${symbol}"` : "Couldn't load that stock"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {notFound ? "Double-check the ticker symbol." : "Market data is temporarily unavailable."}
        </p>
        <Link
          href="/stock"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Try another symbol
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let starred = false;
  if (user) {
    const { data } = await supabase
      .from("watchlist")
      .select("symbol")
      .eq("symbol", symbol)
      .maybeSingle();
    starred = !!data;
  }

  const { meta, candles } = chart;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100">{meta.symbol}</h1>
          <p className="truncate text-sm text-slate-500">
            {meta.longName} · {meta.exchangeName}
          </p>
        </div>
        <StarButton symbol={meta.symbol} initialStarred={starred} />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-100">
          {formatPrice(meta.regularMarketPrice, meta.currency)}
        </span>
        <span className={`text-base font-medium ${changeColorClass(meta.changePercent)}`}>
          {meta.changeAbsolute != null && formatPrice(meta.changeAbsolute, meta.currency)}{" "}
          ({formatPercent(meta.changePercent)})
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Day Range" value={`${formatPrice(meta.dayLow, meta.currency)} – ${formatPrice(meta.dayHigh, meta.currency)}`} />
        <Stat label="52-Week Range" value={`${formatPrice(meta.fiftyTwoWeekLow, meta.currency)} – ${formatPrice(meta.fiftyTwoWeekHigh, meta.currency)}`} />
        <Stat label="Volume" value={formatCompactNumber(meta.regularMarketVolume)} />
        <Stat label="Previous Close" value={formatPrice(meta.previousClose, meta.currency)} />
      </dl>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/stock/${symbol}?range=${r.value}`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                r.value === range
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <div className="hidden gap-3 text-xs text-slate-500 sm:flex">
          <Legend color="#38bdf8" label="MA20" />
          <Legend color="#a78bfa" label="MA50" />
          <Legend color="#f59e0b" label="MA200" />
        </div>
      </div>

      <div className="mt-3 h-[360px] rounded-xl border border-slate-800 bg-slate-900 p-2 sm:h-[440px]">
        <StockChart candles={candles} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-200">{value}</dd>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-0.5 w-3" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
