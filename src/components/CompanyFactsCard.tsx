import type { CompanyFacts } from "@/lib/market/ratings";
import { changeColorClass, formatCompactNumber, formatPercent, formatPrice } from "@/lib/format";

export default function CompanyFactsCard({
  facts,
  currentPrice,
  currency,
}: {
  facts: CompanyFacts;
  currentPrice: number | null;
  currency: string;
}) {
  const upside =
    facts.oneYearTargetPrice != null && currentPrice
      ? ((facts.oneYearTargetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Analyst Target</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Consensus, best-effort</span>
      </div>

      {facts.oneYearTargetPrice != null ? (
        <div className="mt-2">
          <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatPrice(facts.oneYearTargetPrice, currency)}
          </p>
          {upside != null && (
            <p className={`text-sm font-medium ${changeColorClass(upside)}`}>
              {formatPercent(upside)} from current price
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No price target available.</p>
      )}

      <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
        {facts.sector && (
          <Row label="Sector" value={facts.industry ? `${facts.sector} · ${facts.industry}` : facts.sector} />
        )}
        {facts.marketCap != null && <Row label="Market Cap" value={`$${formatCompactNumber(facts.marketCap)}`} />}
        {facts.dividendYieldPercent != null && (
          <Row label="Dividend Yield" value={`${facts.dividendYieldPercent.toFixed(2)}%`} />
        )}
        {facts.exDividendDate && <Row label="Ex-Dividend Date" value={facts.exDividendDate} />}
      </dl>
    </div>
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
