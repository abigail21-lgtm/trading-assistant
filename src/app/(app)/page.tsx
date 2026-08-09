import Link from "next/link";
import { getManyQuoteSummaries } from "@/lib/market/yahoo";
import { MAJOR_INDICES, SECTORS } from "@/lib/market/symbols";
import IndexCard from "@/components/IndexCard";
import SectorGrid from "@/components/SectorGrid";
import WatchlistSection from "@/components/WatchlistSection";

export const revalidate = 300;

export default async function HomePage() {
  const [indices, sectors] = await Promise.all([
    getManyQuoteSummaries(MAJOR_INDICES),
    getManyQuoteSummaries(SECTORS),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 lg:px-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Market — Previous Close
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {indices.map((quote) => (
            <IndexCard key={quote.symbol} quote={quote} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sectors
        </h2>
        <SectorGrid sectors={sectors} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your Watchlist
          </h2>
          <Link href="/stock" className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300">
            + Add stock
          </Link>
        </div>

        <WatchlistSection />
      </section>
    </div>
  );
}
