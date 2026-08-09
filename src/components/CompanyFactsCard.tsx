"use client";

import { useState } from "react";
import type { CompanyFacts } from "@/lib/market/ratings";
import { changeColorClass, formatCompactNumber, formatPercent, formatPrice } from "@/lib/format";
import CollapsibleCardShell from "./CollapsibleCardShell";

export default function CompanyFactsCard({
  facts,
  currentPrice,
  currency,
}: {
  facts: CompanyFacts;
  currentPrice: number | null;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const upside =
    facts.oneYearTargetPrice != null && currentPrice
      ? ((facts.oneYearTargetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <CollapsibleCardShell
      title="Analyst Target"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        facts.oneYearTargetPrice != null ? (
          <>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatPrice(facts.oneYearTargetPrice, currency)}
            </span>
            {upside != null && (
              <span className={`ml-1.5 font-medium ${changeColorClass(upside)}`}>{formatPercent(upside)}</span>
            )}
          </>
        ) : (
          <span className="text-slate-500">No target</span>
        )
      }
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-400">Consensus, best-effort</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        {facts.sector && (
          <Row label="Sector" value={facts.industry ? `${facts.sector} · ${facts.industry}` : facts.sector} />
        )}
        {facts.marketCap != null && <Row label="Market Cap" value={`$${formatCompactNumber(facts.marketCap)}`} />}
        {facts.dividendYieldPercent != null && (
          <Row label="Dividend Yield" value={`${facts.dividendYieldPercent.toFixed(2)}%`} />
        )}
        {facts.exDividendDate && <Row label="Ex-Dividend Date" value={facts.exDividendDate} />}
      </dl>
    </CollapsibleCardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-700 dark:text-slate-300">{value}</dd>
    </div>
  );
}
