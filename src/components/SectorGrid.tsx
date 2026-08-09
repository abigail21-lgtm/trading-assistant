import Link from "next/link";
import type { QuoteResult } from "@/lib/market/yahoo";
import { changeColorClass, formatPercent } from "@/lib/format";

export default function SectorGrid({ sectors }: { sectors: QuoteResult[] }) {
  return (
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
        </Link>
      ))}
    </div>
  );
}
