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
  // A real one-line description of the article, when available -- not a
  // summary we generate, just Yahoo's own RSS description for the same
  // story. Null when no matching RSS entry was found.
  summary: string | null;
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

const MAX_SUMMARY_LENGTH = 220;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Yahoo's RSS headline feed (unlike its JSON search endpoint) includes a
 * real one-line description per story. Its `<guid>` is the same UUID as the
 * JSON search endpoint's `uuid` for the same article, so callers match this
 * map's keys against `NewsItem.id` to enrich search results with a summary.
 * Hand-rolled regex extraction rather than a full XML parser -- consistent
 * with how the rest of this codebase treats these free, unofficial
 * endpoints (minimal, no extra dependency for a handful of known fields).
 */
async function fetchNewsSummaries(symbols: string, revalidateSeconds: number): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbols)}&region=US&lang=en-US`;
    const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSeconds } });
    if (!res.ok) return map;
    const xml = await res.text();

    const itemPattern = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemPattern.exec(xml))) {
      const block = match[1];
      const guid = /<guid[^>]*>([^<]+)<\/guid>/.exec(block)?.[1]?.trim();
      const description = /<description>([\s\S]*?)<\/description>/.exec(block)?.[1];
      if (!guid || !description) continue;
      const decoded = decodeXmlEntities(description);
      if (!decoded) continue;
      map.set(
        guid,
        decoded.length > MAX_SUMMARY_LENGTH ? `${decoded.slice(0, MAX_SUMMARY_LENGTH).trimEnd()}…` : decoded,
      );
    }
  } catch {
    // No summaries is a fine fallback -- headlines alone still work.
  }
  return map;
}

// Yahoo's keyless search endpoint doubles as a news search — used both for
// a symbol's own news and (with a broad query) general market news.
async function fetchYahooNews(
  query: string,
  count: number,
  revalidateSeconds: number,
  summarySymbols: string,
): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`;
  const [res, summaries] = await Promise.all([
    fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSeconds } }),
    fetchNewsSummaries(summarySymbols, revalidateSeconds),
  ]);
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
      const id = n.uuid ?? n.link;
      return {
        id,
        title: n.title,
        publisher: n.publisher ?? "",
        link: n.link,
        publishedAt: n.providerPublishTime ?? 0,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
        tone: classifyHeadline(n.title),
        summary: summaries.get(id) ?? null,
      };
    })
    .filter((n): n is NewsItem => n !== null);
}

export async function getStockNews(symbol: string, count = 8): Promise<NewsItem[]> {
  return fetchYahooNews(symbol, count, 900, symbol);
}

export async function getMarketNews(count = 8): Promise<NewsItem[]> {
  // Query the JSON search endpoint and the RSS summary feed with the same
  // symbol (S&P 500) rather than a free-text query -- their uuids/guids
  // only reliably line up when both sides are scoped to the same symbol.
  return fetchYahooNews("^GSPC", count, 900, "^GSPC");
}
