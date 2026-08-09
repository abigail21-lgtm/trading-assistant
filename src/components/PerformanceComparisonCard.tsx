"use client";

import { useState } from "react";
import type { PeriodReturn } from "@/lib/market/comparison";
import { changeColorClass, formatPercent } from "@/lib/format";
import CollapsibleCardShell from "./CollapsibleCardShell";

function pointsDiff(stock: PeriodReturn, benchmark: PeriodReturn): number | null {
  if (stock.returnPercent == null || benchmark.returnPercent == null) return null;
  return stock.returnPercent - benchmark.returnPercent;
}

function ComparisonBlock({
  label,
  stock,
  benchmark,
}: {
  label: string;
  stock: PeriodReturn;
  benchmark: PeriodReturn;
}) {
  const diff = pointsDiff(stock, benchmark);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{stock.name}</span>
          <span className={`font-medium ${changeColorClass(stock.returnPercent)}`}>
            {formatPercent(stock.returnPercent)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{benchmark.name}</span>
          <span className={`font-medium ${changeColorClass(benchmark.returnPercent)}`}>
            {formatPercent(benchmark.returnPercent)}
          </span>
        </div>
      </div>
      {diff != null && (
        <p className="mt-1.5 text-xs text-slate-500">
          {diff >= 0 ? "Outperforming" : "Underperforming"} by {Math.abs(diff).toFixed(1)} points
        </p>
      )}
    </div>
  );
}

export default function PerformanceComparisonCard({
  stock,
  market,
  sector,
  periodLabel,
}: {
  stock: PeriodReturn;
  market: PeriodReturn;
  sector: PeriodReturn | null;
  periodLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const marketDiff = pointsDiff(stock, market);
  const sectorDiff = sector ? pointsDiff(stock, sector) : null;

  return (
    <CollapsibleCardShell
      title="Performance"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        <span className="flex items-center gap-2.5">
          {marketDiff != null && (
            <span className={changeColorClass(marketDiff)}>{formatPercent(marketDiff)} <span className="text-slate-400">mkt</span></span>
          )}
          {sectorDiff != null && (
            <span className={changeColorClass(sectorDiff)}>{formatPercent(sectorDiff)} <span className="text-slate-400">sctr</span></span>
          )}
        </span>
      }
    >
      <p className="mb-3 text-[11px] text-slate-400">Over the last {periodLabel} (matches the chart above)</p>
      <div className="space-y-4">
        <ComparisonBlock label="Vs. Market" stock={stock} benchmark={market} />
        {sector && (
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <ComparisonBlock label="Vs. Sector" stock={stock} benchmark={sector} />
          </div>
        )}
      </div>
    </CollapsibleCardShell>
  );
}
