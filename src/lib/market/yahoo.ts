import type { SymbolInfo } from "./symbols";

// Unofficial, keyless Yahoo Finance endpoints. No auth required for chart data,
// but Yahoo does rate-limit and occasionally blocks default fetch user agents,
// so we spoof a browser UA and fall back across their two query hosts.
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteSummary {
  symbol: string;
  shortName: string;
  longName: string;
  currency: string;
  exchangeName: string;
  regularMarketPrice: number | null;
  previousClose: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketVolume: number | null;
  regularMarketTime: number | null;
  marketState: string | null;
}

export interface ChartResult {
  meta: QuoteSummary;
  candles: Candle[];
}

export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`No data found for symbol "${symbol}"`);
    this.name = "SymbolNotFoundError";
  }
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string,
  revalidateSeconds: number,
) {
  let lastError: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        next: { revalidate: revalidateSeconds },
      });
      // Yahoo encodes "symbol not found" as a 404 with a JSON error body
      // (not just a bare non-2xx), so parse the body before giving up on
      // the response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        json = await res.json();
      } catch {
        lastError = new Error(`Yahoo Finance responded ${res.status} for ${symbol}`);
        continue;
      }
      const result = json?.chart?.result?.[0];
      const error = json?.chart?.error;
      if (error) {
        throw new SymbolNotFoundError(symbol);
      }
      if (!result) {
        lastError = new Error(`Empty chart result for ${symbol}`);
        continue;
      }
      return result;
    } catch (err) {
      if (err instanceof SymbolNotFoundError) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch chart data for ${symbol}`);
}

/**
 * Fetch OHLCV history + latest-quote metadata for a symbol from Yahoo Finance.
 * `range`/`interval` follow Yahoo's chart API vocabulary, e.g. range=6mo interval=1d.
 */
export async function getChart(
  symbol: string,
  range = "6mo",
  interval = "1d",
  revalidateSeconds = 300,
): Promise<ChartResult> {
  const result = await fetchYahooChart(symbol, range, interval, revalidateSeconds);
  const meta = result.meta ?? {};
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};

  const candles: Candle[] = timestamps
    .map((time, i) => ({
      time,
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
    }))
    .filter(
      (c): c is Candle =>
        c.open != null && c.high != null && c.low != null && c.close != null,
    );

  // Yahoo's `chartPreviousClose` is relative to the chart's lookback window,
  // not necessarily yesterday's close (e.g. it's ~6 months stale for a 6mo
  // range) — deriving from the last two candles is correct regardless of range.
  const previousClose: number | null =
    candles.length >= 2
      ? candles.at(-2)!.close
      : (meta.previousClose ?? meta.chartPreviousClose ?? null);
  const regularMarketPrice: number | null =
    meta.regularMarketPrice ?? candles.at(-1)?.close ?? null;
  const changeAbsolute =
    regularMarketPrice != null && previousClose != null
      ? regularMarketPrice - previousClose
      : null;
  const changePercent =
    changeAbsolute != null && previousClose ? (changeAbsolute / previousClose) * 100 : null;

  return {
    meta: {
      symbol: meta.symbol ?? symbol,
      shortName: meta.shortName ?? meta.symbol ?? symbol,
      longName: meta.longName ?? meta.shortName ?? symbol,
      currency: meta.currency ?? "USD",
      exchangeName: meta.exchangeName ?? "",
      regularMarketPrice,
      previousClose,
      changeAbsolute,
      changePercent,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      regularMarketVolume: meta.regularMarketVolume ?? null,
      regularMarketTime: meta.regularMarketTime ?? null,
      marketState: meta.marketState ?? null,
    },
    candles,
  };
}

export async function getQuoteSummary(
  symbol: string,
  revalidateSeconds = 300,
): Promise<QuoteSummary> {
  const { meta } = await getChart(symbol, "5d", "1d", revalidateSeconds);
  return meta;
}

export type QuoteResult =
  | (SymbolInfo & QuoteSummary & { ok: true })
  | (SymbolInfo & { ok: false; error: string });

export async function getManyQuoteSummaries(
  symbols: SymbolInfo[],
  revalidateSeconds = 300,
): Promise<QuoteResult[]> {
  const settled = await Promise.allSettled(
    symbols.map((s) => getQuoteSummary(s.symbol, revalidateSeconds)),
  );
  return symbols.map((s, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") {
      return { ...s, ...r.value, ok: true as const };
    }
    return { ...s, ok: false as const, error: String(r.reason?.message ?? r.reason) };
  });
}
