"use client";

import { useState } from "react";
import type { PeriodReturn } from "@/lib/market/comparison";
import { compareInsights } from "@/lib/market/comparison";
import { changeColorClass, formatPercent } from "@/lib/format";
import CollapsibleCardShell from "./CollapsibleCardShell";

export default function PerformanceComparisonCard({
  stock,
  market,
  sector,
}: {
  stock: PeriodReturn;
  market: PeriodReturn;
  sector: PeriodReturn | null;
}) {
  const [open, setOpen] = useState(false);
  const insights = compareInsights(stock, market, sector);
  const rows = [stock, market, ...(sector ? [sector] : [])];

  return (
    <CollapsibleCardShell
      title="Performance vs Market & Sector"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        <span className={`font-medium ${changeColorClass(stock.returnPercent)}`}>
          {formatPercent(stock.returnPercent)}
        </span>
      }
    >
      <div className="space-y-2">
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
    </CollapsibleCardShell>
  );
}
