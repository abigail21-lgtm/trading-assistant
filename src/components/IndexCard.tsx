import type { QuoteWithTrendResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent, formatPrice } from "@/lib/format";

export default function IndexCard({ quote }: { quote: QuoteWithTrendResult }) {
  if (!quote.ok) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{quote.name}</p>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-600">Unavailable right now</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{quote.name}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
        {formatPrice(quote.regularMarketPrice, quote.currency)}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-600">Today</span>
        <span className={`text-sm font-medium ${changeColorClass(quote.changePercent)}`}>
          {formatPercent(quote.changePercent)}
        </span>
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
        <TrendStat label="1W" value={quote.oneWeekReturn} />
        <TrendStat label="1M" value={quote.oneMonthReturn} />
        <TrendStat label="3M" value={quote.threeMonthReturn} />
      </div>
    </div>
  );
}

function TrendStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-slate-400 dark:text-slate-600">{label}</p>
      <p className={`font-medium ${value == null ? "text-slate-400 dark:text-slate-600" : changeColorClass(value)}`}>
        {value == null ? "—" : formatPercent(value)}
      </p>
    </div>
  );
}
