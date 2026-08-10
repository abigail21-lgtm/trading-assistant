import { BROWSER_HEADERS, timeoutSignal } from "./http";

export interface SentimentSummary {
  symbol: string;
  bullish: number;
  bearish: number;
  taggedTotal: number;
  sampledMessages: number;
  bullishPercent: number | null;
  label: "Bullish" | "Bearish" | "Neutral" | "Unknown";
}

// Aggregates StockTwits' per-message bullish/bearish tags for a symbol into
// a rough sentiment read. Works for individual stocks as well as sector ETFs
// and a market proxy (e.g. SPY) — StockTwits has an active stream for all of
// them, so no separate "sector/market sentiment" logic is needed.
export async function getSentiment(symbol: string): Promise<SentimentSummary | null> {
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 1800 },
      signal: timeoutSignal(8000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const messages: unknown[] = json?.messages ?? [];
  let bullish = 0;
  let bearish = 0;
  for (const raw of messages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = (raw as any)?.entities?.sentiment?.basic;
    if (tag === "Bullish") bullish++;
    else if (tag === "Bearish") bearish++;
  }

  const taggedTotal = bullish + bearish;
  const bullishPercent = taggedTotal > 0 ? (bullish / taggedTotal) * 100 : null;

  let label: SentimentSummary["label"] = "Unknown";
  if (taggedTotal >= 3 && bullishPercent != null) {
    if (bullishPercent >= 60) label = "Bullish";
    else if (bullishPercent <= 40) label = "Bearish";
    else label = "Neutral";
  }

  return {
    symbol: symbol.toUpperCase(),
    bullish,
    bearish,
    taggedTotal,
    sampledMessages: messages.length,
    bullishPercent,
    label,
  };
}
