import { Suspense } from "react";
import Link from "next/link";
import { getManyQuoteSummariesWithTrend } from "@/lib/market/yahoo";
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

// Each data section streams in behind its own Suspense boundary, so the page
// (and the installed app, whose splash screen waits for the first paint)
// shows up immediately even when a free data source is slow.
export default function HomePage() {
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
                <Suspense fallback={null}>
                  <MarketSentiment />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={<Skeleton className="h-24" />}>
              <Indices />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Sectors
            </h2>
            <Suspense fallback={<Skeleton className="h-48" />}>
              <Sectors />
            </Suspense>
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

          <Suspense fallback={<Skeleton className="h-32" />}>
            <MarketNews />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function MarketSentiment() {
  const sentiment = await getSentiment("SPY").catch(() => null);
  return <SentimentBadge label="Sentiment" sentiment={sentiment} />;
}

async function Indices() {
  const indices = await getManyQuoteSummariesWithTrend(MAJOR_INDICES);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {indices.map((quote) => (
        <IndexCard key={quote.symbol} quote={quote} />
      ))}
    </div>
  );
}

async function Sectors() {
  const sectors = await getManyQuoteSummariesWithTrend(SECTORS);
  return <SectorGrid sectors={sectors} />;
}

async function MarketNews() {
  const news = await getMarketNews().catch(() => []);
  return <CollapsibleNewsSection items={news} title="Market News" />;
}

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 ${className}`}
    />
  );
}
