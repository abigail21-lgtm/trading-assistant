import Link from "next/link";
import type { QuoteWithTrendResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent } from "@/lib/format";

export default function SectorGrid({ sectors }: { sectors: QuoteWithTrendResult[] }) {
  const ranked = sectors
    .filter((s): s is Extract<QuoteWithTrendResult, { ok: true }> => s.ok && s.oneMonthReturn != null)
    .sort((a, b) => b.oneMonthReturn! - a.oneMonthReturn!);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  return (
    <div>
      {best && (
        <p className="mb-2 text-xs text-slate-500">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{best.name}</span> has led sectors
          over the past month ({formatPercent(best.oneMonthReturn)})
          {worst && (
            <>
              {" "}
              — <span className="font-medium text-red-600 dark:text-red-400">{worst.name}</span> has lagged (
              {formatPercent(worst.oneMonthReturn)})
            </>
          )}
          .
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {sectors.map((sector) => (
          <Link
            key={sector.symbol}
            href={`/sector/${sector.symbol}`}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{sector.name}</p>
            <p
              className={`mt-0.5 text-sm font-semibold ${
                sector.ok ? changeColorClass(sector.changePercent) : "text-slate-400 dark:text-slate-600"
              }`}
            >
              {sector.ok ? formatPercent(sector.changePercent) : "—"}
            </p>
            {sector.ok && (
              <p className={`mt-0.5 text-[11px] ${changeColorClass(sector.oneMonthReturn)}`}>
                {sector.oneMonthReturn == null ? "1M —" : `1M ${formatPercent(sector.oneMonthReturn)}`}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
