import Link from "next/link";
import { getManyQuoteSummaries } from "@/lib/market/yahoo";
import { MAJOR_INDICES, SECTORS } from "@/lib/market/symbols";
import { getSentiment } from "@/lib/market/sentiment";
import { getMarketNews } from "@/lib/market/news";
import IndexCard from "@/components/IndexCard";
import SectorGrid from "@/components/SectorGrid";
import WatchlistSection from "@/components/WatchlistSection";
import WatchlistCalendarSection from "@/components/WatchlistCalendarSection";
import AlertsOverview from "@/components/AlertsOverview";
import CollapsibleNewsSection from "@/components/CollapsibleNewsSection";
import { SentimentBadge } from "@/components/SentimentCard";

export const revalidate = 300;

export default async function HomePage() {
  const [indices, sectors, marketSentiment, marketNews] = await Promise.all([
    getManyQuoteSummaries(MAJOR_INDICES),
    getManyQuoteSummaries(SECTORS),
    getSentiment("SPY").catch(() => null),
    getMarketNews().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Market — Previous Close
              </h2>
              <div className="w-40">
                <SentimentBadge label="Sentiment" sentiment={marketSentiment} />
              </div>
            </div>
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
              <Link
                href="/stock"
                className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                + Add stock
              </Link>
            </div>
            <WatchlistSection />
          </section>
        </div>

        <div className="space-y-8">
          <AlertsOverview />
          <WatchlistCalendarSection />

          <CollapsibleNewsSection items={marketNews} title="Market News" />
        </div>
      </div>
    </div>
  );
}
