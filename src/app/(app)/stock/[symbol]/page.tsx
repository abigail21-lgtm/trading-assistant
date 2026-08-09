import { Suspense } from "react";
import Link from "next/link";
import { getChart, getQuoteSummary, SymbolNotFoundError, type Candle } from "@/lib/market/yahoo";
import { TIMEFRAMES, DEFAULT_TIMEFRAME_KEY, getTimeframe, rangeLabel, type Timeframe } from "@/lib/market/timeframes";
import { getCompanyFacts } from "@/lib/market/ratings";
import { getNextEarnings } from "@/lib/market/calendar";
import { getSentiment } from "@/lib/market/sentiment";
import { getStockNews } from "@/lib/market/news";
import { computePeriodReturn } from "@/lib/market/comparison";
import { sectorNameToEtf } from "@/lib/market/symbols";
import { analyzePriceAction, type PriceAnalysis } from "@/lib/market/analysis";
import { buildDeepDivePoints } from "@/lib/market/deepdive";
import { sma } from "@/lib/market/indicators";
import { changeColorClass, formatCompactNumber, formatPercent, formatPrice } from "@/lib/format";
import StockChart from "@/components/StockChart";
import StarButton from "@/components/StarButton";
import PerformanceComparisonCard from "@/components/PerformanceComparisonCard";
import CompanyFactsCard from "@/components/CompanyFactsCard";
import SentimentCard from "@/components/SentimentCard";
import UpcomingEarningsCard from "@/components/UpcomingEarningsCard";
import EarningsProximityBanner from "@/components/EarningsProximityBanner";
import CollapsibleNewsSection from "@/components/CollapsibleNewsSection";
import PriceAnalysisCard from "@/components/PriceAnalysisCard";
import HistoricalVolatilityCard from "@/components/HistoricalVolatilityCard";
import { computeHistoricalVolatility } from "@/lib/market/volatility";
import ShortInterestCard from "@/components/ShortInterestCard";
import { getShortInterestHistory, summarizeShortInterest } from "@/lib/market/short-interest";
import InsiderActivityCard from "@/components/InsiderActivityCard";
import { getInsiderActivity } from "@/lib/market/insider";
import AlertsPanel from "@/components/AlertsPanel";
import DeepDiveCard from "@/components/DeepDiveCard";

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const { tf: rawTf } = await searchParams;
  const tfKey = TIMEFRAMES.some((t) => t.key === rawTf) ? rawTf! : DEFAULT_TIMEFRAME_KEY;
  const timeframe = getTimeframe(tfKey);

  let quote, chart;
  try {
    // The header stats always come from a fixed 5-day daily fetch (accurate
    // "previous close" regardless of which candle size is selected for the
    // chart itself — see getQuoteSummary).
    [quote, chart] = await Promise.all([
      getQuoteSummary(symbol),
      getChart(symbol, timeframe.range, timeframe.interval),
    ]);
  } catch (err) {
    const notFound = err instanceof SymbolNotFoundError;
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
          {notFound ? `No data for "${symbol}"` : "Couldn't load that stock"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {notFound ? "Double-check the ticker symbol." : "Market data is temporarily unavailable."}
        </p>
        <Link
          href="/stock"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Try another symbol
        </Link>
      </div>
    );
  }

  const { candles } = chart;
  const analysis = analyzePriceAction(candles);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{quote.symbol}</h1>
          <p className="truncate text-sm text-slate-500">
            {quote.longName} · {quote.exchangeName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/compare?symbols=${symbol},SPY`}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200"
          >
            Compare
          </Link>
          <a
            href={`https://finance.yahoo.com/quote/${symbol}/options/`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200"
          >
            Options chain ↗
          </a>
          <StarButton symbol={quote.symbol} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          {formatPrice(quote.regularMarketPrice, quote.currency)}
        </span>
        <span className={`text-base font-medium ${changeColorClass(quote.changePercent)}`}>
          {quote.changeAbsolute != null && formatPrice(quote.changeAbsolute, quote.currency)}{" "}
          ({formatPercent(quote.changePercent)})
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Day Range" value={`${formatPrice(quote.dayLow, quote.currency)} – ${formatPrice(quote.dayHigh, quote.currency)}`} />
        <Stat label="52-Week Range" value={`${formatPrice(quote.fiftyTwoWeekLow, quote.currency)} – ${formatPrice(quote.fiftyTwoWeekHigh, quote.currency)}`} />
        <Stat label="Volume" value={formatCompactNumber(quote.regularMarketVolume)} />
        <Stat label="Previous Close" value={formatPrice(quote.previousClose, quote.currency)} />
      </dl>

      <Suspense fallback={null}>
        <EarningsBannerSection symbol={symbol} />
      </Suspense>

      {/* On mobile this is a single column following DOM order: chart, then
          the at-a-glance sidebar cards, then news. At lg+, explicit grid
          placement makes the sidebar span both rows so it runs the full
          height beside chart + news instead of leaving a gap underneath. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3 lg:grid-rows-[auto_auto]">
        <div className="lg:col-start-1 lg:col-span-2 lg:row-start-1">
          <div className="flex gap-1 overflow-x-auto">
            {TIMEFRAMES.map((t) => (
              <Link
                key={t.key}
                href={`/stock/${symbol}?tf=${t.key}`}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                  t.key === timeframe.key
                    ? "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 h-[380px] rounded-xl border border-slate-200 bg-white p-2 sm:h-[460px] lg:h-[560px] dark:border-slate-800 dark:bg-slate-900">
            <StockChart
              candles={candles}
              intraday={timeframe.intraday}
              symbol={symbol}
              timeframeKey={timeframe.key}
              levels={analysis.levels}
            />
          </div>
        </div>

        <div className="space-y-4 lg:col-start-3 lg:row-start-1 lg:row-span-2">
          <PriceAnalysisCard analysis={analysis} currency={quote.currency} />
          <Suspense fallback={null}>
            <DeepDiveSection
              symbol={symbol}
              timeframe={timeframe}
              candles={candles}
              analysis={analysis}
              currentPrice={quote.regularMarketPrice}
              currency={quote.currency}
            />
          </Suspense>
          <AlertsPanel symbol={symbol} currentPrice={quote.regularMarketPrice} />
          <Suspense fallback={<CardSkeleton />}>
            <ComparisonSection symbol={symbol} timeframe={timeframe} candles={candles} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <VolatilitySection symbol={symbol} />
          </Suspense>
          <Suspense fallback={null}>
            <ShortInterestSection symbol={symbol} />
          </Suspense>
          <Suspense fallback={null}>
            <InsiderActivitySection symbol={symbol} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <CompanyFactsSection symbol={symbol} currentPrice={quote.regularMarketPrice} currency={quote.currency} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <SentimentSection symbol={symbol} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <NextEarningsSection symbol={symbol} />
          </Suspense>
        </div>

        <section className="lg:col-start-1 lg:col-span-2 lg:row-start-2">
          <Suspense fallback={<CardSkeleton />}>
            <NewsSection symbol={symbol} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

// Each of these fetches independently and streams into its own Suspense
// boundary, so a slow or unavailable free data source (the earnings
// calendar in particular can mean dozens of upstream requests) never blocks
// the core price/chart from rendering.

async function ComparisonSection({
  symbol,
  timeframe,
  candles,
}: {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}) {
  const companyFacts = await getCompanyFacts(symbol).catch(() => null);
  const sectorEtf = sectorNameToEtf(companyFacts?.sector);
  const [marketChart, sectorChart] = await Promise.all([
    getChart("SPY", timeframe.range, timeframe.interval).catch(() => null),
    sectorEtf
      ? getChart(sectorEtf.symbol, timeframe.range, timeframe.interval).catch(() => null)
      : Promise.resolve(null),
  ]);

  const stockReturn = computePeriodReturn(candles, symbol, symbol);
  const marketReturn = marketChart
    ? computePeriodReturn(marketChart.candles, "SPY", "S&P 500 (SPY)")
    : { symbol: "SPY", name: "S&P 500 (SPY)", returnPercent: null };
  const sectorReturn =
    sectorChart && sectorEtf ? computePeriodReturn(sectorChart.candles, sectorEtf.symbol, sectorEtf.name) : null;

  return (
    <PerformanceComparisonCard
      stock={stockReturn}
      market={marketReturn}
      sector={sectorReturn}
      periodLabel={rangeLabel(timeframe.range)}
    />
  );
}

async function VolatilitySection({ symbol }: { symbol: string }) {
  // Always daily candles here regardless of the chart's selected timeframe —
  // annualizing from anything other than daily returns wouldn't be meaningful.
  const chart = await getChart(symbol, "6mo", "1d").catch(() => null);
  if (!chart) return null;
  return <HistoricalVolatilityCard windows={computeHistoricalVolatility(chart.candles)} />;
}

async function ShortInterestSection({ symbol }: { symbol: string }) {
  const rows = await getShortInterestHistory(symbol).catch(() => []);
  return <ShortInterestCard summary={summarizeShortInterest(rows)} />;
}

async function InsiderActivitySection({ symbol }: { symbol: string }) {
  const summary = await getInsiderActivity(symbol).catch(() => null);
  return <InsiderActivityCard summary={summary} />;
}

async function CompanyFactsSection({
  symbol,
  currentPrice,
  currency,
}: {
  symbol: string;
  currentPrice: number | null;
  currency: string;
}) {
  const facts = await getCompanyFacts(symbol).catch(() => null);
  if (!facts) return null;
  return <CompanyFactsCard facts={facts} currentPrice={currentPrice} currency={currency} />;
}

async function SentimentSection({ symbol }: { symbol: string }) {
  const companyFacts = await getCompanyFacts(symbol).catch(() => null);
  const sectorEtf = sectorNameToEtf(companyFacts?.sector);
  const [stock, sector, market] = await Promise.all([
    getSentiment(symbol).catch(() => null),
    sectorEtf ? getSentiment(sectorEtf.symbol).catch(() => null) : Promise.resolve(null),
    getSentiment("SPY").catch(() => null),
  ]);
  return <SentimentCard symbol={symbol} stock={stock} sector={sector} market={market} />;
}

// Recomputes several signals other sections on this page already fetch
// (Next dedupes identical fetch calls within a render, so this costs no
// extra network requests) and combines them into a few plain-language
// observations behind an optional "see more" -- see buildDeepDivePoints.
async function DeepDiveSection({
  symbol,
  timeframe,
  candles,
  analysis,
  currentPrice,
  currency,
}: {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  analysis: PriceAnalysis;
  currentPrice: number | null;
  currency: string;
}) {
  const companyFacts = await getCompanyFacts(symbol).catch(() => null);
  const sectorEtf = sectorNameToEtf(companyFacts?.sector);

  const [marketChart, sectorChart, stockSentiment, marketSentiment, news, dailyChart] = await Promise.all([
    getChart("SPY", timeframe.range, timeframe.interval).catch(() => null),
    sectorEtf
      ? getChart(sectorEtf.symbol, timeframe.range, timeframe.interval).catch(() => null)
      : Promise.resolve(null),
    getSentiment(symbol).catch(() => null),
    getSentiment("SPY").catch(() => null),
    getStockNews(symbol).catch(() => []),
    getChart(symbol, "6mo", "1d").catch(() => null),
  ]);

  const stockReturn = computePeriodReturn(candles, symbol, symbol);
  const marketReturn = marketChart ? computePeriodReturn(marketChart.candles, "SPY", "S&P 500") : null;
  const sectorReturn =
    sectorChart && sectorEtf ? computePeriodReturn(sectorChart.candles, sectorEtf.symbol, sectorEtf.name) : null;
  const volatility = dailyChart ? computeHistoricalVolatility(dailyChart.candles) : null;

  const lastCandle = candles.at(-1) ?? null;
  const avgVolume20 = dailyChart ? (sma(dailyChart.candles.map((c) => c.volume), 20).at(-1) ?? null) : null;

  const points = buildDeepDivePoints({
    analysis,
    currentPrice,
    currency,
    periodLabel: rangeLabel(timeframe.range),
    stockReturn,
    marketReturn,
    sectorReturn,
    volatility,
    stockSentiment,
    marketSentiment,
    bullishNewsCount: news.filter((n) => n.tone === "bullish").length,
    bearishNewsCount: news.filter((n) => n.tone === "bearish").length,
    newsCount: news.length,
    latestVolume: lastCandle?.volume ?? null,
    avgVolume20,
  });

  return <DeepDiveCard points={points} />;
}

async function NextEarningsSection({ symbol }: { symbol: string }) {
  const event = await getNextEarnings(symbol).catch(() => null);
  return <UpcomingEarningsCard event={event} />;
}

async function EarningsBannerSection({ symbol }: { symbol: string }) {
  const event = await getNextEarnings(symbol).catch(() => null);
  return <EarningsProximityBanner event={event} />;
}

async function NewsSection({ symbol }: { symbol: string }) {
  const news = await getStockNews(symbol).catch(() => []);
  return <CollapsibleNewsSection items={news} />;
}

function CardSkeleton() {
  return (
    <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60" />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
