import type { QuoteResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent, formatPrice } from "@/lib/format";

export default function IndexCard({ quote }: { quote: QuoteResult }) {
  if (!quote.ok) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-medium text-slate-300">{quote.name}</p>
        <p className="mt-2 text-xs text-slate-600">Unavailable right now</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm font-medium text-slate-300">{quote.name}</p>
      <p className="mt-1 text-xl font-semibold text-slate-100">
        {formatPrice(quote.regularMarketPrice, quote.currency)}
      </p>
      <p className={`mt-0.5 text-sm font-medium ${changeColorClass(quote.changePercent)}`}>
        {formatPercent(quote.changePercent)}
      </p>
    </div>
  );
}
