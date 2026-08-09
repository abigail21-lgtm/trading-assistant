import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManyQuoteSummaries, type QuoteResult } from "@/lib/market/yahoo";
import { MAJOR_INDICES, SECTORS } from "@/lib/market/symbols";
import IndexCard from "@/components/IndexCard";
import SectorGrid from "@/components/SectorGrid";
import WatchlistRow from "@/components/WatchlistRow";

async function getWatchlistQuotes(): Promise<QuoteResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watchlist")
    .select("symbol")
    .order("created_at", { ascending: true });

  const symbols = data?.map((row) => row.symbol) ?? [];
  if (symbols.length === 0) return [];

  return getManyQuoteSummaries(symbols.map((symbol) => ({ symbol, name: symbol })));
}

export default async function HomePage() {
  const [indices, sectors, watchlist] = await Promise.all([
    getManyQuoteSummaries(MAJOR_INDICES),
    getManyQuoteSummaries(SECTORS),
    getWatchlistQuotes(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
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
          <Link href="/stock" className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
            + Add stock
          </Link>
        </div>

        {watchlist.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center">
            <p className="text-sm text-slate-500">
              Star a stock from its page and it&apos;ll show up here.
            </p>
            <Link
              href="/stock"
              className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Search for a stock
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {watchlist.map((quote) => (
              <WatchlistRow key={quote.symbol} quote={quote} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
