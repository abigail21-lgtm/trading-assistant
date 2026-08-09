import type { PeriodReturn } from "@/lib/market/comparison";
import { compareInsights } from "@/lib/market/comparison";
import { changeColorClass, formatPercent } from "@/lib/format";

export default function PerformanceComparisonCard({
  stock,
  market,
  sector,
}: {
  stock: PeriodReturn;
  market: PeriodReturn;
  sector: PeriodReturn | null;
}) {
  const insights = compareInsights(stock, market, sector);
  const rows = [stock, market, ...(sector ? [sector] : [])];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        Performance vs Market &amp; Sector
      </h3>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{r.name}</span>
            <span className={`font-medium ${changeColorClass(r.returnPercent)}`}>
              {formatPercent(r.returnPercent)}
            </span>
          </div>
        ))}
      </div>
      {insights.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
          {insights.map((line) => (
            <p key={line} className="text-xs text-slate-500">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
