import Link from "next/link";
import { getChart, getManyQuoteSummaries } from "@/lib/market/yahoo";
import { SECTORS } from "@/lib/market/symbols";
import { SECTOR_CONSTITUENTS } from "@/lib/market/sector-constituents";
import { computePeriodReturn } from "@/lib/market/comparison";
import { changeColorClass, formatPercent, formatPrice } from "@/lib/format";

interface Row {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

const PERIODS = [
  { key: "day", label: "Day" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

export default async function SectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const { period: rawPeriod } = await searchParams;
  const period: PeriodKey = PERIODS.some((p) => p.key === rawPeriod) ? (rawPeriod as PeriodKey) : "day";

  const sector = SECTORS.find((s) => s.symbol === symbol);
  const constituents = SECTOR_CONSTITUENTS[symbol];

  if (!sector || !constituents) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium text-slate-800 dark:text-slate-200">Unknown sector &quot;{symbol}&quot;</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          Back to Home
        </Link>
      </div>
    );
  }

  const rows = await getRows(constituents.map((c) => c.symbol), constituents, period);
  rows.sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{sector.name}</h1>
      <p className="text-sm text-slate-500">Major names in this sector, ranked by performance.</p>

      <div className="mt-4 flex gap-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/sector/${symbol}?period=${p.key}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              p.key === period
                ? "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row, i) => (
          <Link
            key={row.symbol}
            href={`/stock/${row.symbol}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <span className="w-5 shrink-0 text-sm text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">{row.symbol}</p>
              <p className="truncate text-xs text-slate-500">{row.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatPrice(row.price)}</p>
              <p className={`text-xs font-medium ${changeColorClass(row.changePercent)}`}>
                {formatPercent(row.changePercent)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function getRows(
  symbols: string[],
  constituents: { symbol: string; name: string }[],
  period: PeriodKey,
): Promise<Row[]> {
  if (period === "day") {
    const quotes = await getManyQuoteSummaries(constituents);
    return quotes.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.ok ? q.regularMarketPrice : null,
      changePercent: q.ok ? q.changePercent : null,
    }));
  }

  const range = period === "month" ? "1mo" : "3mo";
  const charts = await Promise.all(symbols.map((s) => getChart(s, range, "1d").catch(() => null)));

  return constituents.map((c, i) => {
    const chart = charts[i];
    if (!chart) return { symbol: c.symbol, name: c.name, price: null, changePercent: null };
    const { returnPercent } = computePeriodReturn(chart.candles, c.symbol, c.name);
    return {
      symbol: c.symbol,
      name: c.name,
      price: chart.candles.at(-1)?.close ?? null,
      changePercent: returnPercent,
    };
  });
}
