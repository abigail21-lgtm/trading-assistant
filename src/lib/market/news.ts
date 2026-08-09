import { BROWSER_HEADERS } from "./http";

export type HeadlineTone = "bullish" | "bearish" | "neutral";

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number; // unix seconds
  thumbnail: string | null;
  tone: HeadlineTone;
}

// Rough, headline-only keyword read — not real sentiment analysis. Good
// enough to flag "probably worth a look" at a glance, not to trust blindly.
const BULLISH_WORDS = [
  "upgrade", "upgraded", "beats", "beat", "raises", "raised", "surge", "surges", "soar", "soars",
  "jumps", "rally", "rallies", "outperform", "record high", "all-time high", "bullish", "tops",
  "gains", "gain", "climb", "climbs", "buy rating", "strong buy", "profit rise", "wins",
];
const BEARISH_WORDS = [
  "downgrade", "downgraded", "misses", "miss", "cuts", "cut", "plunge", "plunges", "slump",
  "falls", "fall", "drops", "drop", "underperform", "lawsuit", "investigation", "recall",
  "bearish", "warns", "warning", "loss", "losses", "layoffs", "sell rating", "sinks", "tumbles",
  "probe", "fraud", "delisted",
];

function classifyHeadline(title: string): HeadlineTone {
  const lower = title.toLowerCase();
  const bullish = BULLISH_WORDS.some((w) => lower.includes(w));
  const bearish = BEARISH_WORDS.some((w) => lower.includes(w));
  if (bullish && !bearish) return "bullish";
  if (bearish && !bullish) return "bearish";
  return "neutral";
}

// Yahoo's keyless search endpoint doubles as a news search — used both for
// a symbol's own news and (with a broad query) general market news.
async function fetchYahooNews(query: string, count: number, revalidateSeconds: number): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`;
  const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSeconds } });
  if (!res.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const items: unknown[] = json?.news ?? [];
  return items
    .map((raw): NewsItem | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = raw as any;
      if (!n.title || !n.link) return null;
      return {
        id: n.uuid ?? n.link,
        title: n.title,
        publisher: n.publisher ?? "",
        link: n.link,
        publishedAt: n.providerPublishTime ?? 0,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
        tone: classifyHeadline(n.title),
      };
    })
    .filter((n): n is NewsItem => n !== null);
}

export async function getStockNews(symbol: string, count = 8): Promise<NewsItem[]> {
  return fetchYahooNews(symbol, count, 900);
}

export async function getMarketNews(count = 8): Promise<NewsItem[]> {
  return fetchYahooNews("stock market", count, 900);
}
